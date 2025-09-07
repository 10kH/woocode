/**
 * @license
 * Copyright 2025 WooCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn, ChildProcess } from 'child_process';
import type {
  LLMProvider,
  ModelInfo,
  Message,
  GenerateOptions,
  GenerateResponse,
  ProviderConfig,
} from './types.js';

/**
 * Local Qwen3-Coder provider using Python server
 * Runs large Qwen models locally with full capabilities
 */
export class QwenLocalProvider implements LLMProvider {
  name = 'QwenLocal';
  type: 'local' = 'local';
  private serverProcess: ChildProcess | null = null;
  private serverUrl = 'http://127.0.0.1:8765';
  private serverPort = 8765;
  private isServerRunning = false;

  constructor(config?: ProviderConfig) {
    // Allow custom port via baseUrl
    if (config?.baseUrl) {
      const url = new URL(config.baseUrl);
      this.serverPort = parseInt(url.port) || 8765;
      this.serverUrl = config.baseUrl;
    }
  }

  async initialize(): Promise<void> {
    console.log('Initializing Local Qwen3-Coder provider...');
    
    // Check if server is already running
    const isRunning = await this.checkServerStatus();
    
    if (!isRunning) {
      console.log('Starting Qwen server...');
      await this.startServer();
    } else {
      console.log('Qwen server already running');
      this.isServerRunning = true;
    }
  }

  private async checkServerStatus(): Promise<boolean> {
    try {
      const response = await fetch(this.serverUrl);
      const data = await response.json();
      return data.status === 'running';
    } catch {
      return false;
    }
  }

  private async startServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Get absolute path to server script
      const path = require('path');
      const serverPath = path.join(__dirname, '../../../../local-models/qwen_server.py');

      // Check if Python and requirements are installed
      const checkCmd = spawn('python3', ['--version']);
      checkCmd.on('error', () => {
        reject(new Error(
          'Python 3 not found. Please install Python 3.8+ and run:\n' +
          'pip install torch transformers accelerate bitsandbytes fastapi uvicorn'
        ));
      });

      checkCmd.on('close', (code) => {
        if (code !== 0) {
          reject(new Error('Python 3 check failed'));
          return;
        }

        // Start the server
        this.serverProcess = spawn('python3', [serverPath], {
          env: {
            ...process.env,
            QWEN_SERVER_PORT: this.serverPort.toString(),
            PYTHONUNBUFFERED: '1',
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        });

        let serverReady = false;

        this.serverProcess.stdout?.on('data', (data) => {
          const output = data.toString();
          console.log('[Qwen Server]', output.trim());
          
          // Check if server is ready
          if (output.includes('Uvicorn running on') || output.includes('Model loaded successfully')) {
            if (!serverReady) {
              serverReady = true;
              this.isServerRunning = true;
              
              // Give it a moment to fully initialize
              setTimeout(() => resolve(), 2000);
            }
          }
        });

        this.serverProcess.stderr?.on('data', (data) => {
          const error = data.toString();
          console.error('[Qwen Server Error]', error.trim());
          
          // Check for missing dependencies
          if (error.includes('ModuleNotFoundError')) {
            reject(new Error(
              'Missing Python dependencies. Please run:\n' +
              'pip install torch transformers accelerate bitsandbytes fastapi uvicorn'
            ));
          }
        });

        this.serverProcess.on('error', (err) => {
          console.error('Failed to start Qwen server:', err);
          reject(err);
        });

        this.serverProcess.on('close', (code) => {
          console.log(`Qwen server exited with code ${code}`);
          this.isServerRunning = false;
        });

        // Timeout if server doesn't start
        setTimeout(() => {
          if (!serverReady) {
            reject(new Error('Server startup timeout. Check Python dependencies.'));
          }
        }, 30000); // 30 seconds timeout
      });
    });
  }

  async isAvailable(): Promise<boolean> {
    // Check if Python is available
    return new Promise((resolve) => {
      const check = spawn('python3', ['--version']);
      check.on('error', () => resolve(false));
      check.on('close', (code) => resolve(code === 0));
    });
  }

  async listModels(): Promise<ModelInfo[]> {
    if (!this.isServerRunning) {
      return [];
    }

    try {
      const response = await fetch(`${this.serverUrl}/models`);
      const data = await response.json();
      
      return data.models.map((model: any) => ({
        ...model,
        contextLength: 32768,
        provider: 'qwen-local',
        capabilities: {
          vision: false,
          functionCalling: true,
          streaming: false,
        },
      }));
    } catch (error) {
      console.error('Failed to list models:', error);
      return [
        {
          id: 'Qwen/Qwen3-Coder-30B-A3B-Instruct',
          name: 'Qwen3-Coder 30B A3B',
          description: 'Advanced local coding model (30B parameters)',
          contextLength: 32768,
          provider: 'qwen-local',
          capabilities: {
            vision: false,
            functionCalling: true,
            streaming: false,
          },
        },
      ];
    }
  }

  async generateContent(
    model: string,
    messages: Message[],
    options?: GenerateOptions
  ): Promise<GenerateResponse> {
    if (!this.isServerRunning) {
      throw new Error('Qwen server not running. Please initialize first.');
    }

    try {
      const response = await fetch(`${this.serverUrl}/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: messages.map(msg => ({
            role: msg.role,
            content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
          })),
          max_tokens: options?.maxTokens || 512,
          temperature: options?.temperature || 0.7,
          top_p: options?.topP || 0.95,
          top_k: options?.topK || 40,
          stream: false,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Server error: ${error}`);
      }

      const result = await response.json();
      
      return {
        content: result.content,
        finishReason: 'stop',
        usage: {
          promptTokens: result.usage.prompt_tokens,
          completionTokens: result.usage.completion_tokens,
          totalTokens: result.usage.total_tokens,
        },
      };
    } catch (error) {
      console.error('Generation failed:', error);
      throw error;
    }
  }

  async *streamContent(
    model: string,
    messages: Message[],
    options?: GenerateOptions
  ): AsyncGenerator<GenerateResponse> {
    // For now, fall back to non-streaming
    const response = await this.generateContent(model, messages, options);
    yield response;
  }

  /**
   * Get GPU info
   */
  async getGPUInfo(): Promise<{ name: string; vram: number } | null> {
    try {
      const response = await fetch(this.serverUrl);
      const data = await response.json();
      
      if (data.device === 'cuda') {
        // Get actual GPU info from server
        return {
          name: 'NVIDIA GPU (via CUDA)',
          vram: 0, // Would need to implement in server
        };
      }
    } catch {
      // Server not running
    }
    
    return {
      name: 'CPU',
      vram: 0,
    };
  }

  /**
   * Recommend model based on available resources
   */
  async recommendModel(): Promise<string> {
    const gpuInfo = await this.getGPUInfo();
    
    if (gpuInfo?.name.includes('NVIDIA')) {
      // Has GPU, can run larger models
      return 'Qwen/Qwen3-Coder-30B-A3B-Instruct';
    } else {
      // CPU only, use smaller model
      return 'Qwen/Qwen2.5-Coder-7B-Instruct';
    }
  }

  /**
   * Cleanup when shutting down
   */
  async clearCache(): Promise<void> {
    if (this.serverProcess) {
      console.log('Stopping Qwen server...');
      this.serverProcess.kill('SIGTERM');
      this.serverProcess = null;
      this.isServerRunning = false;
    }
  }
}