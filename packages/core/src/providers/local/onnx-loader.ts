/**
 * @license
 * Copyright 2025 WooCode
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';

/**
 * Model format types supported
 */
export type ModelFormat = 'gguf' | 'onnx' | 'safetensors' | 'pytorch';

/**
 * Model metadata
 */
export interface ModelMetadata {
  id: string;
  name: string;
  format: ModelFormat;
  size: number; // in bytes
  quantization?: string;
  contextLength?: number;
  vocabSize?: number;
  hiddenSize?: number;
  numLayers?: number;
  numHeads?: number;
}

/**
 * ONNX/GGUF model loader for local inference
 */
export class ModelLoader {
  private modelsDir: string;
  private cacheDir: string;

  constructor() {
    this.modelsDir = path.join(os.homedir(), '.woocode', 'models');
    this.cacheDir = path.join(os.homedir(), '.woocode', 'cache');
  }

  /**
   * Initialize directories
   */
  async initialize(): Promise<void> {
    await fs.mkdir(this.modelsDir, { recursive: true });
    await fs.mkdir(this.cacheDir, { recursive: true });
  }

  /**
   * Load a model from local storage or download it
   */
  async loadModel(modelId: string, format: ModelFormat = 'gguf'): Promise<string> {
    // Check if model exists locally
    const localPath = await this.findLocalModel(modelId, format);
    if (localPath) {
      console.log(`Model found locally: ${localPath}`);
      return localPath;
    }

    // Download model from HuggingFace
    console.log(`Downloading model: ${modelId}`);
    return await this.downloadModel(modelId, format);
  }

  /**
   * Find model in local storage
   */
  private async findLocalModel(modelId: string, format: ModelFormat): Promise<string | null> {
    const modelDir = path.join(this.modelsDir, modelId.replace('/', '_'));
    
    try {
      const files = await fs.readdir(modelDir);
      
      // Look for model files based on format
      const extensions = this.getFormatExtensions(format);
      const modelFile = files.find(f => 
        extensions.some(ext => f.endsWith(ext))
      );
      
      if (modelFile) {
        return path.join(modelDir, modelFile);
      }
    } catch {
      // Directory doesn't exist
    }
    
    return null;
  }

  /**
   * Download model from HuggingFace
   */
  private async downloadModel(modelId: string, format: ModelFormat): Promise<string> {
    const modelDir = path.join(this.modelsDir, modelId.replace('/', '_'));
    await fs.mkdir(modelDir, { recursive: true });

    // Construct HuggingFace URL
    const baseUrl = `https://huggingface.co/${modelId}/resolve/main`;
    
    // Determine which files to download based on format
    const filesToDownload = this.getModelFiles(modelId, format);
    
    for (const file of filesToDownload) {
      const url = `${baseUrl}/${file}`;
      const localPath = path.join(modelDir, file);
      
      console.log(`Downloading ${file}...`);
      await this.downloadFile(url, localPath);
    }
    
    // Return path to main model file
    const mainFile = filesToDownload[0];
    return path.join(modelDir, mainFile);
  }

