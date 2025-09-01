/**
 * @license
 * Copyright 2025 WooCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  GenerateContentResponse,
  GenerateContentParameters,
  CountTokensResponse,
  CountTokensParameters,
  EmbedContentResponse,
  EmbedContentParameters,
} from '@google/genai';

import type { ContentGenerator } from '../core/contentGenerator.js';
import type { UserTierId } from '../code_assist/types.js';
import type { Config } from '../config/config.js';
import { ProviderManager } from './manager.js';
import { GoogleConverter } from './converters/google-converter.js';
import type { 
  WoocodeGenerateRequest,
} from './common-types.js';

/**
 * ContentGenerator implementation that uses the provider system
 */
export class ProviderContentGenerator implements ContentGenerator {
  private providerManager: ProviderManager;
  private googleConverter: GoogleConverter;
  private config: Config;
  public userTier?: UserTierId;

  constructor(config: Config) {
    this.config = config;
    this.googleConverter = new GoogleConverter();
    
    // Initialize provider manager with settings
    const settings = (config as any).parameters?.settings;
    this.providerManager = new ProviderManager(settings);
  }

  /**
   * Initialize the provider system
   */
  async initialize(): Promise<void> {
    // Check if we should use provider system
    const useProviderSystem = (this.config as any).useProviderSystem ?? true;
    
    if (!useProviderSystem) {
      throw new Error('Provider system is not enabled');
    }

    // Get provider preference
    const preferredProvider = process.env['WOOCODE_PROVIDER'] || 
                            (this.config as any).provider || 
                            'huggingface';

    try {
      // Try to use the preferred provider
      await this.providerManager.setActiveProvider(preferredProvider);
      console.log(`Using provider: ${preferredProvider}`);
    } catch (error) {
      // Fall back to auto-detection
      console.log(`Failed to use ${preferredProvider}, auto-detecting...`);
      const detected = await this.providerManager.autoDetectProvider();
      console.log(`Auto-detected provider: ${detected}`);
    }

    const activeProvider = this.providerManager.getActiveProvider();
    if (!activeProvider) {
      throw new Error('No provider available');
    }

    // Special handling for HuggingFace - GPU detection and model selection
    if (activeProvider.name === 'HuggingFace') {
      const hfProvider = activeProvider as any;
      const gpuInfo = await hfProvider.detectGPU();
      if (gpuInfo) {
        console.log(`Detected GPU: ${gpuInfo.name} with ${gpuInfo.vram}GB VRAM`);
      }
      const recommendedModel = await hfProvider.recommendModel();
      console.log(`Selected model: ${recommendedModel}`);
    }
  }

