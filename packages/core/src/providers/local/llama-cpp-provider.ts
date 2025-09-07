/**
 * @license
 * Copyright 2025 WooCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import type {
  LLMProvider,
  ModelInfo,
  Message,
  GenerateOptions,
  GenerateResponse,
} from '../types.js';

/**
 * LLaMA.cpp provider for local inference
 * Uses llama.cpp binary for fast CPU/GPU inference
 */
export class LlamaCppProvider implements LLMProvider {
  name = 'llama.cpp';
  type: 'local' = 'local';
  
  private llamaCppPath?: string;
  private modelPath?: string;
  private serverProcess?: ChildProcess;
  private serverPort = 8080;
  private modelsDir: string;

  constructor() {
    // Default models directory
    this.modelsDir = path.join(os.homedir(), '.woocode', 'models');
  }

  async initialize(): Promise<void> {
    // Create models directory if it doesn't exist
    await fs.mkdir(this.modelsDir, { recursive: true });
    
    // Check if llama.cpp is installed
    this.llamaCppPath = await this.findLlamaCpp();
    
    if (!this.llamaCppPath) {
      console.log('llama.cpp not found. Installing...');
      await this.installLlamaCpp();
    }
    
    // Download default model if not exists
    const defaultModel = 'qwen2.5-coder-7b-instruct.Q4_K_M.gguf';
    this.modelPath = path.join(this.modelsDir, defaultModel);
    
    if (!await this.fileExists(this.modelPath)) {
      console.log(`Downloading model: ${defaultModel}`);
      await this.downloadModel(defaultModel);
    }
    
    // Start llama.cpp server
    await this.startServer();
  }

  async isAvailable(): Promise<boolean> {
    // Check if llama.cpp binary exists
    const llamaCppExists = await this.findLlamaCpp() !== undefined;
    
    // Check if we have at least one model
    if (!llamaCppExists) return false;
    
    try {
      const files = await fs.readdir(this.modelsDir);
      return files.some(f => f.endsWith('.gguf'));
    } catch {
      return false;
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      const files = await fs.readdir(this.modelsDir);
      const models = files
        .filter(f => f.endsWith('.gguf'))
        .map(f => ({
          id: f,
          name: this.formatModelName(f),
          provider: 'llama.cpp',
          contextLength: this.getContextLength(f),
          capabilities: {
            streaming: true,
            functionCalling: false,
            vision: false,
          },
        }));
      
      return models;
    } catch {
      return [];
    }
  }

