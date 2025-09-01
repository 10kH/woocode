/**
 * @license
 * Copyright 2025 WooCode
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Provider-agnostic types for content generation
 * These types abstract away from Google GenAI specifics
 */

// Role types
export type Role = 'user' | 'assistant' | 'system' | 'function';

// Content part types
export interface TextPart {
  type: 'text';
  text: string;
}

export interface ImagePart {
  type: 'image';
  mimeType: string;
  data: string; // base64
}

export interface FunctionCallPart {
  type: 'functionCall';
  functionCall: {
    name: string;
    args: Record<string, any>;
  };
}

export interface FunctionResponsePart {
  type: 'functionResponse';
  functionResponse: {
    name: string;
    response: any;
  };
}

export interface CodeExecutionPart {
  type: 'codeExecution';
  code: string;
  language: string;
}

export interface CodeExecutionResultPart {
  type: 'codeExecutionResult';
  result: string;
  output?: string;
}

export type ContentPart = 
  | TextPart 
  | ImagePart 
  | FunctionCallPart 
  | FunctionResponsePart
  | CodeExecutionPart
  | CodeExecutionResultPart;

// Main content interface
export interface WoocodeContent {
  role: Role;
  parts: ContentPart[];
}

// Tool/Function definitions
export interface FunctionParameter {
  type: string;
  description?: string;
  enum?: string[];
  items?: FunctionParameter;
  properties?: Record<string, FunctionParameter>;
  required?: string[];
}

export interface FunctionDeclaration {
  name: string;
  description: string;
  parameters: FunctionParameter;
}

export interface WoocodeTool {
  type: 'function';
  function: FunctionDeclaration;
}

// Generation configuration
export interface GenerationConfig {
  temperature?: number;
  topP?: number;
  topK?: number;
  maxOutputTokens?: number;
  stopSequences?: string[];
  candidateCount?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  responseMimeType?: string;
  responseSchema?: any;
}

// Safety settings
export interface SafetyRating {
  category: string;
  probability: string;
  probabilityScore?: number;
  severity?: string;
  severityScore?: number;
}

export interface SafetySetting {
  category: string;
  threshold: string;
}

// Response types
export type FinishReason = 
  | 'STOP'
  | 'MAX_TOKENS'
  | 'SAFETY'
  | 'RECITATION'
  | 'OTHER'
  | 'TOOL_CALLS'
  | 'CONTENT_FILTER';

export interface GenerationCandidate {
  content: WoocodeContent;
  finishReason?: FinishReason;
  safetyRatings?: SafetyRating[];
  citationMetadata?: any;
  tokenCount?: number;
  groundingMetadata?: any;
  index: number;
}

export interface WoocodeGenerateResponse {
  candidates: GenerationCandidate[];
  promptFeedback?: {
    blockReason?: string;
    safetyRatings?: SafetyRating[];
  };
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}

// Request types
export interface WoocodeGenerateRequest {
  contents: WoocodeContent[];
  generationConfig?: GenerationConfig;
  safetySettings?: SafetySetting[];
  tools?: WoocodeTool[];
  toolConfig?: {
    functionCallingConfig?: {
      mode?: 'AUTO' | 'ANY' | 'NONE';
      allowedFunctionNames?: string[];
    };
  };
  systemInstruction?: WoocodeContent;
  cachedContent?: string;
}

// Token counting
export interface TokenCountRequest {
  contents: WoocodeContent[];
  generationConfig?: GenerationConfig;
}

export interface TokenCountResponse {
  totalTokens: number;
  cachedContentTokenCount?: number;
}

// Embeddings
export interface EmbedRequest {
  content: string | WoocodeContent;
  taskType?: string;
  title?: string;
  outputDimensionality?: number;
}

export interface EmbedResponse {
  embedding: number[];
}

// Streaming
export interface StreamChunk {
  candidates?: GenerationCandidate[];
  promptFeedback?: any;
  usageMetadata?: any;
}

// Provider-specific adapter interface
export interface ProviderAdapter {
  /**
   * Convert from WooCode format to provider-specific format
   */
  toProviderRequest(request: WoocodeGenerateRequest): any;
  
  /**
   * Convert from provider-specific response to WooCode format
   */
  fromProviderResponse(response: any): WoocodeGenerateResponse;
  
  /**
   * Convert streaming chunk
   */
  fromProviderStreamChunk(chunk: any): StreamChunk;
  
  /**
   * Convert token count response
   */
  fromProviderTokenCount(response: any): TokenCountResponse;
  
  /**
   * Convert embedding response
   */
  fromProviderEmbedding(response: any): EmbedResponse;
}