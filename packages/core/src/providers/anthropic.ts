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

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | Array<{
    type: 'text' | 'image';
    text?: string;
    source?: {
      type: 'base64';
      media_type: string;
      data: string;
    };
  }>;
}

interface AnthropicResponse {
  id: string;
  type: string;
  role: string;
  content: Array<{
    type: 'text';
    text: string;
  }>;
  model: string;
  stop_reason: string | null;
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

interface AnthropicStreamEvent {
  type: string;
  index?: number;
  delta?: {
    type: string;
    text?: string;
    stop_reason?: string;
    stop_sequence?: string | null;
  };
  message?: AnthropicResponse;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

export class AnthropicProvider implements LLMProvider {
  name = 'Anthropic';
  type: 'api' = 'api';
  private apiKey: string;
  private baseUrl: string;
  private defaultModel: string;
  private apiVersion = '2023-06-01';

  constructor(config?: ProviderConfig) {
    // Check for API key in config, settings, or environment
    this.apiKey = config?.apiKey || 
                 config?.settings?.apiKeys?.anthropic ||
                 process.env['ANTHROPIC_API_KEY'] || '';
    this.baseUrl = config?.baseUrl || 'https://api.anthropic.com/v1';
    this.defaultModel = config?.defaultModel || 'claude-3-opus-20240229';
  }

  async initialize(): Promise<void> {
    if (!this.apiKey) {
      throw new Error(
        'Anthropic API key not found. Please set ANTHROPIC_API_KEY environment variable or provide it in config.'
      );
    }
  }

  async isAvailable(): Promise<boolean> {
    return !!this.apiKey;
  }

  async listModels(): Promise<ModelInfo[]> {
    // Anthropic doesn't have a models endpoint, so we return a static list
    return [
      {
        id: 'claude-3-opus-20240229',
        name: 'Claude 3 Opus',
        description: 'Most capable model for complex tasks',
        contextLength: 200000,
        provider: 'anthropic',
        capabilities: {
          vision: true,
          functionCalling: true,
          streaming: true,
        },
      },
      {
        id: 'claude-3-5-sonnet-20241022',
        name: 'Claude 3.5 Sonnet',
        description: 'Best balance of performance and speed',
        contextLength: 200000,
        provider: 'anthropic',
        capabilities: {
          vision: true,
          functionCalling: true,
          streaming: true,
        },
      },
      {
        id: 'claude-3-5-haiku-20241022',
        name: 'Claude 3.5 Haiku',
        description: 'Fast and efficient for simple tasks',
        contextLength: 200000,
        provider: 'anthropic',
        capabilities: {
          vision: true,
          functionCalling: true,
          streaming: true,
        },
      },
      {
        id: 'claude-3-sonnet-20240229',
        name: 'Claude 3 Sonnet',
        description: 'Balanced performance model',
        contextLength: 200000,
        provider: 'anthropic',
        capabilities: {
          vision: true,
          functionCalling: true,
          streaming: true,
        },
      },
      {
        id: 'claude-3-haiku-20240307',
        name: 'Claude 3 Haiku',
        description: 'Fastest model for simple tasks',
        contextLength: 200000,
        provider: 'anthropic',
        capabilities: {
          vision: true,
          functionCalling: true,
          streaming: true,
        },
      },
    ];
  }

