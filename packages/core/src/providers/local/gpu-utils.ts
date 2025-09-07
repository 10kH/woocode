/**
 * @license
 * Copyright 2025 WooCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'child_process';
import * as os from 'os';

/**
 * GPU information
 */
export interface GPUInfo {
  type: 'nvidia' | 'amd' | 'apple' | 'intel' | 'unknown';
  name: string;
  vram: number; // in GB
  driver?: string;
  cuda?: string;
  rocm?: string;
  compute?: string;
}

/**
 * GPU acceleration settings
 */
export interface GPUSettings {
  device: 'cuda' | 'rocm' | 'mps' | 'cpu';
  deviceIndex?: number;
  layers?: number; // Number of layers to offload to GPU
  threads?: number;
  batchSize?: number;
  precision?: 'fp16' | 'fp32' | 'int8' | 'int4';
}

/**
 * GPU detection and configuration utilities
 */
export class GPUUtils {
  /**
   * Detect available GPUs
   */
  static async detectGPUs(): Promise<GPUInfo[]> {
    const gpus: GPUInfo[] = [];
    
    // Try NVIDIA GPUs
    const nvidiaGPUs = this.detectNvidiaGPUs();
    gpus.push(...nvidiaGPUs);
    
    // Try AMD GPUs
    const amdGPUs = this.detectAMDGPUs();
    gpus.push(...amdGPUs);
    
    // Try Apple Silicon
    const appleGPU = this.detectAppleGPU();
    if (appleGPU) {
      gpus.push(appleGPU);
    }
    
    // Try Intel GPUs
    const intelGPUs = this.detectIntelGPUs();
    gpus.push(...intelGPUs);
    
    return gpus;
  }

  /**
   * Detect NVIDIA GPUs
   */
  private static detectNvidiaGPUs(): GPUInfo[] {
    const gpus: GPUInfo[] = [];
    
    try {
      // Use nvidia-smi to detect NVIDIA GPUs
      const output = execSync('nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader', {
        encoding: 'utf8',
      });
      
      const lines = output.trim().split('\n');
      for (const line of lines) {
        const [name, memory, driver] = line.split(',').map(s => s.trim());
        const vram = parseInt(memory) / 1024; // Convert MB to GB
        
        // Get CUDA version
        let cuda = 'unknown';
        try {
          const cudaOutput = execSync('nvidia-smi --query-gpu=compute_cap --format=csv,noheader', {
            encoding: 'utf8',
          });
          cuda = cudaOutput.trim();
        } catch {}
        
        gpus.push({
          type: 'nvidia',
          name,
          vram: Math.round(vram),
          driver,
          cuda,
          compute: cuda,
        });
      }
    } catch {
      // nvidia-smi not available
    }
    
    return gpus;
  }

  /**
   * Detect AMD GPUs
   */
  private static detectAMDGPUs(): GPUInfo[] {
    const gpus: GPUInfo[] = [];
    
    try {
      // Use rocm-smi to detect AMD GPUs
      const output = execSync('rocm-smi --showproductname --showmeminfo vram --csv', {
        encoding: 'utf8',
      });
      
      // Parse rocm-smi output
      const lines = output.trim().split('\n');
      const deviceLine = lines.find(l => l.includes('card'));
      const vramLine = lines.find(l => l.includes('VRAM Total Memory'));
      
      if (deviceLine && vramLine) {
        const name = deviceLine.split(',')[1]?.trim() || 'AMD GPU';
        const vramMatch = vramLine.match(/(\d+)/);
        const vram = vramMatch ? parseInt(vramMatch[1]) / 1024 : 8; // Convert MB to GB
        
        // Get ROCm version
        let rocm = 'unknown';
        try {
          const rocmOutput = execSync('rocm-smi --showdriverversion', {
            encoding: 'utf8',
          });
          const rocmMatch = rocmOutput.match(/(\d+\.\d+)/);
          if (rocmMatch) {
            rocm = rocmMatch[1];
          }
        } catch {}
        
        gpus.push({
          type: 'amd',
          name,
          vram: Math.round(vram),
          rocm,
        });
      }
    } catch {
      // rocm-smi not available
    }
    
    return gpus;
  }

  /**
   * Detect Apple Silicon GPU
   */
  private static detectAppleGPU(): GPUInfo | null {
    if (os.platform() !== 'darwin') {
      return null;
    }
    
    try {
      // Check if this is Apple Silicon
      const output = execSync('sysctl -n machdep.cpu.brand_string', {
        encoding: 'utf8',
      });
      
      if (output.includes('Apple')) {
        // Parse chip model
        const chipMatch = output.match(/Apple (M\d+\s*(?:Pro|Max|Ultra)?)/i);
        const chip = chipMatch ? chipMatch[1] : 'Apple Silicon';
        
        // Estimate VRAM based on chip model
        let vram = 8; // Default
        if (chip.includes('Pro')) vram = 16;
        if (chip.includes('Max')) vram = 32;
        if (chip.includes('Ultra')) vram = 64;
        if (chip.includes('M3')) vram = Math.min(vram * 1.5, 128);
        
        return {
          type: 'apple',
          name: chip,
          vram,
        };
      }
    } catch {
      // Not Apple Silicon
    }
    
    return null;
  }

