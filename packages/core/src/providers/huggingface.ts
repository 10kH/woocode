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
 * Hugging Face model configurations
 */
export const HUGGINGFACE_MODELS = {
  'qwen3-coder-30b': {
    id: 'Qwen/Qwen3-Coder-30B-A3B-Instruct',
    name: 'Qwen3-Coder 30B (A3B)',
    description: 'Smaller version optimized for consumer GPUs (24GB+ VRAM recommended)',
    url: 'https://huggingface.co/Qwen/Qwen3-Coder-30B-A3B-Instruct',
    minVRAM: 24, // GB
    contextLength: 32768,
    quantizations: ['Q4_K_M', 'Q5_K_M', 'Q8_0'],
  },
  'qwen3-coder-480b': {
    id: 'Qwen/Qwen3-Coder-480B-A35B-Instruct',
    name: 'Qwen3-Coder 480B (A35B)',
    description: 'Large version for workstation GPUs (80GB+ VRAM recommended)',
    url: 'https://huggingface.co/Qwen/Qwen3-Coder-480B-A35B-Instruct',
    minVRAM: 80, // GB
    contextLength: 32768,
    quantizations: ['Q4_K_M', 'Q5_K_M'],
  },
};

interface HuggingFaceConfig extends ProviderConfig {
  inferenceEngine?: 'transformers' | 'llama.cpp' | 'vllm' | 'tgi';
  modelPath?: string;
  quantization?: string;
  device?: 'cuda' | 'cpu' | 'mps' | 'auto';
  maxMemory?: number; // in GB
}

/**
 * Hugging Face provider for local inference
 * Supports multiple inference backends
 */
export class HuggingFaceProvider implements LLMProvider {
  name = 'HuggingFace';
  type: 'local' = 'local';
  private inferenceEngine: string;
  private modelPath?: string;
  private isInitialized = false;

  constructor(config?: HuggingFaceConfig) {
    this.inferenceEngine = config?.inferenceEngine || 'llama.cpp';
    this.modelPath = config?.modelPath;
  }

  async initialize(): Promise<void> {
    // Check which inference engine is available
    const engine = await this.detectInferenceEngine();
    if (!engine) {
      throw new Error(
        'No inference engine found. Please install llama.cpp, transformers, vLLM, or TGI'
      );
    }
    this.inferenceEngine = engine;
    this.isInitialized = true;
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Check if we have a local inference engine
      const engine = await this.detectInferenceEngine();
      return engine !== null;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    const models: ModelInfo[] = [];
    
    // Get system GPU info
    const gpuInfo = await this.getGPUInfo();
    const availableVRAM = gpuInfo?.vram || 0;

    // List available Qwen3-Coder models based on VRAM
    for (const [, model] of Object.entries(HUGGINGFACE_MODELS)) {
      if (availableVRAM >= model.minVRAM || availableVRAM === 0) {
        models.push({
          id: model.id,
          name: model.name,
          description: model.description,
          contextLength: model.contextLength,
          provider: 'huggingface',
          capabilities: {
            vision: false,
            functionCalling: true,
            streaming: true,
          },
        });
      }
    }

    // Also check for already downloaded models
    const localModels = await this.scanLocalModels();
    models.push(...localModels);

    return models;
  }

