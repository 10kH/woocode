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
 * Hugging Face provider using @xenova/transformers (JavaScript)
 */
export class HuggingFaceJSProvider implements LLMProvider {
  name = 'HuggingFaceJS';
  type: 'local' = 'local';
  private pipeline: any = null;
  private currentModel: string | null = null;

  constructor(config?: ProviderConfig) {
    // Initialize with config if needed
  }

  async initialize(): Promise<void> {
    try {
      // Dynamically import transformers.js
      const transformers = await import('@xenova/transformers');
      
      // Set cache directory
      const homeDir = process.env['HOME'] || process.env['USERPROFILE'];
      transformers.env.cacheDir = `${homeDir}/.woocode/models`;
      
      // Store reference for later use
      this.transformers = transformers;
      
      console.log('Initialized HuggingFace JS provider with transformers.js');
    } catch (error) {
      console.error('Failed to initialize transformers.js:', error);
      throw new Error('transformers.js not available. Please install @xenova/transformers');
    }
  }
  
  private transformers: any;

  async isAvailable(): Promise<boolean> {
    try {
      await import('@xenova/transformers');
      return true;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    // List of models compatible with transformers.js
    return [
      {
        id: 'Xenova/Qwen2.5-Coder-0.5B-Instruct',
        name: 'Qwen2.5-Coder 0.5B',
        description: 'Tiny model for testing (500M parameters)',
        contextLength: 32768,
        provider: 'huggingface-js',
        capabilities: {
          vision: false,
          functionCalling: true,
          streaming: false,
        },
      },
      {
        id: 'Xenova/gpt2',
        name: 'GPT-2',
        description: 'Classic GPT-2 model for testing',
        contextLength: 1024,
        provider: 'huggingface-js',
        capabilities: {
          vision: false,
          functionCalling: false,
          streaming: false,
        },
      },
      {
        id: 'Xenova/distilgpt2',
        name: 'DistilGPT-2',
        description: 'Smaller, faster GPT-2',
        contextLength: 1024,
        provider: 'huggingface-js',
        capabilities: {
          vision: false,
          functionCalling: false,
          streaming: false,
        },
      },
    ];
  }

  async generateContent(
    model: string,
    messages: Message[],
    options?: GenerateOptions
  ): Promise<GenerateResponse> {
    if (!this.transformers) {
      await this.initialize();
    }

    // Load model if not already loaded or if different model requested
    if (this.currentModel !== model) {
      console.log(`Loading model: ${model}`);
      
      try {
        // Create text generation pipeline
        this.pipeline = await this.transformers.pipeline(
          'text-generation',
          model,
          {
            device: 'cpu', // transformers.js runs on CPU/WebGPU
            progress_callback: (progress: any) => {
              if (progress.status === 'download') {
                console.log(`Downloading ${progress.file}: ${Math.round(progress.progress)}%`);
              }
            },
          }
        );
        
        this.currentModel = model;
        console.log(`Model ${model} loaded successfully`);
      } catch (error) {
        console.error(`Failed to load model ${model}:`, error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to load model: ${errorMessage}`);
      }
    }

    // Format messages into a single prompt
    const prompt = this.formatPrompt(messages);
    
    console.log('Generating response...');
    
    try {
      // Generate response
      const output = await this.pipeline(prompt, {
        max_new_tokens: options?.maxTokens || 100,
        temperature: options?.temperature || 0.7,
        top_p: options?.topP || 0.9,
        do_sample: true,
        return_full_text: false,
      });
      
      const generatedText = output[0].generated_text || '';
      
      return {
        content: generatedText,
        finishReason: 'stop',
        usage: {
          promptTokens: prompt.length, // Approximate
          completionTokens: generatedText.length, // Approximate
          totalTokens: prompt.length + generatedText.length,
        },
      };
    } catch (error) {
      console.error('Generation failed:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Generation failed: ${errorMessage}`);
    }
  }

  async *streamContent(
    model: string,
    messages: Message[],
    options?: GenerateOptions
  ): AsyncGenerator<GenerateResponse> {
    // transformers.js doesn't support streaming yet
    // Fall back to non-streaming
    const response = await this.generateContent(model, messages, options);
    yield response;
  }

  private formatPrompt(messages: Message[]): string {
    // Simple formatting for now
    return messages
      .map(msg => {
        const role = msg.role === 'user' ? 'User' : 'Assistant';
        const content = typeof msg.content === 'string' 
          ? msg.content 
          : JSON.stringify(msg.content);
        return `${role}: ${content}`;
      })
      .join('\n') + '\nAssistant:';
  }

  /**
   * Get GPU info (transformers.js uses CPU/WebGPU)
   */
  async getGPUInfo(): Promise<{ name: string; vram: number } | null> {
    // transformers.js doesn't use traditional GPU
    // It can use WebGPU in browser or CPU in Node.js
    return {
      name: 'CPU/WebGPU',
      vram: 0, // Not applicable
    };
  }

  /**
   * Recommend model for transformers.js
   */
  async recommendModel(): Promise<string> {
    // For transformers.js, recommend small models
    return 'Xenova/distilgpt2';
  }

  /**
   * Clear model cache to free memory
   */
  async clearCache(): Promise<void> {
    if (this.pipeline) {
      // Dispose of the pipeline to free memory
      if (this.pipeline.dispose) {
        await this.pipeline.dispose();
      }
      this.pipeline = null;
      this.currentModel = null;
      console.log('Model cache cleared');
    }
  }
}