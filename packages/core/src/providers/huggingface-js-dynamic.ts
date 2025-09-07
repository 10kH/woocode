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
 * Hugging Face provider with dynamic loading of transformers.js
 * This version loads transformers.js at runtime to avoid bundling issues
 */
export class HuggingFaceJSDynamicProvider implements LLMProvider {
  name = 'HuggingFaceJS';
  type: 'local' = 'local';
  private pipeline: any = null;
  private currentModel: string | null = null;
  private transformers: any = null;

  constructor(config?: ProviderConfig) {
    // Initialize with config if needed
  }

  async initialize(): Promise<void> {
    try {
      // Dynamically import transformers.js at runtime
      // This avoids bundling issues with esbuild
      this.transformers = await import('@xenova/transformers').catch(() => null);
      
      if (!this.transformers) {
        throw new Error('transformers.js not available. Please install @xenova/transformers');
      }
      
      // Set cache directory
      const homeDir = process.env['HOME'] || process.env['USERPROFILE'];
      this.transformers.env.cacheDir = `${homeDir}/.woocode/models`;
      
      // Set HuggingFace token if available
      const hfToken = process.env['HUGGINGFACE_TOKEN'] || process.env['HF_TOKEN'];
      if (hfToken) {
        this.transformers.env.accessToken = hfToken;
        console.log('Using HuggingFace token for model access');
      }
      
      console.log('Initialized HuggingFace JS provider with transformers.js');
    } catch (error) {
      console.error('Failed to initialize transformers.js:', error);
      throw error;
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Try dynamic import
      const transformers = await import('@xenova/transformers').catch(() => null);
      return transformers !== null;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    // List of models compatible with transformers.js (ONNX format)
    return [
      {
        id: 'Xenova/Qwen1.5-0.5B-Chat',
        name: 'Qwen1.5 0.5B Chat',
        description: 'Qwen1.5 model optimized for chat (500M parameters)',
        contextLength: 32768,
        provider: 'huggingface-js',
        capabilities: {
          vision: false,
          functionCalling: true,
          streaming: false,
        },
      },
      {
        id: 'Xenova/Qwen1.5-1.8B',
        name: 'Qwen1.5 1.8B',
        description: 'Larger Qwen1.5 model (1.8B parameters)',
        contextLength: 32768,
        provider: 'huggingface-js',
        capabilities: {
          vision: false,
          functionCalling: true,
          streaming: false,
        },
      },
      {
        id: 'Xenova/deepseek-coder-1.3b-instruct',
        name: 'DeepSeek Coder 1.3B',
        description: 'DeepSeek model for code generation (1.3B parameters)',
        contextLength: 16384,
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
        // Create text generation pipeline with quantization
        this.pipeline = await this.transformers.pipeline(
          'text-generation',
          model,
          {
            device: 'cpu', // transformers.js runs on CPU/WebGPU
            quantized: true, // Use quantized model for better performance
            progress_callback: (progress: any) => {
              if (progress.status === 'download') {
                const percent = Math.round(progress.progress || 0);
                if (percent > 0) {
                  process.stdout.write(`\rDownloading ${progress.file}: ${percent}%`);
                } else {
                  process.stdout.write(`\rDownloading ${progress.file}...`);
                }
                if (percent === 100) {
                  process.stdout.write('\n');
                }
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
      // Limit prompt to avoid context length issues
      // Qwen2.5-Coder supports 32768 tokens, but we'll be conservative
      const isQwenModel = model.includes('Qwen');
      const maxPromptLength = isQwenModel ? 2000 : 500; // More context for Qwen
      const limitedPrompt = prompt.length > maxPromptLength 
        ? prompt.slice(-maxPromptLength) 
        : prompt;
      
      // Generate response with model-appropriate settings
      const maxTokens = model.includes('Qwen') ? 200 : 50; // More tokens for Qwen
      const output = await this.pipeline(limitedPrompt, {
        max_new_tokens: Math.min(options?.maxTokens || maxTokens, maxTokens),
        temperature: options?.temperature || 0.7,
        top_p: options?.topP || 0.9,
        do_sample: true,
        return_full_text: false,
        pad_token_id: 50256, // Add pad token for Qwen models
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
    // Format for Qwen chat models using ChatML format
    const systemPrompt = messages.find(m => m.role === 'system')?.content || '';
    
    // For Qwen models, use ChatML format
    if (this.currentModel && this.currentModel.includes('Qwen')) {
      let formatted = systemPrompt ? `<|im_start|>system\n${systemPrompt}<|im_end|>\n` : '';
      
      messages
        .filter(m => m.role !== 'system')
        .forEach(msg => {
          const role = msg.role === 'user' ? 'user' : 'assistant';
          const content = typeof msg.content === 'string' 
            ? msg.content 
            : JSON.stringify(msg.content);
          formatted += `<|im_start|>${role}\n${content}<|im_end|>\n`;
        });
      
      formatted += '<|im_start|>assistant\n';
      return formatted;
    }
    
    // Default format for other models
    const conversation = messages
      .filter(m => m.role !== 'system')
      .map(msg => {
        const role = msg.role === 'user' ? 'User' : 'Assistant';
        const content = typeof msg.content === 'string' 
          ? msg.content 
          : JSON.stringify(msg.content);
        return `${role}: ${content}`;
      })
      .join('\n');
    
    return systemPrompt 
      ? `System: ${systemPrompt}\n${conversation}\nAssistant:`
      : `${conversation}\nAssistant:`;
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
    // Use Xenova's Qwen1.5 Chat model for better performance
    return 'Xenova/Qwen1.5-0.5B-Chat';
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