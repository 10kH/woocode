/**
 * @license
 * Copyright 2025 WooCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { LLMProvider, ProviderConfig, ModelInfo } from './types.js';
import { OllamaProvider } from './ollama.js';
import { HuggingFaceJSDynamicProvider } from './huggingface-js-dynamic.js';
import { HuggingFaceAPIProvider } from './huggingface-api.js';
import { QwenLocalProvider } from './qwen-local.js';
import { LlamaCppProvider } from './llamacpp.js';
import { OpenAIProvider } from './openai.js';
import { AnthropicProvider } from './anthropic.js';
import { GeminiProvider } from './gemini.js';

/**
 * Manager for LLM providers
 */
export class ProviderManager {
  private providers: Map<string, LLMProvider> = new Map();
  private activeProvider?: LLMProvider;
  private defaultProvider = 'huggingface'; // Default to HuggingFace for best quality

  constructor(settings?: any) {
    
    // Initialize local providers
    this.registerProvider('qwen-local', new QwenLocalProvider());  // Qwen3-Coder local server
    this.registerProvider('huggingface', new HuggingFaceJSDynamicProvider());
    this.registerProvider('huggingface-api', new HuggingFaceAPIProvider());
    this.registerProvider('llamacpp', new LlamaCppProvider());
    this.registerProvider('ollama', new OllamaProvider());
    
    // Initialize API providers with settings (will check for API keys during initialization)
    const providerConfig = { settings };
    this.registerProvider('openai', new OpenAIProvider(providerConfig));
    this.registerProvider('anthropic', new AnthropicProvider(providerConfig));
    this.registerProvider('gemini', new GeminiProvider(providerConfig));
  }

  /**
   * Register a new provider
   */
  registerProvider(id: string, provider: LLMProvider): void {
    this.providers.set(id, provider);
  }

  /**
   * Get a provider by ID
   */
  getProvider(id: string): LLMProvider | undefined {
    return this.providers.get(id);
  }

  /**
   * List all registered providers
   */
  listProviders(): { id: string; provider: LLMProvider }[] {
    return Array.from(this.providers.entries()).map(([id, provider]) => ({
      id,
      provider,
    }));
  }

  /**
   * Set the active provider
   */
  async setActiveProvider(id: string): Promise<void> {
    const provider = this.providers.get(id);
    if (!provider) {
      throw new Error(`Provider ${id} not found`);
    }

    // Initialize the provider if needed
    await provider.initialize();
    
    // Check if provider is available
    const isAvailable = await provider.isAvailable();
    if (!isAvailable) {
      throw new Error(`Provider ${id} is not available`);
    }

    this.activeProvider = provider;
  }

  /**
   * Get the active provider
   */
  getActiveProvider(): LLMProvider {
    if (!this.activeProvider) {
      // Try to use default provider
      const defaultProvider = this.providers.get(this.defaultProvider);
      if (defaultProvider) {
        this.activeProvider = defaultProvider;
      } else {
        throw new Error('No active provider set');
      }
    }
    return this.activeProvider;
  }

  /**
   * Auto-detect and set the best available provider
   */
  async autoDetectProvider(): Promise<string> {
    // Priority order: HF API for large models if token available, then local providers
    const priorityOrder = ['huggingface-api', 'llamacpp', 'huggingface', 'ollama', 'gemini', 'anthropic', 'openai'];

    for (const id of priorityOrder) {
      const provider = this.providers.get(id);
      if (provider) {
        try {
          await provider.initialize();
          const isAvailable = await provider.isAvailable();
          if (isAvailable) {
            this.activeProvider = provider;
            console.log(`Auto-detected provider: ${id}`);
            return id;
          }
        } catch (error) {
          console.debug(`Provider ${id} not available:`, error);
        }
      }
    }

    throw new Error('No available providers found');
  }

  /**
   * List all available models from all providers
   */
  async listAllModels(): Promise<{ provider: string; models: ModelInfo[] }[]> {
    const results = [];

    for (const [id, provider] of this.providers.entries()) {
      try {
        const isAvailable = await provider.isAvailable();
        if (isAvailable) {
          const models = await provider.listModels();
          results.push({ provider: id, models });
        }
      } catch (error) {
        console.debug(`Failed to list models from ${id}:`, error);
      }
    }

    return results;
  }

  /**
   * Configure a provider
   */
  async configureProvider(id: string, config: ProviderConfig): Promise<void> {
    let provider: LLMProvider;

    switch (id) {
      case 'huggingface':
        // Use dynamic loading version
        provider = new HuggingFaceJSDynamicProvider(config);
        break;
      case 'llamacpp':
        provider = new LlamaCppProvider(config);
        break;
      case 'ollama':
        provider = new OllamaProvider(config);
        break;
      case 'openai':
        provider = new OpenAIProvider(config);
        break;
      case 'anthropic':
        provider = new AnthropicProvider(config);
        break;
      case 'gemini':
        provider = new GeminiProvider(config);
        break;
      default:
        throw new Error(`Unknown provider: ${id}`);
    }

    this.registerProvider(id, provider);
    await provider.initialize();
  }

  /**
   * Get provider configuration suggestions
   */
  getProviderSuggestions(): { id: string; description: string; setup: string }[] {
    return [
      {
        id: 'llamacpp',
        description: 'Llama.cpp with GGUF models (Best quality & performance)',
        setup: '1. Install llama.cpp: git clone https://github.com/ggerganov/llama.cpp && cd llama.cpp && make\n2. WooCode will auto-download GGUF models (Qwen2.5-Coder, CodeLlama)\n3. GPU acceleration supported (CUDA/ROCm)',
      },
      {
        id: 'huggingface',
        description: 'Hugging Face models with transformers.js (Easy setup, limited models)',
        setup: '1. No installation required\n2. Models download automatically\n3. Runs in JavaScript/WASM (slower than llama.cpp)',
      },
      {
        id: 'ollama',
        description: 'Local LLM using Ollama (Easy management)',
        setup: '1. Install Ollama: curl -fsSL https://ollama.com/install.sh | sh\n2. Pull a model: ollama pull qwen2.5-coder\n3. Start Ollama: ollama serve',
      },
      {
        id: 'gemini',
        description: 'Google Gemini API (Powerful cloud models)',
        setup: '1. Get API key from https://aistudio.google.com/apikey\n2. Set GEMINI_API_KEY or WOOCODE_API_KEY environment variable',
      },
      {
        id: 'openai',
        description: 'OpenAI GPT models (GPT-4, GPT-3.5)',
        setup: '1. Get API key from https://platform.openai.com/api-keys\n2. Set OPENAI_API_KEY environment variable',
      },
      {
        id: 'anthropic',
        description: 'Anthropic Claude models (Claude 3 Opus, Sonnet, Haiku)',
        setup: '1. Get API key from https://console.anthropic.com/\n2. Set ANTHROPIC_API_KEY environment variable',
      },
      // Add more providers as they're implemented
    ];
  }
}