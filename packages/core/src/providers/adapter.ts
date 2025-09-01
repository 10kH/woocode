/**
 * @license
 * Copyright 2025 WooCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  Content,
  GenerateContentResponse,
  GenerateContentConfig,
  Part,
} from '@google/genai';
import type { Config } from '../config/config.js';
import type { LLMProvider, Message, GenerateOptions } from './types.js';
import { ProviderManager } from './manager.js';

/**
 * Adapter to bridge between existing GeminiClient interface and new provider system
 */
export class ProviderAdapter {
  private providerManager: ProviderManager;
  private config: Config;
  private currentProvider?: LLMProvider;
  private currentModel?: string;

  constructor(config: Config) {
    this.config = config;
    // Pass settings to provider manager for API key configuration
    const settings = (config as any).parameters?.settings;
    this.providerManager = new ProviderManager(settings);
  }

  /**
   * Initialize the provider system
   */
  async initialize(providerName?: string): Promise<void> {
    if (providerName) {
      // Use specified provider
      await this.providerManager.setActiveProvider(providerName);
    } else {
      // Auto-detect best provider
      await this.providerManager.autoDetectProvider();
    }
    
    this.currentProvider = this.providerManager.getActiveProvider();
    
    // If HuggingFace, recommend model based on GPU
    if (this.currentProvider.name === 'HuggingFace') {
      const hfProvider = this.currentProvider as any;
      this.currentModel = await hfProvider.recommendModel();
      console.log(`Selected model: ${this.currentModel}`);
    }
  }

  /**
   * Convert Content to Message format for providers
   */
  private contentToMessage(content: Content): Message {
    const role = content.role === 'model' ? 'assistant' : 
                 content.role === 'user' ? 'user' : 
                 content.role === 'system' ? 'system' : 'assistant';

    // Handle parts
    if (content.parts && content.parts.length > 0) {
      const textParts = content.parts
        .filter((p: Part) => 'text' in p)
        .map((p: Part) => (p as any).text)
        .join('\n');
      
      return {
        role,
        content: textParts,
      };
    }

    return {
      role,
      content: '',
    };
  }

  /**
   * Convert provider response to Gemini format
   */
  private responseToGeminiFormat(response: any): GenerateContentResponse {
    const mockResponse = {
      text: response.content || '',
      functionCalls: () => response.functionCalls || [],
      executableCode: () => undefined,
      codeExecutionResult: () => undefined,
      data: {
        candidates: [{
          content: {
            role: 'model',
            parts: [{ text: response.content }],
          },
          finishReason: response.finishReason || 'STOP',
          index: 0,
          safetyRatings: [],
        }],
        usageMetadata: response.usage ? {
          promptTokenCount: response.usage.promptTokens,
          candidatesTokenCount: response.usage.completionTokens,
          totalTokenCount: response.usage.totalTokens,
        } : undefined,
      },
      candidates: [{
        content: {
          role: 'model',
          parts: [{ text: response.content }],
        },
        finishReason: response.finishReason || 'STOP',
        index: 0,
        safetyRatings: [],
      }],
      usageMetadata: response.usage ? {
        promptTokenCount: response.usage.promptTokens,
        candidatesTokenCount: response.usage.completionTokens,
        totalTokenCount: response.usage.totalTokens,
      } : undefined,
    } as unknown as GenerateContentResponse;
    return mockResponse;
  }

  /**
   * Generate content using the active provider
   */
  async generateContent(
    contents: Content[],
    config?: GenerateContentConfig
  ): Promise<GenerateContentResponse> {
    if (!this.currentProvider) {
      throw new Error('No provider initialized');
    }

    // Convert contents to messages
    const messages = contents.map(c => this.contentToMessage(c));

    // Convert config to options
    const genConfig = (config as any)?.generationConfig;
    const options: GenerateOptions = {
      temperature: genConfig?.temperature,
      topP: genConfig?.topP,
      topK: genConfig?.topK,
      maxTokens: genConfig?.maxOutputTokens,
      stopSequences: genConfig?.stopSequences,
    };

    // Add tools/functions if provided
    if (config?.tools && config.tools.length > 0) {
      options.functions = config.tools.flatMap((tool: any) => 
        tool.functionDeclarations?.map((func: any) => ({
          name: func.name,
          description: func.description || '',
          parameters: func.parameters || {},
        })) || []
      );
    }

    // Generate using provider
    const model = this.currentModel || this.config.getModel() || 'default';
    const response = await this.currentProvider.generateContent(
      model,
      messages,
      options
    );

    // Convert response to Gemini format
    return this.responseToGeminiFormat(response);
  }

  /**
   * Stream content using the active provider
   */
  async *streamContent(
    contents: Content[],
    config?: GenerateContentConfig
  ): AsyncGenerator<GenerateContentResponse> {
    if (!this.currentProvider) {
      throw new Error('No provider initialized');
    }

    // Convert contents to messages
    const messages = contents.map(c => this.contentToMessage(c));

    // Convert config to options
    const genConfig = (config as any)?.generationConfig;
    const options: GenerateOptions = {
      temperature: genConfig?.temperature,
      topP: genConfig?.topP,
      topK: genConfig?.topK,
      maxTokens: genConfig?.maxOutputTokens,
      stopSequences: genConfig?.stopSequences,
    };

    // Stream using provider
    const model = this.currentModel || this.config.getModel() || 'default';
    const stream = this.currentProvider.streamContent(
      model,
      messages,
      options
    );

    for await (const response of stream) {
      yield this.responseToGeminiFormat(response);
    }
  }

  /**
   * Get available models
   */
  async getAvailableModels(): Promise<any[]> {
    return this.providerManager.listAllModels();
  }

  /**
   * Switch provider
   */
  async switchProvider(providerId: string, modelId?: string): Promise<void> {
    await this.providerManager.setActiveProvider(providerId);
    this.currentProvider = this.providerManager.getActiveProvider();
    
    if (modelId) {
      this.currentModel = modelId;
    }
  }

  /**
   * Get current provider info
   */
  getCurrentProviderInfo(): { provider: string; model: string } {
    return {
      provider: this.currentProvider?.name || 'none',
      model: this.currentModel || 'default',
    };
  }
}