  /**
   * Generate content using the active provider
   */
  async generateContent(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<GenerateContentResponse> {
    const activeProvider = this.providerManager.getActiveProvider();
    if (!activeProvider) {
      throw new Error('No active provider');
    }

    // Convert Google request to WooCode format
    const woocodeRequest = this.googleParametersToWoocodeRequest(request);

    // Convert messages format for provider
    const messages = woocodeRequest.contents.map(content => ({
      role: content.role as 'user' | 'assistant' | 'system',
      content: content.parts
        .filter(p => p.type === 'text')
        .map(p => (p as any).text)
        .join('\n'),
    }));

    // Get selected model from config or use default
    const model = (this.config as any).getModel?.() || 'default';
    
    // Generate with provider
    const providerResponse = await activeProvider.generateContent(
      model,
      messages,
      {
        temperature: woocodeRequest.generationConfig?.temperature,
        maxTokens: woocodeRequest.generationConfig?.maxOutputTokens,
        topP: woocodeRequest.generationConfig?.topP,
        topK: woocodeRequest.generationConfig?.topK,
        stopSequences: woocodeRequest.generationConfig?.stopSequences,
        functions: woocodeRequest.tools?.map(t => ({
          name: t.function.name,
          description: t.function.description,
          parameters: t.function.parameters,
        })),
      }
    );

    // Convert response back to Google format
    return this.providerResponseToGoogleFormat(providerResponse);
  }

  /**
   * Generate content stream using the active provider
   */
  async generateContentStream(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    const activeProvider = this.providerManager.getActiveProvider();
    if (!activeProvider) {
      throw new Error('No active provider');
    }

    // Convert Google request to WooCode format
    const woocodeRequest = this.googleParametersToWoocodeRequest(request);

    // Convert messages format for provider
    const messages = woocodeRequest.contents.map(content => ({
      role: content.role as 'user' | 'assistant' | 'system',
      content: content.parts
        .filter(p => p.type === 'text')
        .map(p => (p as any).text)
        .join('\n'),
    }));

    // Get selected model from config or use default
    const model = (this.config as any).getModel?.() || 'default';
    
    // Generate stream with provider
    const providerStream = activeProvider.streamContent(
      model,
      messages,
      {
        temperature: woocodeRequest.generationConfig?.temperature,
        maxTokens: woocodeRequest.generationConfig?.maxOutputTokens,
        topP: woocodeRequest.generationConfig?.topP,
        topK: woocodeRequest.generationConfig?.topK,
        stopSequences: woocodeRequest.generationConfig?.stopSequences,
        functions: woocodeRequest.tools?.map(t => ({
          name: t.function.name,
          description: t.function.description,
          parameters: t.function.parameters,
        })),
      }
    );

    // Convert stream to Google format
    const self = this;
    async function* convertStream() {
      for await (const chunk of providerStream) {
        yield self.providerResponseToGoogleFormat(chunk);
      }
    }

    return convertStream();
  }

  /**
   * Count tokens - currently returns estimates
   */
  async countTokens(request: CountTokensParameters): Promise<CountTokensResponse> {
    // Rough estimation - most providers don't have exact token counting
    const text = JSON.stringify(request);
    const estimatedTokens = Math.ceil(text.length / 4); // Rough estimate
    
    return {
      totalTokens: estimatedTokens,
    };
  }

  /**
   * Generate embeddings - not all providers support this
   */
  async embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse> {
    // For now, return dummy embeddings
    // This would need provider-specific implementation
    const dimension = 768; // Default dimension
    const embedding = new Array(dimension).fill(0).map(() => Math.random());
    
    return {
      embeddings: [{ values: embedding }],
    } as EmbedContentResponse;
  }

  /**
   * Convert Google parameters to WooCode request
   */
  private googleParametersToWoocodeRequest(params: GenerateContentParameters): WoocodeGenerateRequest {
    // GenerateContentParameters has direct properties, not a 'request' wrapper
    const request = params as any;
    
    return {
      contents: request.contents.map((c: any) => 
        this.googleConverter.fromGoogleContent(c)
      ),
      generationConfig: request.generationConfig,
      safetySettings: request.safetySettings,
      tools: request.tools?.flatMap((t: any) => 
        t.functionDeclarations?.map((f: any) => ({
          type: 'function' as const,
          function: {
            name: f.name,
            description: f.description,
            parameters: f.parameters,
          },
        })) || []
      ),
      toolConfig: request.toolConfig,
      systemInstruction: request.systemInstruction ? 
        this.googleConverter.fromGoogleContent(request.systemInstruction) : 
        undefined,
    };
  }

  /**
   * Convert provider response to Google format
   */
  private providerResponseToGoogleFormat(response: any): GenerateContentResponse {
    // Create Google-compatible response structure
    const googleResponse = {
      text: response.content || '',
      functionCalls: () => response.functionCalls || [],
      executableCode: () => undefined,
      codeExecutionResult: () => undefined,
      data: {
        candidates: [{
          content: {
            role: 'model',
            parts: response.content ? [{ text: response.content }] : [],
          },
          finishReason: response.finishReason || 'STOP',
          index: 0,
          safetyRatings: [],
        }],
        promptFeedback: undefined,
        usageMetadata: response.usage ? {
          promptTokenCount: response.usage.promptTokens,
          candidatesTokenCount: response.usage.completionTokens,
          totalTokenCount: response.usage.totalTokens,
        } : undefined,
      },
    };

    // Add function calls if present
    if (response.functionCalls && response.functionCalls.length > 0) {
      (googleResponse.data as any).candidates[0].content.parts.push(
        ...response.functionCalls.map((fc: any) => ({
          functionCall: {
            name: fc.name,
            args: fc.arguments || fc.args || {},
          },
        }))
      );
    }

    return googleResponse as unknown as GenerateContentResponse;
  }
}