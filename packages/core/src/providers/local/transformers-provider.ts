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
} from '../types.js';

/**
 * Transformers.js provider for browser and Node.js inference
 * Uses ONNX models for efficient CPU/GPU inference
 */
export class TransformersProvider implements LLMProvider {
  name = 'transformers.js';
  type: 'local' = 'local';
  
  private pipeline: any;
  private modelId?: string;
  private device: 'webgpu' | 'wasm' | 'cpu';

  constructor() {
    // Detect best available device
    this.device = this.detectDevice();
  }

  async initialize(): Promise<void> {
    try {
      // Dynamic import for better tree-shaking
      const transformersModule = await import('@xenova/transformers' as any).catch(() => null);
      
      if (!transformersModule) {
        throw new Error('@xenova/transformers not installed. Run: npm install @xenova/transformers');
      }
      
      const { pipeline, env } = transformersModule;
      
      // Configure environment
      env.allowLocalModels = true;
      env.allowRemoteModels = true;
      
      // Set backend based on device
      if (this.device === 'webgpu' && typeof navigator !== 'undefined') {
        env.backends.onnx.wasm.proxy = true;
        env.backends.onnx.wasm.numThreads = navigator.hardwareConcurrency || 4;
      }
      
      // Load default model - using smaller models for transformers.js
      this.modelId = 'Xenova/Qwen2.5-Coder-0.5B-Instruct';
      console.log(`Loading model: ${this.modelId}`);
      
      // Create text generation pipeline
      this.pipeline = await pipeline('text-generation', this.modelId, {
        device: this.device,
        quantized: true,
      });
      
      console.log('Transformers.js initialized successfully!');
    } catch (error) {
      console.error('Failed to initialize transformers.js:', error);
      throw error;
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const module = await import('@xenova/transformers' as any).catch(() => null);
      return module !== null;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    // List of ONNX models optimized for transformers.js
    return [
      {
        id: 'Xenova/Qwen2.5-Coder-0.5B-Instruct',
        name: 'Qwen2.5-Coder 0.5B',
        description: 'Tiny model for quick responses (runs on CPU)',
        provider: 'transformers.js',
        contextLength: 4096,
        capabilities: {
          streaming: false,
          functionCalling: false,
          vision: false,
        },
      },
      {
        id: 'Xenova/Qwen2.5-Coder-1.5B-Instruct',
        name: 'Qwen2.5-Coder 1.5B',
        description: 'Small model with better quality (2GB RAM)',
        provider: 'transformers.js',
        contextLength: 8192,
        capabilities: {
          streaming: false,
          functionCalling: false,
          vision: false,
        },
      },
      {
        id: 'Xenova/CodeLlama-7b-hf',
        name: 'CodeLlama 7B',
        description: 'Meta\'s code model (8GB RAM)',
        provider: 'transformers.js',
        contextLength: 4096,
        capabilities: {
          streaming: false,
          functionCalling: false,
          vision: false,
        },
      },
      {
        id: 'Xenova/starcoder2-3b',
        name: 'StarCoder2 3B',
        description: 'Efficient code model (4GB RAM)',
        provider: 'transformers.js',
        contextLength: 8192,
        capabilities: {
          streaming: false,
          functionCalling: false,
          vision: false,
        },
      },
    ];
  }

  async generateContent(
    model: string,
    messages: Message[],
    options?: GenerateOptions,
  ): Promise<GenerateResponse> {
    if (!this.pipeline) {
      throw new Error('Model not initialized');
    }
    
    // Load different model if requested
    if (model !== this.modelId) {
      await this.loadModel(model);
    }
    
    // Format messages into prompt
    const prompt = this.formatPrompt(messages);
    
    // Generate text
    const output = await this.pipeline(prompt, {
      max_new_tokens: options?.maxTokens || 512,
      temperature: options?.temperature || 0.7,
      top_p: options?.topP || 0.9,
      do_sample: true,
      pad_token_id: 50256,
      eos_token_id: 50256,
    });
    
    // Extract generated text
    const generatedText = output[0].generated_text.slice(prompt.length);
    
    return {
      content: generatedText,
      finishReason: 'stop',
      usage: {
        promptTokens: this.estimateTokens(prompt),
        completionTokens: this.estimateTokens(generatedText),
        totalTokens: this.estimateTokens(prompt) + this.estimateTokens(generatedText),
      },
    };
  }

  async *streamContent(
    model: string,
    messages: Message[],
    options?: GenerateOptions,
  ): AsyncGenerator<GenerateResponse> {
    // Transformers.js doesn't support true streaming yet
    // Simulate streaming by yielding chunks
    const response = await this.generateContent(model, messages, options);
    
    const chunkSize = 20; // Characters per chunk
    const content = response.content;
    
    for (let i = 0; i < content.length; i += chunkSize) {
      const chunk = content.slice(i, i + chunkSize);
      yield {
        content: chunk,
        finishReason: i + chunkSize >= content.length ? 'stop' : undefined,
      };
      
      // Small delay to simulate streaming
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  /**
   * Load a specific model
   */
  private async loadModel(modelId: string): Promise<void> {
    const transformersModule = await import('@xenova/transformers' as any).catch(() => null);
    if (!transformersModule) {
      throw new Error('@xenova/transformers not installed');
    }
    const { pipeline } = transformersModule;
    
    console.log(`Loading model: ${modelId}`);
    this.pipeline = await pipeline('text-generation', modelId, {
      device: this.device,
      quantized: true,
    });
    this.modelId = modelId;
  }

  /**
   * Format messages into a prompt
   */
  private formatPrompt(messages: Message[]): string {
    let prompt = '';
    
    for (const msg of messages) {
      const content = typeof msg.content === 'string' 
        ? msg.content 
        : msg.content.map(c => c.text || '').join('\n');
      
      switch (msg.role) {
        case 'system':
          prompt += `<|system|>\n${content}\n`;
          break;
        case 'user':
          prompt += `<|user|>\n${content}\n`;
          break;
        case 'assistant':
          prompt += `<|assistant|>\n${content}\n`;
          break;
      }
    }
    
    prompt += '<|assistant|>\n';
    return prompt;
  }

  /**
   * Detect best available device
   */
  private detectDevice(): 'webgpu' | 'wasm' | 'cpu' {
    // Check if running in browser
    if (typeof window !== 'undefined' && typeof navigator !== 'undefined') {
      // Check for WebGPU support
      if ('gpu' in navigator) {
        return 'webgpu';
      }
      return 'wasm';
    }
    
    // Node.js environment
    return 'cpu';
  }

  /**
   * Estimate token count (rough approximation)
   */
  private estimateTokens(text: string): number {
    // Rough estimate: ~4 characters per token
    return Math.ceil(text.length / 4);
  }
}