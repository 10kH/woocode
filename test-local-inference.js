#!/usr/bin/env node

/**
 * Test script for local inference capabilities
 */

import { ProviderManager } from './packages/core/dist/src/providers/manager.js';
import { LlamaCppProvider } from './packages/core/dist/src/providers/local/llama-cpp-provider.js';
import { TransformersProvider } from './packages/core/dist/src/providers/local/transformers-provider.js';
import { GPUUtils } from './packages/core/dist/src/providers/local/gpu-utils.js';
import { ModelLoader } from './packages/core/dist/src/providers/local/onnx-loader.js';

async function testGPUDetection() {
  console.log('\n=== GPU Detection Test ===\n');
  
  const gpus = await GPUUtils.detectGPUs();
  
  if (gpus.length === 0) {
    console.log('No GPUs detected. Will use CPU inference.');
  } else {
    console.log(`Found ${gpus.length} GPU(s):`);
    for (const gpu of gpus) {
      console.log(`  - ${GPUUtils.formatGPUInfo(gpu)}`);
      const recommendedModel = GPUUtils.recommendModel(gpu.vram);
      console.log(`    Recommended model: ${recommendedModel}`);
    }
  }
  
  const memory = GPUUtils.getSystemMemory();
  console.log(`\nSystem Memory: ${memory.total}GB total, ${memory.free}GB free`);
}

async function testModelLoader() {
  console.log('\n=== Model Loader Test ===\n');
  
  const loader = new ModelLoader();
  await loader.initialize();
  
  const downloadedModels = await loader.listDownloadedModels();
  
  if (downloadedModels.length === 0) {
    console.log('No models downloaded yet.');
  } else {
    console.log(`Found ${downloadedModels.length} downloaded model(s):`);
    for (const model of downloadedModels) {
      const sizeGB = (model.size / (1024 * 1024 * 1024)).toFixed(2);
      console.log(`  - ${model.name} (${sizeGB}GB, ${model.format})`);
      if (model.quantization) {
        console.log(`    Quantization: ${model.quantization}`);
      }
    }
    
    const totalSize = await loader.getTotalDiskUsage();
    const totalGB = (totalSize / (1024 * 1024 * 1024)).toFixed(2);
    console.log(`\nTotal disk usage: ${totalGB}GB`);
  }
}

async function testProviderDetection() {
  console.log('\n=== Provider Detection Test ===\n');
  
  // Test llama.cpp provider
  const llamaCpp = new LlamaCppProvider();
  const llamaCppAvailable = await llamaCpp.isAvailable();
  console.log(`llama.cpp: ${llamaCppAvailable ? '✓ Available' : '✗ Not installed'}`);
  
  // Test transformers.js provider
  const transformers = new TransformersProvider();
  const transformersAvailable = await transformers.isAvailable();
  console.log(`transformers.js: ${transformersAvailable ? '✓ Available' : '✗ Not installed'}`);
  
  // Test provider manager auto-detection
  const manager = new ProviderManager();
  
  try {
    const detected = await manager.autoDetectProvider();
    console.log(`\nAuto-detected provider: ${detected}`);
    
    const provider = manager.getActiveProvider();
    if (provider) {
      const models = await provider.listModels();
      console.log(`Available models: ${models.length}`);
    }
  } catch (error) {
    console.log('\nNo providers available for auto-detection');
    console.log('To enable local inference, install one of:');
    console.log('  - llama.cpp: Follow instructions in README');
    console.log('  - transformers.js: npm install @xenova/transformers');
  }
}

async function testInference() {
  console.log('\n=== Inference Test ===\n');
  
  const manager = new ProviderManager();
  
  try {
    // Try to use HuggingFace provider with local inference
    await manager.setActiveProvider('huggingface');
    const provider = manager.getActiveProvider();
    
    if (provider) {
      console.log('Testing inference with a simple prompt...');
      
      const messages = [
        {
          role: 'user',
          content: 'Write a simple Python function that adds two numbers.',
        },
      ];
      
      const response = await provider.generateContent(
        'default', // Will use recommended model
        messages,
        {
          maxTokens: 100,
          temperature: 0.7,
        }
      );
      
      console.log('\nGenerated response:');
      console.log(response.content);
      
      if (response.usage) {
        console.log(`\nTokens used: ${response.usage.totalTokens}`);
      }
    }
  } catch (error) {
    console.log('Inference test failed:', error.message);
    console.log('\nTo run inference locally:');
    console.log('1. Install llama.cpp or transformers.js');
    console.log('2. Download a model (automatic on first use)');
    console.log('3. Run this test again');
  }
}

// Main test runner
async function main() {
  console.log('🚀 WooCode Local Inference Test Suite\n');
  console.log('Testing local AI capabilities...\n');
  
  try {
    await testGPUDetection();
    await testModelLoader();
    await testProviderDetection();
    
    // Only run inference if we have a provider available
    const manager = new ProviderManager();
    const detected = await manager.autoDetectProvider().catch(() => null);
    if (detected) {
      await testInference();
    }
    
    console.log('\n✅ Tests completed!');
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

// Run tests
main().catch(console.error);