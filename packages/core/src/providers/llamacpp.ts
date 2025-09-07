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
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

/**
 * Llama.cpp provider for running GGUF models locally
 */
export class LlamaCppProvider implements LLMProvider {
  name = 'LlamaCpp';
  type: 'local' = 'local';
  private llamaPath: string | null = null;
  private serverProcess: any = null;
  private serverPort: number = 8080;
  private modelsDir: string;

  constructor(config?: ProviderConfig) {
    this.modelsDir = path.join(
      os.homedir(),
      '.woocode',
      'models',
      'gguf'
    );
  }

  async initialize(): Promise<void> {
    // Check if llama.cpp is installed
    this.llamaPath = await this.findLlamaCpp();
    if (!this.llamaPath) {
      throw new Error(
        'llama.cpp not found. Please install it first:\n' +
        'git clone https://github.com/ggerganov/llama.cpp\n' +
        'cd llama.cpp && make'
      );
    }

    // Create models directory if it doesn't exist
    if (!fs.existsSync(this.modelsDir)) {
      fs.mkdirSync(this.modelsDir, { recursive: true });
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const llamaPath = await this.findLlamaCpp();
      return llamaPath !== null;
    } catch {
      return false;
    }
  }

  private async findLlamaCpp(): Promise<string | null> {
    // Check common installation paths
    const possiblePaths = [
      path.join(os.homedir(), 'llama.cpp', 'server'),
      path.join(os.homedir(), '.local', 'bin', 'llama-server'),
      '/usr/local/bin/llama-server',
      '/usr/bin/llama-server',
      path.join(os.homedir(), 'llama.cpp', 'build', 'bin', 'server'),
    ];

    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        return p;
      }
    }

    // Check if llama-server is in PATH
    try {
      const { execSync } = require('child_process');
      execSync('which llama-server', { stdio: 'ignore' });
      return 'llama-server';
    } catch {
      // Not in PATH
    }

    return null;
  }

  async listModels(): Promise<ModelInfo[]> {
    // List of recommended GGUF models
    const models: ModelInfo[] = [
      {
        id: 'qwen2.5-coder-1.5b-instruct-q4_k_m.gguf',
        name: 'Qwen2.5-Coder 1.5B',
        description: 'Excellent small coding model (1GB)',
        contextLength: 32768,
        provider: 'llamacpp',
        capabilities: {
          vision: false,
          functionCalling: true,
          streaming: true,
        },
      },
      {
        id: 'qwen2.5-coder-7b-instruct-q4_k_m.gguf',
        name: 'Qwen2.5-Coder 7B',
        description: 'Powerful coding model (4GB)',
        contextLength: 32768,
        provider: 'llamacpp',
        capabilities: {
          vision: false,
          functionCalling: true,
          streaming: true,
        },
      },
      {
        id: 'codellama-7b-instruct-q4_k_m.gguf',
        name: 'CodeLlama 7B',
        description: 'Meta\'s coding model (4GB)',
        contextLength: 16384,
        provider: 'llamacpp',
        capabilities: {
          vision: false,
          functionCalling: true,
          streaming: true,
        },
      },
      {
        id: 'deepseek-coder-6.7b-instruct-q4_k_m.gguf',
        name: 'DeepSeek Coder 6.7B',
        description: 'Strong coding model (3.5GB)',
        contextLength: 16384,
        provider: 'llamacpp',
        capabilities: {
          vision: false,
          functionCalling: true,
          streaming: true,
        },
      },
    ];

    // Check which models are already downloaded
    for (const model of models) {
      const modelPath = path.join(this.modelsDir, model.id);
      if (fs.existsSync(modelPath)) {
        model.description += ' [Downloaded]';
      }
    }

    return models;
  }

  private async downloadModel(modelId: string): Promise<string> {
    const modelPath = path.join(this.modelsDir, modelId);
    
    // Check if already downloaded
    if (fs.existsSync(modelPath)) {
      console.log(`Model ${modelId} already downloaded`);
      return modelPath;
    }

    // Model download URLs (you'd need to implement actual URLs)
    const modelUrls: Record<string, string> = {
      'qwen2.5-coder-1.5b-instruct-q4_k_m.gguf': 
        'https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF/resolve/main/qwen2.5-coder-1.5b-instruct-q4_k_m.gguf',
      'qwen2.5-coder-7b-instruct-q4_k_m.gguf':
        'https://huggingface.co/Qwen/Qwen2.5-Coder-7B-Instruct-GGUF/resolve/main/qwen2.5-coder-7b-instruct-q4_k_m.gguf',
      'codellama-7b-instruct-q4_k_m.gguf':
        'https://huggingface.co/TheBloke/CodeLlama-7B-Instruct-GGUF/resolve/main/codellama-7b-instruct.Q4_K_M.gguf',
      'deepseek-coder-6.7b-instruct-q4_k_m.gguf':
        'https://huggingface.co/TheBloke/deepseek-coder-6.7B-instruct-GGUF/resolve/main/deepseek-coder-6.7b-instruct.Q4_K_M.gguf',
    };

    const url = modelUrls[modelId];
    if (!url) {
      throw new Error(`No download URL for model ${modelId}`);
    }

    console.log(`Downloading ${modelId}...`);
    console.log(`From: ${url}`);
    console.log(`To: ${modelPath}`);

    // Download with progress using native fetch
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download model: ${response.statusText}`);
    }

    const totalSize = parseInt(response.headers.get('content-length') || '0', 10);
    let downloadedSize = 0;
    let lastProgress = 0;

    const fileStream = fs.createWriteStream(modelPath);
    
    if (!response.body) {
      throw new Error('No response body');
    }

    const reader = response.body.getReader();
    
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        downloadedSize += value.length;
        const progress = Math.round((downloadedSize / totalSize) * 100);
        
        if (progress > lastProgress + 5) {
          process.stdout.write(`\rDownloading: ${progress}%`);
          lastProgress = progress;
        }
        
        fileStream.write(value);
      }
      
      fileStream.end();
      console.log('\nDownload complete!');
      return modelPath;
    } catch (error) {
      fileStream.destroy();
      fs.unlinkSync(modelPath);
      throw error;
    }
  }

  private async startServer(modelPath: string): Promise<void> {
    if (this.serverProcess) {
      return; // Server already running
    }

    if (!this.llamaPath) {
      throw new Error('llama.cpp not initialized');
    }

    console.log(`Starting llama.cpp server with ${path.basename(modelPath)}...`);

    // Start llama.cpp server
    this.serverProcess = spawn(this.llamaPath, [
      '-m', modelPath,
      '--host', '127.0.0.1',
      '--port', this.serverPort.toString(),
      '-c', '4096', // context size
      '-n', '512',  // max tokens
      '--n-gpu-layers', '99', // Use GPU if available
    ]);

    this.serverProcess.stdout.on('data', (data: Buffer) => {
      const output = data.toString();
      if (output.includes('HTTP server listening')) {
        console.log('Llama.cpp server started successfully');
      }
    });

    this.serverProcess.stderr.on('data', (data: Buffer) => {
      console.error('Llama.cpp error:', data.toString());
    });

    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  async generateContent(
    model: string,
    messages: Message[],
    options?: GenerateOptions
  ): Promise<GenerateResponse> {
    // Download model if needed
    const modelPath = await this.downloadModel(model);

    // Start server if not running
    await this.startServer(modelPath);

    // Format messages into prompt
    const prompt = this.formatPrompt(messages);

    // Call llama.cpp server API
    const response = await fetch(`http://127.0.0.1:${this.serverPort}/completion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        n_predict: options?.maxTokens || 512,
        temperature: options?.temperature || 0.7,
        top_p: options?.topP || 0.9,
        top_k: options?.topK || 40,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Llama.cpp server error: ${response.statusText}`);
    }

    const result = await response.json() as any;

    return {
      content: result.content || '',
      finishReason: result.stop ? 'stop' : 'length',
      usage: {
        promptTokens: result.tokens_evaluated || 0,
        completionTokens: result.tokens_predicted || 0,
        totalTokens: (result.tokens_evaluated || 0) + (result.tokens_predicted || 0),
      },
    };
  }

  async *streamContent(
    model: string,
    messages: Message[],
    options?: GenerateOptions
  ): AsyncGenerator<GenerateResponse> {
    // Download model if needed
    const modelPath = await this.downloadModel(model);

    // Start server if not running
    await this.startServer(modelPath);

    // Format messages into prompt
    const prompt = this.formatPrompt(messages);

    // Call llama.cpp server API with streaming
    const response = await fetch(`http://127.0.0.1:${this.serverPort}/completion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        n_predict: options?.maxTokens || 512,
        temperature: options?.temperature || 0.7,
        top_p: options?.topP || 0.9,
        top_k: options?.topK || 40,
        stream: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`Llama.cpp server error: ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
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
        if (line.startsWith('data: ')) {
          const jsonStr = line.slice(6);
          if (jsonStr === '[DONE]') {
            break;
          }

          try {
            const data = JSON.parse(jsonStr);
            yield {
              content: data.content || '',
              finishReason: data.stop ? 'stop' : 'length',
            };
          } catch (e) {
            console.error('Failed to parse streaming response:', e);
          }
        }
      }
    }
  }

  private formatPrompt(messages: Message[]): string {
    // Format for instruction-tuned models
    let prompt = '';
    
    for (const msg of messages) {
      const content = typeof msg.content === 'string' 
        ? msg.content 
        : JSON.stringify(msg.content);
      
      if (msg.role === 'system') {
        prompt += `System: ${content}\n\n`;
      } else if (msg.role === 'user') {
        prompt += `User: ${content}\n\n`;
      } else if (msg.role === 'assistant') {
        prompt += `Assistant: ${content}\n\n`;
      }
    }
    
    prompt += 'Assistant:';
    return prompt;
  }

  /**
   * Cleanup server on exit
   */
  async cleanup(): Promise<void> {
    if (this.serverProcess) {
      console.log('Stopping llama.cpp server...');
      this.serverProcess.kill();
      this.serverProcess = null;
    }
  }

  /**
   * Get GPU info (for CUDA/ROCm detection)
   */
  async getGPUInfo(): Promise<{ name: string; vram: number } | null> {
    try {
      const { execSync } = require('child_process');
      
      // Try nvidia-smi first
      try {
        const output = execSync('nvidia-smi --query-gpu=name,memory.total --format=csv,noheader', 
          { encoding: 'utf8' });
        const [name, vramStr] = output.trim().split(',');
        const vram = parseInt(vramStr) * 1024 * 1024; // Convert MB to bytes
        return { name: name.trim(), vram };
      } catch {
        // Not NVIDIA
      }
      
      // Try ROCm
      try {
        execSync('rocm-smi --showmeminfo vram --csv', 
          { encoding: 'utf8' });
        // Parse ROCm output (implementation depends on format)
        return { name: 'AMD GPU', vram: 8 * 1024 * 1024 * 1024 }; // Placeholder
      } catch {
        // Not AMD
      }
      
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Recommend model based on available VRAM
   */
  async recommendModel(): Promise<string> {
    const gpu = await this.getGPUInfo();
    
    if (!gpu) {
      // CPU only - use smallest model
      return 'qwen2.5-coder-1.5b-instruct-q4_k_m.gguf';
    }
    
    const vramGB = gpu.vram / (1024 * 1024 * 1024);
    
    if (vramGB >= 8) {
      return 'qwen2.5-coder-7b-instruct-q4_k_m.gguf';
    } else if (vramGB >= 4) {
      return 'deepseek-coder-6.7b-instruct-q4_k_m.gguf';
    } else {
      return 'qwen2.5-coder-1.5b-instruct-q4_k_m.gguf';
    }
  }
}