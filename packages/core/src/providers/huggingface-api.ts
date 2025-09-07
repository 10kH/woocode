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

/**
 * HuggingFace Inference API provider for large models
 * Uses HuggingFace's cloud inference endpoints
 */
export class HuggingFaceAPIProvider implements LLMProvider {
  name = 'HuggingFaceAPI';
  type: 'api' = 'api';
  private apiKey: string | undefined;
  private baseUrl = 'https://api-inference.huggingface.co/models';

  constructor(config?: ProviderConfig) {
    // Get API key from environment or config
    this.apiKey = process.env['HF_TOKEN'] || 
                  process.env['HUGGINGFACE_TOKEN'] ||
                  process.env['HUGGINGFACE_API_KEY'] ||
                  config?.apiKey;
  }

  async initialize(): Promise<void> {
    if (!this.apiKey) {
      throw new Error('HuggingFace API key required. Set HF_TOKEN environment variable.');
    }
    console.log('Initialized HuggingFace Inference API provider');
  }

  async isAvailable(): Promise<boolean> {
    return !!this.apiKey;
  }

  async listModels(): Promise<ModelInfo[]> {
    // List of large models available via HF Inference API
    return [
      {
        id: 'Qwen/Qwen3-Coder-30B-A3B-Instruct',
        name: 'Qwen3-Coder 30B A3B',
        description: 'Advanced Qwen3 model for coding tasks (30B parameters)',
        contextLength: 32768,
        provider: 'huggingface-api',
        capabilities: {
          vision: false,
          functionCalling: true,
          streaming: true,
        },
      },
      {
        id: 'Qwen/Qwen2.5-Coder-32B-Instruct',
        name: 'Qwen2.5-Coder 32B',
        description: 'Large Qwen2.5 model for advanced coding (32B parameters)',
        contextLength: 32768,
        provider: 'huggingface-api',
        capabilities: {
          vision: false,
          functionCalling: true,
          streaming: true,
        },
      },
      {
        id: 'deepseek-ai/DeepSeek-Coder-V2-Instruct',
        name: 'DeepSeek-Coder-V2',
        description: 'DeepSeek coding model V2',
        contextLength: 16384,
        provider: 'huggingface-api',
        capabilities: {
          vision: false,
          functionCalling: true,
          streaming: true,
        },
      },
      {
        id: 'codellama/CodeLlama-34b-Instruct-hf',
        name: 'CodeLlama 34B',
        description: 'Meta CodeLlama for code generation (34B parameters)',
        contextLength: 16384,
        provider: 'huggingface-api',
        capabilities: {
          vision: false,
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
    if (!this.apiKey) {
      throw new Error('API key not configured');
    }

    // Format messages for HF API
    const prompt = this.formatPrompt(messages, model);
    
    console.log('Calling HuggingFace Inference API...');
    
    try {
      const response = await fetch(`${this.baseUrl}/${model}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs: prompt,
          parameters: {
            max_new_tokens: options?.maxTokens || 512,
            temperature: options?.temperature || 0.7,
            top_p: options?.topP || 0.95,
            top_k: options?.topK || 40,
            do_sample: true,
            return_full_text: false,
            stop: options?.stopSequences || ['<|endoftext|>', '<|im_end|>'],
          },
          options: {
            wait_for_model: true,  // Wait if model needs to be loaded
          },
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`HF API error: ${response.status} - ${error}`);
      }

      const result = await response.json();
      
      // Handle different response formats
      let generatedText = '';
      if (Array.isArray(result)) {
        generatedText = result[0]?.generated_text || '';
      } else if (result.generated_text) {
        generatedText = result.generated_text;
      } else if (typeof result === 'string') {
        generatedText = result;
      }

      // Clean up the response (remove prompt if included)
      if (generatedText.startsWith(prompt)) {
        generatedText = generatedText.slice(prompt.length);
      }
      
      // Remove special tokens
      generatedText = generatedText.replace(/<\|im_end\|>/g, '').trim();
      
      return {
        content: generatedText,
        finishReason: 'stop',
        usage: {
          promptTokens: prompt.length / 4, // Approximate
          completionTokens: generatedText.length / 4, // Approximate
          totalTokens: (prompt.length + generatedText.length) / 4,
        },
      };
    } catch (error) {
      console.error('HF API request failed:', error);
      throw error;
    }
  }

  async *streamContent(
    model: string,
    messages: Message[],
    options?: GenerateOptions
  ): AsyncGenerator<GenerateResponse> {
    // For now, fall back to non-streaming
    // HF Inference API supports streaming but requires different implementation
    const response = await this.generateContent(model, messages, options);
    yield response;
  }

  private formatPrompt(messages: Message[], model: string): string {
    // Format messages based on model type
    const isQwen = model.includes('Qwen');
    const isCodeLlama = model.includes('CodeLlama') || model.includes('codellama');
    
    if (isQwen) {
      // Qwen uses ChatML format
      let prompt = '';
      messages.forEach(msg => {
        if (msg.role === 'system') {
          prompt += `<|im_start|>system\n${msg.content}<|im_end|>\n`;
        } else if (msg.role === 'user') {
          prompt += `<|im_start|>user\n${msg.content}<|im_end|>\n`;
        } else if (msg.role === 'assistant') {
          prompt += `<|im_start|>assistant\n${msg.content}<|im_end|>\n`;
        }
      });
      prompt += '<|im_start|>assistant\n';
      return prompt;
    } else if (isCodeLlama) {
      // CodeLlama format
      let prompt = '';
      const system = messages.find(m => m.role === 'system');
      if (system) {
        prompt = `<<SYS>>\n${system.content}\n<</SYS>>\n\n`;
      }
      
      messages
        .filter(m => m.role !== 'system')
        .forEach(msg => {
          if (msg.role === 'user') {
            prompt += `[INST] ${msg.content} [/INST]`;
          } else if (msg.role === 'assistant') {
            prompt += ` ${msg.content} `;
          }
        });
      
      return prompt;
    } else {
      // Default format for other models
      return messages
        .map(msg => {
          const role = msg.role === 'user' ? 'Human' : 
                      msg.role === 'assistant' ? 'Assistant' : 
                      'System';
          return `${role}: ${msg.content}`;
        })
        .join('\n') + '\nAssistant:';
    }
  }

  /**
   * Get GPU info (cloud-based, not applicable)
   */
  async getGPUInfo(): Promise<{ name: string; vram: number } | null> {
    return {
      name: 'HuggingFace Cloud GPU',
      vram: 0, // Not applicable for cloud
    };
  }

  /**
   * Recommend model for HF API
   */
  async recommendModel(): Promise<string> {
    // Recommend Qwen3-Coder for best coding performance
    return 'Qwen/Qwen3-Coder-30B-A3B-Instruct';
  }

  /**
   * Clear cache (not applicable for API)
   */
  async clearCache(): Promise<void> {
    // No local cache for API calls
    console.log('No cache to clear for API provider');
  }
}