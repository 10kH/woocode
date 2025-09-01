/**
 * @license
 * Copyright 2025 WooCode
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Provider interface for different LLM backends
 */
export interface LLMProvider {
  name: string;
  type: 'api' | 'local';
  
  /**
   * Initialize the provider
   */
  initialize(): Promise<void>;
  
  /**
   * Check if the provider is available
   */
  isAvailable(): Promise<boolean>;
  
  /**
   * List available models
   */
  listModels(): Promise<ModelInfo[]>;
  
  /**
   * Generate content from the model
   */
  generateContent(
    model: string,
    messages: Message[],
    options?: GenerateOptions
  ): Promise<GenerateResponse>;
  
  /**
   * Stream content from the model
   */
  streamContent(
    model: string,
    messages: Message[],
    options?: GenerateOptions
  ): AsyncGenerator<GenerateResponse>;
}

export interface ModelInfo {
  id: string;
  name: string;
  description?: string;
  contextLength?: number;
  provider: string;
  capabilities?: {
    vision?: boolean;
    functionCalling?: boolean;
    streaming?: boolean;
  };
}

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'function';
  content: string | MessageContent[];
  name?: string; // For function messages
}

export interface MessageContent {
  type: 'text' | 'image' | 'function_call' | 'function_result';
  text?: string;
  image?: {
    url: string;
    mimeType?: string;
  };
  functionCall?: {
    name: string;
    arguments: Record<string, any>;
  };
  functionResult?: {
    name: string;
    result: any;
  };
}

export interface GenerateOptions {
  temperature?: number;
  topP?: number;
  topK?: number;
  maxTokens?: number;
  stopSequences?: string[];
  functions?: FunctionDefinition[];
  systemPrompt?: string;
}

export interface FunctionDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>; // JSON Schema
}

export interface GenerateResponse {
  content: string;
  functionCalls?: {
    name: string;
    arguments: Record<string, any>;
  }[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason?: 'stop' | 'length' | 'function_call' | 'error';
}

export interface ProviderConfig {
  type?: string;
  apiKey?: string;
  baseUrl?: string;
  models?: string[];
  defaultModel?: string;
  options?: Record<string, any>;
  settings?: {
    apiKeys?: {
      openai?: string;
      anthropic?: string;
      gemini?: string;
    };
  };
}