  async generateContent(
    model: string,
    messages: Message[],
    options?: GenerateOptions,
  ): Promise<GenerateResponse> {
    // Convert messages to prompt
    const prompt = this.messagesToPrompt(messages);
    
    // Call llama.cpp server API
    const response = await fetch(`http://localhost:${this.serverPort}/completion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        n_predict: options?.maxTokens || 2048,
        temperature: options?.temperature || 0.7,
        top_p: options?.topP || 0.9,
        top_k: options?.topK || 40,
        stop: options?.stopSequences || [],
        stream: false,
      }),
    });
    
    const data = await response.json();
    
    return {
      content: data.content,
      finishReason: data.stop ? 'stop' : 'length',
      usage: {
        promptTokens: data.tokens_evaluated || 0,
        completionTokens: data.tokens_predicted || 0,
        totalTokens: (data.tokens_evaluated || 0) + (data.tokens_predicted || 0),
      },
    };
  }

  async *streamContent(
    model: string,
    messages: Message[],
    options?: GenerateOptions,
  ): AsyncGenerator<GenerateResponse> {
    const prompt = this.messagesToPrompt(messages);
    
    const response = await fetch(`http://localhost:${this.serverPort}/completion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        n_predict: options?.maxTokens || 2048,
        temperature: options?.temperature || 0.7,
        top_p: options?.topP || 0.9,
        top_k: options?.topK || 40,
        stop: options?.stopSequences || [],
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
          if (data.content) {
            yield {
              content: data.content,
              finishReason: data.stop ? 'stop' : undefined,
            };
          }
        }
      }
    }
  }

  /**
   * Find llama.cpp binary
   */
  private async findLlamaCpp(): Promise<string | undefined> {
    const possiblePaths = [
      '/usr/local/bin/llama-server',
      '/usr/bin/llama-server',
      path.join(os.homedir(), '.woocode', 'bin', 'llama-server'),
      path.join(os.homedir(), 'llama.cpp', 'llama-server'),
    ];
    
    for (const p of possiblePaths) {
      if (await this.fileExists(p)) {
        return p;
      }
    }
    
    // Check if in PATH
    try {
      const { execSync } = require('child_process');
      execSync('which llama-server', { stdio: 'ignore' });
      return 'llama-server';
    } catch {
      return undefined;
    }
  }

  /**
   * Install llama.cpp
   */
  private async installLlamaCpp(): Promise<void> {
    console.log('Installing llama.cpp...');
    
    const installDir = path.join(os.homedir(), '.woocode');
    const binDir = path.join(installDir, 'bin');
    await fs.mkdir(binDir, { recursive: true });
    
    // Clone and build llama.cpp
    const { execSync } = require('child_process');
    
    try {
      // Clone repository
      execSync(`git clone https://github.com/ggerganov/llama.cpp ${installDir}/llama.cpp`, {
        stdio: 'inherit',
      });
      
      // Build with GPU support if available
      const buildCommand = this.hasNvidiaGPU() 
        ? 'make LLAMA_CUDA=1'
        : 'make';
      
      execSync(buildCommand, {
        cwd: `${installDir}/llama.cpp`,
        stdio: 'inherit',
      });
      
      // Copy binary to bin directory
      await fs.copyFile(
        path.join(installDir, 'llama.cpp', 'llama-server'),
        path.join(binDir, 'llama-server'),
      );
      
      this.llamaCppPath = path.join(binDir, 'llama-server');
      console.log('llama.cpp installed successfully!');
    } catch (error) {
      console.error('Failed to install llama.cpp:', error);
      throw error;
    }
  }

  /**
   * Download a model from HuggingFace
   */
  private async downloadModel(modelName: string): Promise<void> {
    const modelUrls: Record<string, string> = {
      'qwen2.5-coder-7b-instruct.Q4_K_M.gguf': 
        'https://huggingface.co/Qwen/Qwen2.5-Coder-7B-Instruct-GGUF/resolve/main/qwen2.5-coder-7b-instruct.Q4_K_M.gguf',
      'qwen2.5-coder-14b-instruct.Q4_K_M.gguf':
        'https://huggingface.co/Qwen/Qwen2.5-Coder-14B-Instruct-GGUF/resolve/main/qwen2.5-coder-14b-instruct.Q4_K_M.gguf',
      'codellama-7b.Q4_K_M.gguf':
        'https://huggingface.co/TheBloke/CodeLlama-7B-GGUF/resolve/main/codellama-7b.Q4_K_M.gguf',
      'deepseek-coder-6.7b.Q4_K_M.gguf':
        'https://huggingface.co/TheBloke/deepseek-coder-6.7B-instruct-GGUF/resolve/main/deepseek-coder-6.7b-instruct.Q4_K_M.gguf',
    };
    
    const url = modelUrls[modelName];
    if (!url) {
      throw new Error(`Unknown model: ${modelName}`);
    }
    
    console.log(`Downloading ${modelName}...`);
    
    const response = await fetch(url);
    const totalSize = parseInt(response.headers.get('content-length') || '0');
    let downloadedSize = 0;
    
    const writer = (await fs.open(this.modelPath!, 'w')).createWriteStream();
    const reader = response.body?.getReader();
    
    if (!reader) throw new Error('No response body');
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      writer.write(value);
      downloadedSize += value.length;
      
      const progress = Math.round((downloadedSize / totalSize) * 100);
      process.stdout.write(`\rDownloading: ${progress}%`);
    }
    
    writer.close();
    console.log('\nDownload complete!');
  }

  /**
   * Start llama.cpp server
   */
  private async startServer(): Promise<void> {
    if (!this.llamaCppPath || !this.modelPath) {
      throw new Error('llama.cpp or model not found');
    }
    
    console.log('Starting llama.cpp server...');
    
    // GPU layers based on VRAM
    const gpuLayers = this.getGPULayers();
    
    this.serverProcess = spawn(this.llamaCppPath, [
      '-m', this.modelPath,
      '-c', '4096',  // Context size
      '-n', '-1',    // Unlimited tokens
      '--host', '127.0.0.1',
      '--port', this.serverPort.toString(),
      '-ngl', gpuLayers.toString(),  // GPU layers
      '--mlock',     // Lock model in RAM
      '--no-mmap',   // Don't use mmap
    ]);
    
    this.serverProcess.stdout?.on('data', (data) => {
      if (process.env['DEBUG']) {
        console.log(`llama.cpp: ${data}`);
      }
    });
    
    this.serverProcess.stderr?.on('data', (data) => {
      console.error(`llama.cpp error: ${data}`);
    });
    
    // Wait for server to start
    await this.waitForServer();
    console.log('llama.cpp server started!');
  }

  /**
   * Wait for server to be ready
   */
  private async waitForServer(maxAttempts = 30): Promise<void> {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const response = await fetch(`http://localhost:${this.serverPort}/health`);
        if (response.ok) return;
      } catch {
        // Server not ready yet
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    throw new Error('Server failed to start');
  }

  /**
   * Convert messages to prompt format
   */
  private messagesToPrompt(messages: Message[]): string {
    let prompt = '';
    
    for (const msg of messages) {
      const content = typeof msg.content === 'string' 
        ? msg.content 
        : msg.content.map(c => c.text || '').join('\n');
      
      switch (msg.role) {
        case 'system':
          prompt += `System: ${content}\n\n`;
          break;
        case 'user':
          prompt += `User: ${content}\n\n`;
          break;
        case 'assistant':
          prompt += `Assistant: ${content}\n\n`;
          break;
      }
    }
    
    prompt += 'Assistant: ';
    return prompt;
  }

  /**
   * Check if file exists
   */
  private async fileExists(path: string): Promise<boolean> {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check for NVIDIA GPU
   */
  private hasNvidiaGPU(): boolean {
    try {
      const { execSync } = require('child_process');
      execSync('nvidia-smi', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get number of GPU layers based on VRAM
   */
  private getGPULayers(): number {
    if (!this.hasNvidiaGPU()) return 0;
    
    try {
      const { execSync } = require('child_process');
      const output = execSync('nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits');
      const vram = parseInt(output.toString().trim());
      
      // Rough estimation of layers based on VRAM
      if (vram >= 24000) return 35;  // 24GB+ -> All layers
      if (vram >= 16000) return 28;  // 16GB
      if (vram >= 12000) return 20;  // 12GB
      if (vram >= 8000) return 15;   // 8GB
      if (vram >= 6000) return 10;   // 6GB
      return 5;  // Less than 6GB
    } catch {
      return 0;
    }
  }

  /**
   * Format model name for display
   */
  private formatModelName(filename: string): string {
    return filename
      .replace('.gguf', '')
      .replace(/-/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());
  }

  /**
   * Get context length from model name
   */
  private getContextLength(filename: string): number {
    if (filename.includes('32k')) return 32768;
    if (filename.includes('16k')) return 16384;
    if (filename.includes('8k')) return 8192;
    return 4096;  // Default
  }

  /**
   * Cleanup on shutdown
   */
  async cleanup(): Promise<void> {
    if (this.serverProcess) {
      this.serverProcess.kill();
      this.serverProcess = undefined;
    }
  }
}