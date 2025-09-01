/**
 * @license
 * Copyright 2025 WooCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  Content,
  Part,
  GenerateContentResponse,
  GenerateContentParameters,
  FunctionCall,
  FunctionResponse as GoogleFunctionResponse,
  Tool as GoogleTool,
  FunctionDeclaration as GoogleFunctionDeclaration,
  GenerateContentConfig,
  CountTokensResponse as GoogleTokenResponse,
  CountTokensParameters,
  EmbedContentResponse,
  EmbedContentParameters,
} from '@google/genai';

import type {
  WoocodeContent,
  ContentPart,
  WoocodeGenerateResponse,
  WoocodeGenerateRequest,
  WoocodeTool,
  TokenCountResponse,
  TokenCountRequest,
  EmbedResponse,
  EmbedRequest,
  Role,
  GenerationCandidate,
  StreamChunk,
} from '../common-types.js';

/**
 * Converter between Google GenAI types and WooCode common types
 */
export class GoogleConverter {
  /**
   * Convert WooCode role to Google role
   */
  private toGoogleRole(role: Role): string {
    switch (role) {
      case 'assistant':
        return 'model';
      case 'function':
        return 'function';
      default:
        return role;
    }
  }

  /**
   * Convert Google role to WooCode role
   */
  private fromGoogleRole(role: string): Role {
    switch (role) {
      case 'model':
        return 'assistant';
      case 'function':
        return 'function';
      case 'system':
        return 'system';
      default:
        return 'user';
    }
  }

  /**
   * Convert WooCode content part to Google part
   */
  private toGooglePart(part: ContentPart): Part {
    switch (part.type) {
      case 'text':
        return { text: part.text };
      
      case 'image':
        return {
          inlineData: {
            mimeType: part.mimeType,
            data: part.data,
          },
        };
      
      case 'functionCall':
        return {
          functionCall: {
            name: part.functionCall.name,
            args: part.functionCall.args,
          } as FunctionCall,
        };
      
      case 'functionResponse':
        return {
          functionResponse: {
            name: part.functionResponse.name,
            response: part.functionResponse.response,
          } as GoogleFunctionResponse,
        };
      
      case 'codeExecution':
        return {
          executableCode: {
            language: part.language as any,
            code: part.code,
          },
        };
      
      case 'codeExecutionResult':
        return {
          codeExecutionResult: {
            outcome: 'OUTCOME_OK' as any,
            output: part.output || part.result,
          },
        };
      
      default:
        // Fallback to text
        return { text: JSON.stringify(part) };
    }
  }

  /**
   * Convert Google part to WooCode content part
   */
  private fromGooglePart(part: Part): ContentPart {
    if ('text' in part && part.text) {
      return { type: 'text', text: part.text };
    }
    
    if ('inlineData' in part && part.inlineData) {
      return {
        type: 'image',
        mimeType: part.inlineData.mimeType || '',
        data: part.inlineData.data || '',
      };
    }
    
    if ('functionCall' in part && part.functionCall) {
      return {
        type: 'functionCall',
        functionCall: {
          name: part.functionCall.name || '',
          args: part.functionCall.args || {},
        },
      };
    }
    
    if ('functionResponse' in part && part.functionResponse) {
      return {
        type: 'functionResponse',
        functionResponse: {
          name: part.functionResponse.name || '',
          response: part.functionResponse.response,
        },
      };
    }
    
    if ('executableCode' in part && part.executableCode) {
      return {
        type: 'codeExecution',
        code: part.executableCode.code || '',
        language: String(part.executableCode.language || 'python'),
      };
    }
    
    if ('codeExecutionResult' in part && part.codeExecutionResult) {
      return {
        type: 'codeExecutionResult',
        result: part.codeExecutionResult.output || '',
        output: part.codeExecutionResult.output,
      };
    }
    
    // Fallback
    return { type: 'text', text: JSON.stringify(part) };
  }