  async generateContent(
    model: string,
    messages: Message[],
    options?: GenerateOptions
  ): Promise<GenerateResponse> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    switch (this.inferenceEngine) {
      case 'llama.cpp':
        return this.generateWithLlamaCpp(model, messages, options);
      case 'transformers':
        return this.generateWithTransformers(model, messages, options);
      case 'vllm':
        return this.generateWithVLLM(model, messages, options);
      case 'tgi':
        return this.generateWithTGI(model, messages, options);
      default:
        throw new Error(`Unknown inference engine: ${this.inferenceEngine}`);
    }
  }

  async *streamContent(
    model: string,
    messages: Message[],
    options?: GenerateOptions
  ): AsyncGenerator<GenerateResponse> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    switch (this.inferenceEngine) {
      case 'llama.cpp':
        yield* this.streamWithLlamaCpp(model, messages, options);
        break;
      case 'vllm':
        yield* this.streamWithVLLM(model, messages, options);
        break;
      case 'tgi':
        yield* this.streamWithTGI(model, messages, options);
        break;
      default:
        // Fallback to non-streaming for engines that don't support it
        const response = await this.generateContent(model, messages, options);
        yield response;
    }
  }

  /**
   * Download model from Hugging Face
   */
  async downloadModel(modelId: string, quantization?: string): Promise<string> {
    console.log(`Downloading model ${modelId} from Hugging Face...`);
    
    const modelConfig = Object.values(HUGGINGFACE_MODELS).find(
      m => m.id === modelId
    );
    
    if (!modelConfig) {
      throw new Error(`Unknown model: ${modelId}`);
    }

    // Use huggingface-cli or direct download
    const downloadPath = await this.downloadWithHFCli(modelId, quantization);
    
    console.log(`Model downloaded to: ${downloadPath}`);
    return downloadPath;
  }

  /**
   * Check GPU capabilities
   */
  async getGPUInfo(): Promise<{ name: string; vram: number } | null> {
    try {
      // Try nvidia-smi for NVIDIA GPUs
      const { execSync } = await import('child_process');
      const output = execSync('nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits', {
        encoding: 'utf-8',
      });
      
      const lines = output.trim().split('\n');
      if (lines.length > 0) {
        const [name, vram] = lines[0].split(',').map(s => s.trim());
        return {
          name,
          vram: Math.floor(parseInt(vram) / 1024), // Convert MB to GB
        };
      }
    } catch {
      // Try other methods for AMD/Apple Silicon
      try {
        // Check for Apple Silicon
        const { execSync } = await import('child_process');
        const output = execSync('system_profiler SPDisplaysDataType', {
          encoding: 'utf-8',
        });
        
        if (output.includes('Apple M')) {
          // Estimate based on system RAM for unified memory
          const memOutput = execSync('sysctl hw.memsize', { encoding: 'utf-8' });
          const memBytes = parseInt(memOutput.split(':')[1].trim());
          const memGB = Math.floor(memBytes / (1024 * 1024 * 1024));
          
          return {
            name: 'Apple Silicon',
            vram: Math.floor(memGB * 0.75), // Estimate 75% available for GPU
          };
        }
      } catch {
        // Fallback
      }
    }
    
    return null;
  }

  /**
   * Recommend model based on system capabilities
   */
  async recommendModel(): Promise<string> {
    const gpuInfo = await this.getGPUInfo();
    
    if (!gpuInfo) {
      console.log('No GPU detected, will use CPU inference (slower)');
      return HUGGINGFACE_MODELS['qwen3-coder-30b'].id;
    }

    console.log(`Detected GPU: ${gpuInfo.name} with ${gpuInfo.vram}GB VRAM`);

    // Recommend based on VRAM
    if (gpuInfo.vram >= 80) {
      console.log('Recommended: Qwen3-Coder 480B (A35B) - Best quality');
      return HUGGINGFACE_MODELS['qwen3-coder-480b'].id;
    } else if (gpuInfo.vram >= 24) {
      console.log('Recommended: Qwen3-Coder 30B (A3B) - Good balance');
      return HUGGINGFACE_MODELS['qwen3-coder-30b'].id;
    } else {
      console.log('Limited VRAM detected. Recommend using quantized version or smaller model');
      return HUGGINGFACE_MODELS['qwen3-coder-30b'].id;
    }
  }

  // Private methods for different inference engines

  private async detectInferenceEngine(): Promise<string | null> {
    // Check for llama.cpp
    try {
      const { execSync } = await import('child_process');
      execSync('which llama-cli', { stdio: 'ignore' });
      return 'llama.cpp';
    } catch {
      // Not found
    }

    // Check for Python-based engines
    try {
      const { execSync } = await import('child_process');
      execSync('python -c "import transformers"', {
        stdio: 'ignore',
      });
      return 'transformers';
    } catch {
      // Not found
    }

    // Check for vLLM
    try {
      const { execSync } = await import('child_process');
      execSync('which vllm', { stdio: 'ignore' });
      return 'vllm';
    } catch {
      // Not found
    }

    return null;
  }

  private async scanLocalModels(): Promise<ModelInfo[]> {
    const models: ModelInfo[] = [];
    
    // Check common model directories
    // const modelDirs = [
    //   '~/.cache/huggingface/hub',
    //   '~/.woocode/models',
    //   './models',
    // ];

    // Implementation would scan these directories for model files
    // This is a placeholder for the actual implementation
    
    return models;
  }

  private async downloadWithHFCli(
    modelId: string,
    quantization?: string
  ): Promise<string> {
    const { execSync } = await import('child_process');
    const homeDir = process.env['HOME'] || process.env['USERPROFILE'];
    const modelDir = `${homeDir}/.woocode/models/${modelId.replace('/', '_')}`;

    try {
      // Use huggingface-cli if available
      const cmd = quantization
        ? `huggingface-cli download ${modelId} --revision ${quantization} --local-dir ${modelDir}`
        : `huggingface-cli download ${modelId} --local-dir ${modelDir}`;
      
      execSync(cmd, { stdio: 'inherit' });
    } catch {
      // Fallback to direct download
      console.log('huggingface-cli not found, using direct download...');
      // Implementation for direct download would go here
    }

    return modelDir;
  }

  private async generateWithLlamaCpp(
    model: string,
    messages: Message[],
    options?: GenerateOptions
  ): Promise<GenerateResponse> {
    // Implementation for llama.cpp
    const { execSync } = await import('child_process');
    
    const prompt = this.formatPrompt(messages);
    const modelPath = await this.ensureModelDownloaded(model);
    
    const args = [
      '-m', modelPath,
      '-p', prompt,
      '-n', (options?.maxTokens || 2048).toString(),
      '--temp', (options?.temperature || 0.7).toString(),
      '--top-k', (options?.topK || 40).toString(),
      '--top-p', (options?.topP || 0.9).toString(),
    ];

    const output = execSync(`llama-cli ${args.join(' ')}`, {
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    });

    return {
      content: output.trim(),
      finishReason: 'stop',
    };
  }

  private async *streamWithLlamaCpp(
    model: string,
    messages: Message[],
    options?: GenerateOptions
  ): AsyncGenerator<GenerateResponse> {
    const { spawn } = await import('child_process');
    
    const prompt = this.formatPrompt(messages);
    const modelPath = await this.ensureModelDownloaded(model);
    
    const args = [
      '-m', modelPath,
      '-p', prompt,
      '-n', (options?.maxTokens || 2048).toString(),
      '--temp', (options?.temperature || 0.7).toString(),
      '--stream',
    ];

    const process = spawn('llama-cli', args);
    
    for await (const chunk of process.stdout) {
      yield {
        content: chunk.toString(),
        finishReason: undefined,
      };
    }

    yield {
      content: '',
      finishReason: 'stop',
    };
  }

  private async generateWithTransformers(
    model: string,
    messages: Message[],
    options?: GenerateOptions
  ): Promise<GenerateResponse> {
    // Python script execution for transformers
    const { execSync } = await import('child_process');
    
    const script = `
import json
import sys
from transformers import AutoModelForCausalLM, AutoTokenizer

model_id = "${model}"
messages = ${JSON.stringify(messages)}

tokenizer = AutoTokenizer.from_pretrained(model_id)
model = AutoModelForCausalLM.from_pretrained(
    model_id,
    device_map="auto",
    torch_dtype="auto"
)

text = tokenizer.apply_chat_template(messages, tokenize=False)
inputs = tokenizer(text, return_tensors="pt").to(model.device)

outputs = model.generate(
    **inputs,
    max_new_tokens=${options?.maxTokens || 2048},
    temperature=${options?.temperature || 0.7},
    do_sample=True
)

response = tokenizer.decode(outputs[0], skip_special_tokens=True)
print(json.dumps({"content": response}))
`;

    const output = execSync(`python -c '${script}'`, {
      encoding: 'utf-8',
    });

    const result = JSON.parse(output);
    return {
      content: result.content,
      finishReason: 'stop',
    };
  }

  private async generateWithVLLM(
    model: string,
    messages: Message[],
    options?: GenerateOptions
  ): Promise<GenerateResponse> {
    // vLLM server API call
    const response = await fetch('http://localhost:8000/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: messages.map(m => ({
          role: m.role,
          content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
        })),
        max_tokens: options?.maxTokens,
        temperature: options?.temperature,
        top_p: options?.topP,
        stream: false,
      }),
    });

    const data = await response.json();
    return {
      content: data.choices[0].message.content,
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      } : undefined,
      finishReason: data.choices[0].finish_reason,
    };
  }

  private async *streamWithVLLM(
    model: string,
    messages: Message[],
    options?: GenerateOptions
  ): AsyncGenerator<GenerateResponse> {
    const response = await fetch('http://localhost:8000/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: options?.maxTokens,
        temperature: options?.temperature,
        stream: true,
      }),
    });

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = JSON.parse(line.slice(6));
          if (data.choices[0].delta.content) {
            yield {
              content: data.choices[0].delta.content,
              finishReason: data.choices[0].finish_reason,
            };
          }
        }
      }
    }
  }

  private async generateWithTGI(
    model: string,
    messages: Message[],
    options?: GenerateOptions
  ): Promise<GenerateResponse> {
    // Text Generation Inference API
    const response = await fetch('http://localhost:8080/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: this.formatPrompt(messages),
        parameters: {
          max_new_tokens: options?.maxTokens,
          temperature: options?.temperature,
          top_p: options?.topP,
          top_k: options?.topK,
        },
      }),
    });

    const data = await response.json();
    return {
      content: data.generated_text,
      finishReason: 'stop',
    };
  }

  private async *streamWithTGI(
    model: string,
    messages: Message[],
    options?: GenerateOptions
  ): AsyncGenerator<GenerateResponse> {
    const response = await fetch('http://localhost:8080/generate_stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: this.formatPrompt(messages),
        parameters: {
          max_new_tokens: options?.maxTokens,
          temperature: options?.temperature,
        },
      }),
    });

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data:')) {
          const data = JSON.parse(line.slice(5));
          yield {
            content: data.token.text,
            finishReason: data.is_last ? 'stop' : undefined,
          };
        }
      }
    }
  }

  private formatPrompt(messages: Message[]): string {
    // Format messages for Qwen3-Coder
    return messages
      .map(m => {
        const role = m.role === 'system' ? 'System' : 
                    m.role === 'user' ? 'User' : 
                    m.role === 'assistant' ? 'Assistant' : 'Function';
        const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
        return `<|im_start|>${role}\n${content}<|im_end|>`;
      })
      .join('\n') + '\n<|im_start|>Assistant\n';
  }

  private async ensureModelDownloaded(model: string): Promise<string> {
    // Check if model is already downloaded
    const modelPath = this.modelPath || `~/.woocode/models/${model.replace('/', '_')}`;
    
    // Check if exists
    const fs = await import('fs');
    if (!fs.existsSync(modelPath)) {
      // Download if not exists
      return await this.downloadModel(model);
    }
    
    return modelPath;
  }
}