/**
 * @license
 * Copyright 2025 WooCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  LLMProvider,
  ModelInfo,
  Message,
  GenerateOptions,
  GenerateResponse,
  ProviderConfig,
} from './types.js';

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'function';
  content: string | null;
  name?: string;
  function_call?: {
    name: string;
    arguments: string;
  };
}

interface OpenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string | null;
      function_call?: {
        name: string;
        arguments: string;
      };
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface OpenAIStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string | null;
      function_call?: {
        name?: string;
        arguments?: string;
      };
    };
    finish_reason?: string | null;
  }>;
}

export class OpenAIProvider implements LLMProvider {
  name = 'OpenAI';
  type: 'api' = 'api';
  private apiKey: string;
  private baseUrl: string;
  private defaultModel: string;
  private organization?: string;

  constructor(config?: ProviderConfig) {
    // Check for API key in config, settings, or environment
    this.apiKey = config?.apiKey || 
                 config?.settings?.apiKeys?.openai ||
                 process.env['OPENAI_API_KEY'] || '';
    this.baseUrl = config?.baseUrl || 'https://api.openai.com/v1';
    this.defaultModel = config?.defaultModel || 'gpt-4-turbo-preview';
    this.organization = config?.options?.['organization'] || process.env['OPENAI_ORGANIZATION'];
  }

  async initialize(): Promise<void> {
    if (!this.apiKey) {
      throw new Error(
        'OpenAI API key not found. Please set OPENAI_API_KEY environment variable or provide it in config.'
      );
    }
  }

  async isAvailable(): Promise<boolean> {
    if (!this.apiKey) {
      return false;
    }

    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: this.getHeaders(),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Failed to list models: ${response.statusText}`);
      }

      const data = await response.json();
      const models = data.data || [];

      // Filter for chat models
      const chatModels = models.filter((model: any) => 
        model.id.includes('gpt') || 
        model.id.includes('o1') ||
        model.id.includes('chatgpt')
      );

      return chatModels.map((model: any) => ({
        id: model.id,
        name: model.id,
        description: this.getModelDescription(model.id),
        provider: 'openai',
        contextLength: this.getContextLength(model.id),
        capabilities: {
          vision: model.id.includes('vision') || model.id.includes('gpt-4-turbo'),
          functionCalling: !model.id.includes('o1'), // o1 models don't support function calling
          streaming: true,
        },
      }));
    } catch (error) {
      console.error('Failed to list OpenAI models:', error);
      return this.getDefaultModels();
    }
  }

  async generateContent(
    model: string,
    messages: Message[],
    options?: GenerateOptions
  ): Promise<GenerateResponse> {
    const openaiMessages = this.convertMessages(messages);
    
    const body: any = {
      model: model || this.defaultModel,
      messages: openaiMessages,
      temperature: options?.temperature,
      top_p: options?.topP,
      max_tokens: options?.maxTokens,
      stop: options?.stopSequences,
      stream: false,
    };

    // Add functions if provided
    if (options?.functions && options.functions.length > 0) {
      body.functions = options.functions.map(func => ({
        name: func.name,
        description: func.description,
        parameters: func.parameters,
      }));
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

    const data: OpenAIResponse = await response.json();
    const choice = data.choices[0];

    const functionCalls = choice.message.function_call ? [{
      name: choice.message.function_call.name,
      arguments: JSON.parse(choice.message.function_call.arguments),
    }] : undefined;

    return {
      content: choice.message.content || '',
      functionCalls,
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      } : undefined,
      finishReason: this.mapFinishReason(choice.finish_reason),
    };
  }

  async *streamContent(
    model: string,
    messages: Message[],
    options?: GenerateOptions
  ): AsyncGenerator<GenerateResponse> {
    const openaiMessages = this.convertMessages(messages);
    
    const body: any = {
      model: model || this.defaultModel,
      messages: openaiMessages,
      temperature: options?.temperature,
      top_p: options?.topP,
      max_tokens: options?.maxTokens,
      stop: options?.stopSequences,
      stream: true,
    };

    if (options?.functions && options.functions.length > 0) {
      body.functions = options.functions;
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Response body is not readable');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim() === '' || line.trim() === 'data: [DONE]') {
          continue;
        }

        if (line.startsWith('data: ')) {
          try {
            const data: OpenAIStreamChunk = JSON.parse(line.slice(6));
            const choice = data.choices[0];
            
            if (choice.delta.content) {
              yield {
                content: choice.delta.content,
                finishReason: choice.finish_reason ? 
                  this.mapFinishReason(choice.finish_reason) : undefined,
              };
            }
          } catch (error) {
            console.error('Failed to parse OpenAI stream chunk:', error);
          }
        }
      }
    }
  }

  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
    };

    if (this.organization) {
      headers['OpenAI-Organization'] = this.organization;
    }

    return headers;
  }

  private convertMessages(messages: Message[]): OpenAIMessage[] {
    return messages.map((msg) => {
      const openaiMsg: OpenAIMessage = {
        role: msg.role,
        content: typeof msg.content === 'string' 
          ? msg.content 
          : this.contentToString(msg.content),
      };

      if (msg.name) {
        openaiMsg.name = msg.name;
      }

      return openaiMsg;
    });
  }

  private contentToString(content: any[]): string {
    return content
      .map((c) => {
        if (c.type === 'text') return c.text;
        if (c.type === 'image') return '[Image]';
        if (c.type === 'function_call') {
          return `Function call: ${c.functionCall.name}`;
        }
        if (c.type === 'function_result') {
          return `Function result: ${JSON.stringify(c.functionResult.result)}`;
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }

  private mapFinishReason(reason: string): 'stop' | 'length' | 'function_call' | 'error' {
    switch (reason) {
      case 'stop':
        return 'stop';
      case 'length':
        return 'length';
      case 'function_call':
        return 'function_call';
      default:
        return 'stop';
    }
  }

  private getModelDescription(modelId: string): string {
    const descriptions: Record<string, string> = {
      'gpt-4-turbo-preview': 'Latest GPT-4 Turbo with 128K context',
      'gpt-4-turbo': 'GPT-4 Turbo with vision capabilities',
      'gpt-4': 'Original GPT-4 model',
      'gpt-3.5-turbo': 'Fast and efficient GPT-3.5',
      'o1-preview': 'Advanced reasoning model (preview)',
      'o1-mini': 'Smaller, faster reasoning model',
    };
    return descriptions[modelId] || 'OpenAI language model';
  }

  private getContextLength(modelId: string): number {
    const contextLengths: Record<string, number> = {
      'gpt-4-turbo-preview': 128000,
      'gpt-4-turbo': 128000,
      'gpt-4': 8192,
      'gpt-4-32k': 32768,
      'gpt-3.5-turbo': 16385,
      'o1-preview': 128000,
      'o1-mini': 128000,
    };
    return contextLengths[modelId] || 4096;
  }

  private getDefaultModels(): ModelInfo[] {
    return [
      {
        id: 'gpt-4-turbo-preview',
        name: 'GPT-4 Turbo',
        description: 'Latest GPT-4 Turbo with 128K context',
        contextLength: 128000,
        provider: 'openai',
        capabilities: {
          vision: true,
          functionCalling: true,
          streaming: true,
        },
      },
      {
        id: 'gpt-3.5-turbo',
        name: 'GPT-3.5 Turbo',
        description: 'Fast and efficient GPT-3.5',
        contextLength: 16385,
        provider: 'openai',
        capabilities: {
          vision: false,
          functionCalling: true,
          streaming: true,
        },
      },
      {
        id: 'o1-preview',
        name: 'o1 Preview',
        description: 'Advanced reasoning model',
        contextLength: 128000,
        provider: 'openai',
        capabilities: {
          vision: false,
          functionCalling: false,
          streaming: true,
        },
      },
    ];
  }
}