  /**
   * Download a file with progress tracking
   */
  private async downloadFile(url: string, destPath: string): Promise<void> {
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to download: ${response.statusText}`);
    }
    
    const totalSize = parseInt(response.headers.get('content-length') || '0');
    const reader = response.body?.getReader();
    
    if (!reader) {
      throw new Error('No response body');
    }
    
    const writer = (await fs.open(destPath, 'w')).createWriteStream();
    let downloadedSize = 0;
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      writer.write(value);
      downloadedSize += value.length;
      
      // Show progress
      const progress = Math.round((downloadedSize / totalSize) * 100);
      process.stdout.write(`\rProgress: ${progress}%`);
    }
    
    writer.close();
    console.log('\nDownload complete!');
  }

  /**
   * Get file extensions for model format
   */
  private getFormatExtensions(format: ModelFormat): string[] {
    switch (format) {
      case 'gguf':
        return ['.gguf'];
      case 'onnx':
        return ['.onnx', '.ort'];
      case 'safetensors':
        return ['.safetensors'];
      case 'pytorch':
        return ['.pt', '.pth', '.bin'];
      default:
        return [];
    }
  }

  /**
   * Get list of files to download for a model
   */
  private getModelFiles(modelId: string, format: ModelFormat): string[] {
    // Common quantized GGUF models
    const ggufModels: Record<string, string[]> = {
      'Qwen/Qwen2.5-Coder-7B-Instruct-GGUF': [
        'qwen2.5-coder-7b-instruct-q4_k_m.gguf',
      ],
      'TheBloke/CodeLlama-7B-GGUF': [
        'codellama-7b.Q4_K_M.gguf',
      ],
      'TheBloke/deepseek-coder-6.7B-instruct-GGUF': [
        'deepseek-coder-6.7b-instruct.Q4_K_M.gguf',
      ],
    };

    // ONNX models for transformers.js
    const onnxModels: Record<string, string[]> = {
      'Xenova/Qwen2.5-Coder-0.5B-Instruct': [
        'onnx/model_quantized.onnx',
        'tokenizer.json',
        'tokenizer_config.json',
      ],
      'Xenova/CodeLlama-7b-hf': [
        'onnx/decoder_model_merged_quantized.onnx',
        'tokenizer.json',
        'tokenizer_config.json',
      ],
    };

    if (format === 'gguf' && modelId in ggufModels) {
      return ggufModels[modelId];
    }
    
    if (format === 'onnx' && modelId in onnxModels) {
      return onnxModels[modelId];
    }

    // Default files based on format
    switch (format) {
      case 'gguf':
        return ['model.gguf'];
      case 'onnx':
        return ['model.onnx', 'tokenizer.json'];
      case 'safetensors':
        return ['model.safetensors', 'tokenizer.json', 'config.json'];
      case 'pytorch':
        return ['pytorch_model.bin', 'tokenizer.json', 'config.json'];
      default:
        return [];
    }
  }

  /**
   * Get model metadata
   */
  async getModelMetadata(modelPath: string): Promise<ModelMetadata> {
    const stats = await fs.stat(modelPath);
    const filename = path.basename(modelPath);
    const format = this.detectFormat(filename);
    
    // Parse quantization from filename
    const quantization = this.parseQuantization(filename);
    
    return {
      id: path.dirname(modelPath).split(path.sep).pop() || 'unknown',
      name: filename,
      format,
      size: stats.size,
      quantization,
      contextLength: this.estimateContextLength(filename),
    };
  }

  /**
   * Detect model format from filename
   */
  private detectFormat(filename: string): ModelFormat {
    if (filename.endsWith('.gguf')) return 'gguf';
    if (filename.endsWith('.onnx') || filename.endsWith('.ort')) return 'onnx';
    if (filename.endsWith('.safetensors')) return 'safetensors';
    if (filename.endsWith('.pt') || filename.endsWith('.pth') || filename.endsWith('.bin')) return 'pytorch';
    return 'gguf'; // default
  }

  /**
   * Parse quantization from filename
   */
  private parseQuantization(filename: string): string | undefined {
    const patterns = [
      /Q(\d+)_K_[MS]/i,
      /q(\d+)/i,
      /int(\d+)/i,
      /fp(\d+)/i,
    ];
    
    for (const pattern of patterns) {
      const match = filename.match(pattern);
      if (match) {
        return match[0].toUpperCase();
      }
    }
    
    return undefined;
  }

  /**
   * Estimate context length from filename
   */
  private estimateContextLength(filename: string): number {
    if (filename.includes('32k')) return 32768;
    if (filename.includes('16k')) return 16384;
    if (filename.includes('8k')) return 8192;
    if (filename.includes('4k')) return 4096;
    return 2048; // default
  }

  /**
   * List all downloaded models
   */
  async listDownloadedModels(): Promise<ModelMetadata[]> {
    const models: ModelMetadata[] = [];
    
    try {
      const dirs = await fs.readdir(this.modelsDir);
      
      for (const dir of dirs) {
        const modelDir = path.join(this.modelsDir, dir);
        const stats = await fs.stat(modelDir);
        
        if (stats.isDirectory()) {
          const files = await fs.readdir(modelDir);
          
          // Find model files
          for (const file of files) {
            if (this.isModelFile(file)) {
              const modelPath = path.join(modelDir, file);
              const metadata = await this.getModelMetadata(modelPath);
              models.push(metadata);
            }
          }
        }
      }
    } catch {
      // Models directory doesn't exist yet
    }
    
    return models;
  }

  /**
   * Check if file is a model file
   */
  private isModelFile(filename: string): boolean {
    const modelExtensions = [
      '.gguf', '.onnx', '.ort', '.safetensors',
      '.pt', '.pth', '.bin',
    ];
    
    return modelExtensions.some(ext => filename.endsWith(ext));
  }

  /**
   * Delete a downloaded model
   */
  async deleteModel(modelId: string): Promise<void> {
    const modelDir = path.join(this.modelsDir, modelId.replace('/', '_'));
    await fs.rm(modelDir, { recursive: true, force: true });
    console.log(`Deleted model: ${modelId}`);
  }

  /**
   * Get total disk usage of all models
   */
  async getTotalDiskUsage(): Promise<number> {
    let totalSize = 0;
    const models = await this.listDownloadedModels();
    
    for (const model of models) {
      totalSize += model.size;
    }
    
    return totalSize;
  }

  /**
   * Clear model cache
   */
  async clearCache(): Promise<void> {
    await fs.rm(this.cacheDir, { recursive: true, force: true });
    await fs.mkdir(this.cacheDir, { recursive: true });
    console.log('Cache cleared');
  }
}