  async generateContent(
    model: string,
    messages: Message[],
    options?: GenerateOptions
  ): Promise<GenerateResponse> {
    const { system, anthropicMessages } = this.convertMessages(messages);
    
    const body: any = {
      model: model || this.defaultModel,
      messages: anthropicMessages,
      max_tokens: options?.maxTokens || 4096,
      temperature: options?.temperature,
      top_p: options?.topP,
      top_k: options?.topK,
      stop_sequences: options?.stopSequences,
      stream: false,
    };

    if (system) {
      body.system = system;
    }

    // Handle function calling via tools
    if (options?.functions && options.functions.length > 0) {
      body.tools = options.functions.map(func => ({
        name: func.name,
        description: func.description,
        input_schema: func.parameters,
      }));
    }

    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${error}`);
    }

    const data: AnthropicResponse = await response.json();

    return {
      content: data.content[0]?.text || '',
      usage: {
        promptTokens: data.usage.input_tokens,
        completionTokens: data.usage.output_tokens,
        totalTokens: data.usage.input_tokens + data.usage.output_tokens,
      },
      finishReason: this.mapStopReason(data.stop_reason),
    };
  }

  async *streamContent(
    model: string,
    messages: Message[],
    options?: GenerateOptions
  ): AsyncGenerator<GenerateResponse> {
    const { system, anthropicMessages } = this.convertMessages(messages);
    
    const body: any = {
      model: model || this.defaultModel,
      messages: anthropicMessages,
      max_tokens: options?.maxTokens || 4096,
      temperature: options?.temperature,
      top_p: options?.topP,
      top_k: options?.topK,
      stop_sequences: options?.stopSequences,
      stream: true,
    };

    if (system) {
      body.system = system;
    }

    if (options?.functions && options.functions.length > 0) {
      body.tools = options.functions.map(func => ({
        name: func.name,
        description: func.description,
        input_schema: func.parameters,
      }));
    }

    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${error}`);
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
        if (line.trim() === '') continue;
        
        if (line.startsWith('data: ')) {
          const dataStr = line.slice(6);
          if (dataStr === '[DONE]') continue;
          
          try {
            const data: AnthropicStreamEvent = JSON.parse(dataStr);
            
            if (data.type === 'content_block_delta' && data.delta?.text) {
              yield {
                content: data.delta.text,
                finishReason: undefined,
              };
            } else if (data.type === 'message_delta' && data.delta?.stop_reason) {
              yield {
                content: '',
                finishReason: this.mapStopReason(data.delta.stop_reason),
              };
            }
          } catch (error) {
            console.error('Failed to parse Anthropic stream event:', error);
          }
        }
      }
    }
  }

  private getHeaders(): HeadersInit {
    return {
      'Content-Type': 'application/json',
      'x-api-key': this.apiKey,
      'anthropic-version': this.apiVersion,
    };
  }

  private convertMessages(messages: Message[]): {
    system: string | undefined;
    anthropicMessages: AnthropicMessage[];
  } {
    let system: string | undefined;
    const anthropicMessages: AnthropicMessage[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        // Anthropic handles system messages separately
        system = typeof msg.content === 'string' 
          ? msg.content 
          : this.contentToString(msg.content);
      } else if (msg.role === 'user' || msg.role === 'assistant') {
        anthropicMessages.push({
          role: msg.role,
          content: typeof msg.content === 'string' 
            ? msg.content 
            : this.convertContent(msg.content),
        });
      } else if (msg.role === 'function') {
        // Convert function messages to assistant messages
        anthropicMessages.push({
          role: 'assistant',
          content: `Function ${msg.name}: ${typeof msg.content === 'string' 
            ? msg.content 
            : JSON.stringify(msg.content)}`,
        });
      }
    }

    return { system, anthropicMessages };
  }

  private convertContent(content: any[]): any {
    const converted = [];
    
    for (const item of content) {
      if (item.type === 'text') {
        converted.push({
          type: 'text',
          text: item.text,
        });
      } else if (item.type === 'image' && item.image) {
        // Convert image to Anthropic format
        if (item.image.url.startsWith('data:')) {
          const [mimeInfo, base64Data] = item.image.url.split(',');
          const mimeType = mimeInfo.match(/data:([^;]+)/)?.[1] || 'image/jpeg';
          
          converted.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: mimeType,
              data: base64Data,
            },
          });
        }
      }
    }

    return converted.length > 0 ? converted : '';
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

  private mapStopReason(reason: string | null): 'stop' | 'length' | 'function_call' | 'error' {
    switch (reason) {
      case 'end_turn':
      case 'stop_sequence':
        return 'stop';
      case 'max_tokens':
        return 'length';
      case 'tool_use':
        return 'function_call';
      default:
        return 'stop';
    }
  }
}