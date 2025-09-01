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
  MessageContent,
} from './types.js';

interface GeminiContent {
  role: string;
  parts: Array<{
    text?: string;
    inlineData?: {
      mimeType: string;
      data: string;
    };
    functionCall?: {
      name: string;
      args: any;
    };
    functionResponse?: {
      name: string;
      response: any;
    };
  }>;
}

interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{
        text?: string;
        functionCall?: {
          name: string;
          args: any;
        };
      }>;
      role: string;
    };
    finishReason: string;
    index: number;
    safetyRatings?: Array<{
      category: string;
      probability: string;
    }>;
  }>;
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

export class GeminiProvider implements LLMProvider {
  name = 'Gemini';
  type: 'api' = 'api';
  private apiKey: string;
  private baseUrl: string;
  private defaultModel: string;

  constructor(config?: ProviderConfig) {
    // Check for API key in config, settings, or environment
    this.apiKey = config?.apiKey || 
                 config?.settings?.apiKeys?.gemini ||
                 process.env['GEMINI_API_KEY'] || 
                 process.env['WOOCODE_API_KEY'] || '';
    this.baseUrl = config?.baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
    this.defaultModel = config?.defaultModel || 'gemini-1.5-pro-latest';
  }

  async initialize(): Promise<void> {
    if (!this.apiKey) {
      throw new Error(
        'Gemini API key not found. Please set GEMINI_API_KEY or WOOCODE_API_KEY environment variable.'
      );
    }
  }