  /**
   * Detect Intel GPUs
   */
  private static detectIntelGPUs(): GPUInfo[] {
    const gpus: GPUInfo[] = [];
    
    try {
      // Use clinfo to detect Intel GPUs with OpenCL support
      const output = execSync('clinfo -l', {
        encoding: 'utf8',
      });
      
      if (output.includes('Intel')) {
        // Parse Intel GPU info
        const lines = output.split('\n');
        const intelLine = lines.find(l => l.includes('Intel'));
        
        if (intelLine) {
          const name = intelLine.includes('Arc') ? 'Intel Arc' : 'Intel GPU';
          const vram = intelLine.includes('Arc') ? 8 : 4; // Estimate
          
          gpus.push({
            type: 'intel',
            name,
            vram,
          });
        }
      }
    } catch {
      // clinfo not available
    }
    
    return gpus;
  }

  /**
   * Get optimal GPU settings for a model
   */
  static getOptimalSettings(gpu: GPUInfo, modelSize: number): GPUSettings {
    const settings: GPUSettings = {
      device: 'cpu',
      threads: os.cpus().length,
    };
    
    // Determine device based on GPU type
    switch (gpu.type) {
      case 'nvidia':
        settings.device = 'cuda';
        settings.deviceIndex = 0;
        break;
      case 'amd':
        settings.device = 'rocm';
        settings.deviceIndex = 0;
        break;
      case 'apple':
        settings.device = 'mps';
        break;
      case 'intel':
        // Intel GPUs typically use CPU inference with acceleration
        settings.device = 'cpu';
        break;
    }
    
    // Calculate how many layers can fit in VRAM
    if (settings.device !== 'cpu') {
      const modelSizeGB = modelSize / (1024 * 1024 * 1024);
      const availableVRAM = gpu.vram * 0.8; // Leave 20% buffer
      
      if (modelSizeGB <= availableVRAM) {
        // Full model fits in VRAM
        settings.layers = -1; // All layers
        settings.batchSize = 512;
        settings.precision = 'fp16';
      } else {
        // Partial offloading
        const ratio = availableVRAM / modelSizeGB;
        settings.layers = Math.floor(32 * ratio); // Assume 32 layers total
        settings.batchSize = 256;
        settings.precision = 'fp16';
      }
    } else {
      // CPU inference
      settings.batchSize = 128;
      settings.precision = 'fp32';
    }
    
    return settings;
  }

  /**
   * Check if CUDA is available
   */
  static hasCUDA(): boolean {
    try {
      execSync('nvidia-smi', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if ROCm is available
   */
  static hasROCm(): boolean {
    try {
      execSync('rocm-smi', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if Metal Performance Shaders is available
   */
  static hasMPS(): boolean {
    return os.platform() === 'darwin' && os.arch() === 'arm64';
  }

  /**
   * Get recommended model based on available VRAM
   */
  static recommendModel(vram: number): string {
    if (vram >= 80) {
      return 'Qwen/Qwen3-Coder-480B-A35B-Instruct';
    } else if (vram >= 48) {
      return 'Qwen/Qwen2.5-Coder-32B-Instruct';
    } else if (vram >= 24) {
      return 'Qwen/Qwen3-Coder-30B-A3B-Instruct';
    } else if (vram >= 16) {
      return 'Qwen/Qwen2.5-Coder-14B-Instruct';
    } else if (vram >= 8) {
      return 'Qwen/Qwen2.5-Coder-7B-Instruct';
    } else if (vram >= 4) {
      return 'Qwen/Qwen2.5-Coder-3B-Instruct';
    } else {
      return 'Qwen/Qwen2.5-Coder-1.5B-Instruct';
    }
  }

  /**
   * Format GPU info for display
   */
  static formatGPUInfo(gpu: GPUInfo): string {
    let info = `${gpu.name} (${gpu.vram}GB VRAM)`;
    
    if (gpu.cuda) {
      info += ` - CUDA ${gpu.cuda}`;
    } else if (gpu.rocm) {
      info += ` - ROCm ${gpu.rocm}`;
    } else if (gpu.type === 'apple') {
      info += ' - Metal';
    }
    
    return info;
  }

  /**
   * Check system memory
   */
  static getSystemMemory(): { total: number; free: number } {
    const totalMem = os.totalmem() / (1024 * 1024 * 1024); // Convert to GB
    const freeMem = os.freemem() / (1024 * 1024 * 1024);
    
    return {
      total: Math.round(totalMem),
      free: Math.round(freeMem),
    };
  }

  /**
   * Check if system can run a model
   */
  static canRunModel(modelSizeGB: number, gpu?: GPUInfo): boolean {
    if (gpu && gpu.vram >= modelSizeGB) {
      return true; // Can run on GPU
    }
    
    // Check if can run on CPU
    const memory = this.getSystemMemory();
    return memory.free >= modelSizeGB * 1.5; // Need 1.5x model size
  }
}