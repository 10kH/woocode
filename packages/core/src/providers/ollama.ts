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

interface OllamaModel {
  name: string;
  modified_at: string;
  size: number;
  digest: string;
  details?: {
    format: string;
    family: string;
    families: string[];
    parameter_size: string;
    quantization_level: string;
  };
}

interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  images?: string[]; // base64 encoded images
}

interface OllamaGenerateRequest {
  model: string;
  messages: OllamaMessage[];
  stream?: boolean;
  format?: 'json';
  options?: {
    temperature?: number;
    top_p?: number;
    top_k?: number;
    num_predict?: number;
    stop?: string[];
  };
}

interface OllamaGenerateResponse {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

export class OllamaProvider implements LLMProvider {
  name = 'Ollama';
  type: 'local' = 'local';
  private baseUrl: string;
  private defaultModel?: string;

  constructor(config?: ProviderConfig) {
    this.baseUrl = config?.baseUrl || 'http://localhost:11434';
    this.defaultModel = config?.defaultModel;
  }

  async initialize(): Promise<void> {
    // Check if Ollama is running
    const available = await this.isAvailable();
    if (!available) {
      throw new Error(
        'Ollama is not running. Please start Ollama with: ollama serve'
      );
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      return response.ok;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (!response.ok) {
        throw new Error(`Failed to list models: ${response.statusText}`);
      }

      const data = await response.json();
      const models: OllamaModel[] = data.models || [];

      return models.map((model) => ({
        id: model.name,
        name: model.name,
        description: `${model.details?.parameter_size || 'Unknown size'} ${
          model.details?.family || ''
        } model`,
        provider: 'ollama',
        capabilities: {
          vision: model.name.includes('vision') || model.name.includes('llava'),
          functionCalling: false, // Ollama doesn't natively support function calling yet
          streaming: true,
        },
      }));
    } catch (error) {
      console.error('Failed to list Ollama models:', error);
      return [];
    }
  }

  async generateContent(
    model: string,
    messages: Message[],
    options?: GenerateOptions
  ): Promise<GenerateResponse> {
    const ollamaMessages = this.convertMessages(messages);
    
    const request: OllamaGenerateRequest = {
      model: model || this.defaultModel || 'llama3',
      messages: ollamaMessages,
      stream: false,
      options: {
        temperature: options?.temperature,
        top_p: options?.topP,
        top_k: options?.topK,
        num_predict: options?.maxTokens,
        stop: options?.stopSequences,
      },
    };

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.statusText}`);
    }

    const data: OllamaGenerateResponse = await response.json();

    return {
      content: data.message.content,
      usage: data.prompt_eval_count && data.eval_count ? {
        promptTokens: data.prompt_eval_count,
        completionTokens: data.eval_count,
        totalTokens: data.prompt_eval_count + data.eval_count,
      } : undefined,
      finishReason: data.done ? 'stop' : 'length',
    };
  }

  async *streamContent(
    model: string,
    messages: Message[],
    options?: GenerateOptions
  ): AsyncGenerator<GenerateResponse> {
    const ollamaMessages = this.convertMessages(messages);
    
    const request: OllamaGenerateRequest = {
      model: model || this.defaultModel || 'llama3',
      messages: ollamaMessages,
      stream: true,
      options: {
        temperature: options?.temperature,
        top_p: options?.topP,
        top_k: options?.topK,
        num_predict: options?.maxTokens,
        stop: options?.stopSequences,
      },
    };

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.statusText}`);
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
        if (line.trim()) {
          try {
            const data: OllamaGenerateResponse = JSON.parse(line);
            yield {
              content: data.message.content,
              finishReason: data.done ? 'stop' : undefined,
            };
          } catch (error) {
            console.error('Failed to parse Ollama response:', error);
          }
        }
      }
    }
  }

  private convertMessages(messages: Message[]): OllamaMessage[] {
    return messages.map((msg) => {
      const ollamaMsg: OllamaMessage = {
        role: msg.role === 'function' ? 'assistant' : msg.role,
        content: typeof msg.content === 'string' 
          ? msg.content 
          : this.contentToString(msg.content),
      };

      // Extract images if present
      if (Array.isArray(msg.content)) {
        const images = msg.content
          .filter((c) => c.type === 'image' && c.image?.url)
          .map((c) => {
            const url = c.image!.url;
            // Convert data URL to base64 if needed
            if (url.startsWith('data:')) {
              return url.split(',')[1];
            }
            return url;
          });
        
        if (images.length > 0) {
          ollamaMsg.images = images;
        }
      }

      return ollamaMsg;
    });
  }

  private contentToString(content: any[]): string {
    return content
      .map((c) => {
        if (c.type === 'text') return c.text;
        if (c.type === 'function_call') {
          return `Function call: ${c.functionCall.name}(${JSON.stringify(
            c.functionCall.arguments
          )})`;
        }
        if (c.type === 'function_result') {
          return `Function result: ${JSON.stringify(c.functionResult.result)}`;
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }

  /**
   * Pull a model from the Ollama library
   */
  async pullModel(modelName: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/pull`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: modelName }),
    });

    if (!response.ok) {
      throw new Error(`Failed to pull model ${modelName}: ${response.statusText}`);
    }

    // Stream the pull progress
    const reader = response.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim()) {
          try {
            const data = JSON.parse(line);
            if (data.status) {
              console.log(`Pulling ${modelName}: ${data.status}`);
            }
          } catch {
            // Ignore parse errors
          }
        }
      }
    }
  }
}