  async isAvailable(): Promise<boolean> {
    if (!this.apiKey) {
      return false;
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/models?key=${this.apiKey}`
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      const response = await fetch(
        `${this.baseUrl}/models?key=${this.apiKey}`
      );

      if (!response.ok) {
        throw new Error(`Failed to list models: ${response.statusText}`);
      }

      const data = await response.json();
      const models = data.models || [];

      // Filter for generative models
      const generativeModels = models.filter((model: any) => 
        model.supportedGenerationMethods?.includes('generateContent')
      );

      return generativeModels.map((model: any) => ({
        id: model.name.replace('models/', ''),
        name: model.displayName || model.name,
        description: model.description || 'Gemini language model',
        contextLength: model.inputTokenLimit || 32768,
        provider: 'gemini',
        capabilities: {
          vision: model.name.includes('vision') || model.name.includes('gemini-1.5'),
          functionCalling: true,
          streaming: true,
        },
      }));
    } catch (error) {
      console.error('Failed to list Gemini models:', error);
      return this.getDefaultModels();
    }
  }

  async generateContent(
    model: string,
    messages: Message[],
    options?: GenerateOptions
  ): Promise<GenerateResponse> {
    const geminiContents = this.convertMessages(messages);
    
    const body: any = {
      contents: geminiContents,
      generationConfig: {
        temperature: options?.temperature,
        topP: options?.topP,
        topK: options?.topK,
        maxOutputTokens: options?.maxTokens,
        stopSequences: options?.stopSequences,
      },
    };

    // Add tools/functions if provided
    if (options?.functions && options.functions.length > 0) {
      body.tools = [{
        functionDeclarations: options.functions.map(func => ({
          name: func.name,
          description: func.description,
          parameters: func.parameters,
        })),
      }];
    }

    const modelName = model || this.defaultModel;
    const url = `${this.baseUrl}/models/${modelName}:generateContent?key=${this.apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${error}`);
    }

    const data: GeminiResponse = await response.json();
    const candidate = data.candidates?.[0];

    if (!candidate) {
      throw new Error('No response from Gemini API');
    }

    const textParts = candidate.content.parts
      .filter(p => p.text)
      .map(p => p.text)
      .join('');

    const functionCalls = candidate.content.parts
      .filter(p => p.functionCall)
      .map(p => ({
        name: p.functionCall!.name,
        arguments: p.functionCall!.args,
      }));

    return {
      content: textParts,
      functionCalls: functionCalls.length > 0 ? functionCalls : undefined,
      usage: data.usageMetadata ? {
        promptTokens: data.usageMetadata.promptTokenCount,
        completionTokens: data.usageMetadata.candidatesTokenCount,
        totalTokens: data.usageMetadata.totalTokenCount,
      } : undefined,
      finishReason: this.mapFinishReason(candidate.finishReason),
    };
  }

  async *streamContent(
    model: string,
    messages: Message[],
    options?: GenerateOptions
  ): AsyncGenerator<GenerateResponse> {
    const geminiContents = this.convertMessages(messages);
    
    const body: any = {
      contents: geminiContents,
      generationConfig: {
        temperature: options?.temperature,
        topP: options?.topP,
        topK: options?.topK,
        maxOutputTokens: options?.maxTokens,
        stopSequences: options?.stopSequences,
      },
    };

    if (options?.functions && options.functions.length > 0) {
      body.tools = [{
        functionDeclarations: options.functions,
      }];
    }

    const modelName = model || this.defaultModel;
    const url = `${this.baseUrl}/models/${modelName}:streamGenerateContent?alt=sse&key=${this.apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${error}`);
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
            const data: GeminiResponse = JSON.parse(dataStr);
            const candidate = data.candidates?.[0];
            
            if (candidate) {
              const textParts = candidate.content.parts
                .filter(p => p.text)
                .map(p => p.text)
                .join('');
              
              if (textParts) {
                yield {
                  content: textParts,
                  finishReason: candidate.finishReason ? 
                    this.mapFinishReason(candidate.finishReason) : undefined,
                };
              }
            }
          } catch (error) {
            console.error('Failed to parse Gemini stream data:', error);
          }
        }
      }
    }
  }

  private convertMessages(messages: Message[]): GeminiContent[] {
    const contents: GeminiContent[] = [];
    
    // Gemini requires alternating user/model messages
    // Combine system messages with the first user message
    let systemPrompt = '';
    
    for (const msg of messages) {
      if (msg.role === 'system') {
        systemPrompt += (typeof msg.content === 'string' ? msg.content : this.contentToString(msg.content)) + '\n\n';
      } else {
        const role = msg.role === 'assistant' ? 'model' : 'user';
        const parts = this.convertContent(msg.content);
        
        // Add system prompt to first user message
        if (systemPrompt && msg.role === 'user' && contents.length === 0) {
          parts.unshift({ text: systemPrompt });
          systemPrompt = '';
        }
        
        contents.push({ role, parts });
      }
    }
    
    return contents;
  }

  private convertContent(content: string | MessageContent[]): any[] {
    if (typeof content === 'string') {
      return [{ text: content }];
    }
    
    const parts = [];
    
    for (const item of content) {
      if (item.type === 'text') {
        parts.push({ text: item.text });
      } else if (item.type === 'image' && item.image) {
        // Convert image to Gemini format
        if (item.image.url.startsWith('data:')) {
          const [mimeInfo, base64Data] = item.image.url.split(',');
          const mimeType = mimeInfo.match(/data:([^;]+)/)?.[1] || 'image/jpeg';
          
          parts.push({
            inlineData: {
              mimeType,
              data: base64Data,
            },
          });
        }
      } else if (item.type === 'function_call') {
        parts.push({
          functionCall: {
            name: item.functionCall!.name,
            args: item.functionCall!.arguments,
          },
        });
      } else if (item.type === 'function_result') {
        parts.push({
          functionResponse: {
            name: item.functionResult!.name,
            response: item.functionResult!.result,
          },
        });
      }
    }
    
    return parts;
  }

  private contentToString(content: MessageContent[]): string {
    return content
      .map((c) => {
        if (c.type === 'text') return c.text;
        if (c.type === 'image') return '[Image]';
        if (c.type === 'function_call') {
          return `Function call: ${c.functionCall!.name}`;
        }
        if (c.type === 'function_result') {
          return `Function result: ${JSON.stringify(c.functionResult!.result)}`;
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }

  private mapFinishReason(reason: string): 'stop' | 'length' | 'function_call' | 'error' {
    switch (reason) {
      case 'STOP':
        return 'stop';
      case 'MAX_TOKENS':
        return 'length';
      case 'FUNCTION_CALL':
        return 'function_call';
      case 'SAFETY':
      case 'RECITATION':
      case 'OTHER':
      default:
        return 'stop';
    }
  }

  private getDefaultModels(): ModelInfo[] {
    return [
      {
        id: 'gemini-1.5-pro-latest',
        name: 'Gemini 1.5 Pro',
        description: 'Most capable Gemini model with 2M token context',
        contextLength: 2097152,
        provider: 'gemini',
        capabilities: {
          vision: true,
          functionCalling: true,
          streaming: true,
        },
      },
      {
        id: 'gemini-1.5-flash-latest',
        name: 'Gemini 1.5 Flash',
        description: 'Fast and efficient for most tasks',
        contextLength: 1048576,
        provider: 'gemini',
        capabilities: {
          vision: true,
          functionCalling: true,
          streaming: true,
        },
      },
      {
        id: 'gemini-2.0-flash-exp',
        name: 'Gemini 2.0 Flash (Experimental)',
        description: 'Next generation experimental model',
        contextLength: 1048576,
        provider: 'gemini',
        capabilities: {
          vision: true,
          functionCalling: true,
          streaming: true,
        },
      },
    ];
  }
}