  /**
   * Convert WooCode content to Google content
   */
  toGoogleContent(content: WoocodeContent): Content {
    return {
      role: this.toGoogleRole(content.role),
      parts: content.parts.map(part => this.toGooglePart(part)),
    };
  }

  /**
   * Convert Google content to WooCode content
   */
  fromGoogleContent(content: Content): WoocodeContent {
    return {
      role: this.fromGoogleRole(content.role || 'user'),
      parts: (content.parts || []).map(part => this.fromGooglePart(part)),
    };
  }

  /**
   * Convert WooCode tool to Google tool
   */
  toGoogleTool(tool: WoocodeTool): GoogleTool {
    return {
      functionDeclarations: [{
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters as any,
      } as GoogleFunctionDeclaration],
    };
  }

  /**
   * Convert WooCode request to Google parameters
   */
  toGoogleRequest(request: WoocodeGenerateRequest): GenerateContentParameters {
    const params: GenerateContentParameters = {
      contents: request.contents.map(c => this.toGoogleContent(c)),
    } as GenerateContentParameters;

    if (request.generationConfig) {
      (params as any).generationConfig = request.generationConfig as GenerateContentConfig;
    }

    if (request.safetySettings) {
      (params as any).safetySettings = request.safetySettings;
    }

    if (request.tools) {
      (params as any).tools = request.tools.map(t => this.toGoogleTool(t));
    }

    if (request.toolConfig) {
      (params as any).toolConfig = request.toolConfig;
    }

    if (request.systemInstruction) {
      (params as any).systemInstruction = this.toGoogleContent(request.systemInstruction);
    }

    return params;
  }

  /**
   * Convert Google response to WooCode response
   */
  fromGoogleResponse(response: GenerateContentResponse): WoocodeGenerateResponse {
    // Handle both response.data (if exists) or response as data
    const data = (response as any).data || response;
    
    const candidates: GenerationCandidate[] = (data.candidates || []).map((candidate: any) => ({
      content: this.fromGoogleContent(candidate.content),
      finishReason: candidate.finishReason,
      safetyRatings: candidate.safetyRatings,
      citationMetadata: candidate.citationMetadata,
      tokenCount: candidate.tokenCount,
      groundingMetadata: candidate.groundingMetadata,
      index: candidate.index || 0,
    }));

    return {
      candidates,
      promptFeedback: data.promptFeedback,
      usageMetadata: data.usageMetadata,
    };
  }

  /**
   * Convert streaming chunk
   */
  fromGoogleStreamChunk(chunk: GenerateContentResponse): StreamChunk {
    return this.fromGoogleResponse(chunk);
  }

  /**
   * Convert token count request
   */
  toGoogleTokenRequest(request: TokenCountRequest): CountTokensParameters {
    return {
      contents: request.contents.map(c => this.toGoogleContent(c)),
      config: request.generationConfig as any,
    } as CountTokensParameters;
  }

  /**
   * Convert token count response
   */
  fromGoogleTokenResponse(response: GoogleTokenResponse): TokenCountResponse {
    return {
      totalTokens: response.totalTokens || 0,
      cachedContentTokenCount: response.cachedContentTokenCount,
    };
  }

  /**
   * Convert embed request
   */
  toGoogleEmbedRequest(request: EmbedRequest): EmbedContentParameters {
    const params: any = {};

    if (typeof request.content === 'string') {
      params.content = { 
        role: 'user', 
        parts: [{ text: request.content }] 
      };
    } else {
      params.content = this.toGoogleContent(request.content);
    }

    if (request.taskType) {
      params.taskType = request.taskType;
    }

    if (request.title) {
      params.title = request.title;
    }

    return params as EmbedContentParameters;
  }

  /**
   * Convert embed response
   */
  fromGoogleEmbedResponse(response: EmbedContentResponse): EmbedResponse {
    // Handle both embeddings array and embedding object
    const embeddings = (response as any).embeddings || (response as any).embedding;
    const values = embeddings?.values || embeddings || [];
    return {
      embedding: Array.isArray(values) ? values : [],
    };
  }
}