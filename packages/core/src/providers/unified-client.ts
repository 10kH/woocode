/**
 * @license
 * Copyright 2025 WooCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';
import type { Content, Part } from '@google/genai';
import { GeminiEventType } from '../core/turn.js';
import { GeminiClient } from '../core/client.js';
import { ProviderAdapter } from './adapter.js';

/**
 * Unified client that can use either GeminiClient or ProviderAdapter
 * Provides a consistent interface for both traditional and provider-based systems
 */
export class UnifiedClient extends GeminiClient {
  private providerAdapter?: ProviderAdapter;
  private useProvider: boolean = false;
  protected initialized: boolean = false;
  private conversationHistory: Content[] = [];  // Add conversation history tracking

  constructor(config: Config) {
    super(config);
    
    // Check if we should use provider system
    const shouldUseProvider = process.env['WOOCODE_PROVIDER'] || 
                             (config as any).useProviderSystem ||
                             (config as any).parameters?.useProviderSystem;
    
    if (shouldUseProvider) {
      this.providerAdapter = new ProviderAdapter(config);
      this.useProvider = true;
    }
  }

  override async initialize(contentGeneratorConfig?: any): Promise<void> {
    if (this.useProvider && this.providerAdapter) {
      // Initialize provider adapter
      const config = this.getConfig();
      // Check for HF token to prioritize huggingface-api for large models
      const hasHfToken = !!(process.env['HF_TOKEN'] || process.env['HUGGINGFACE_TOKEN']);
      const preferredProvider = process.env['WOOCODE_PROVIDER'] || 
                               (config as any).parameters?.provider || 
                               (hasHfToken ? 'huggingface-api' : 'huggingface');
      
      try {
        await this.providerAdapter.initialize(preferredProvider);
        this.initialized = true;
        console.log(`Using provider: ${preferredProvider}`);
      } catch (error) {
        console.log(`Failed to initialize ${preferredProvider}, trying auto-detect...`);
        await this.providerAdapter.initialize();
        this.initialized = true;
      }
    } else {
      // Use traditional initialization
      await super.initialize(contentGeneratorConfig);
      this.initialized = true;
    }
  }

  override async *sendMessageStream(
    parts: Part[],
    signal?: AbortSignal,
    promptId?: string,
  ): AsyncGenerator<any> {
    if (this.useProvider && this.providerAdapter) {
      // Use provider adapter for generation
      // Ensure parts is an array
      const partsArray = Array.isArray(parts) ? parts : [parts];
      
      // Build full message history including system prompt
      const messages: any[] = [];
      
      // Add system prompt
      messages.push({
        role: 'system',
        content: 'You are WooCode, a helpful AI coding assistant. Be concise and helpful. Answer questions directly.'
      });
      
      // Add conversation history
      this.conversationHistory.forEach(msg => {
        const role = msg.role === 'model' ? 'assistant' : msg.role;
        const content = msg.parts?.map((p: any) => p.text || '').join('\n') || '';
        if (content) {
          messages.push({ role, content });
        }
      });
      
      // Add current user message
      const currentContent = partsArray
        .filter((p: Part) => p && typeof p === 'object' && 'text' in p)
        .map((p: Part) => (p as any).text)
        .join('\n');
      
      messages.push({
        role: 'user',
        content: currentContent,
      });

      try {
        // Get the active provider and generate content
        const activeProvider = this.providerAdapter.getActiveProvider();
        if (!activeProvider) {
          throw new Error('No active provider available');
        }

        // Get current model from provider
        const modelId = this.providerAdapter.getCurrentModel();
        if (!modelId) {
          throw new Error('No model selected');
        }
        
        // Use streamContent method from provider
        const stream = activeProvider.streamContent(
          modelId,
          messages,
          { temperature: 0.7, maxTokens: 2048 }
        );

        // Store user message in history
        this.conversationHistory.push({
          role: 'user',
          parts: [{ text: currentContent }],
        });

        let fullResponse = '';
        for await (const response of stream) {
          if (signal?.aborted) {
            break;
          }

          const content = response.content || '';
          fullResponse += content;

          // Convert to Gemini event format
          yield {
            type: GeminiEventType.Content,
            value: content,
          };
        }

        // Store assistant response in history
        if (fullResponse) {
          this.conversationHistory.push({
            role: 'model',
            parts: [{ text: fullResponse }],
          });
        }

        // Send completion event
        yield {
          type: GeminiEventType.Finished,
          value: { ok: true },
        };
      } catch (error) {
        console.error('Provider generation failed:', error);
        throw error;
      }
    } else {
      // Use traditional Gemini client
      if (!signal) {
        // Create a dummy signal if not provided
        const controller = new AbortController();
        signal = controller.signal;
      }
      yield* super.sendMessageStream(parts, signal, promptId || 'default');
    }
  }

  override isInitialized(): boolean {
    if (this.useProvider) {
      return this.initialized;
    }
    return super.isInitialized();
  }

  override getHistory(): Content[] {
    if (this.useProvider) {
      return this.conversationHistory;
    }
    return super.getHistory();
  }

  override setHistory(history: Content[], options?: any): void {
    if (this.useProvider) {
      this.conversationHistory = history;
      return;
    }
    super.setHistory(history, options);
  }
  
  // Helper method to access config
  protected getConfig(): Config {
    return (this as any).config;
  }
}