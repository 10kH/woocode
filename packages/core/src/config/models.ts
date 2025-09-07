/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Default to local models for privacy
export const DEFAULT_WOOCODE_MODEL = 'Xenova/Qwen1.5-0.5B-Chat';  // Qwen model for chat and code
export const DEFAULT_WOOCODE_FLASH_MODEL = 'Xenova/Qwen1.5-0.5B-Chat';  // Same for now
export const DEFAULT_WOOCODE_FLASH_LITE_MODEL = 'Xenova/Qwen1.5-0.5B-Chat';  // Same for now

// For embeddings (not yet implemented with local models)
export const DEFAULT_WOOCODE_EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';

// Legacy Gemini models (only if explicitly using Gemini provider)
export const GEMINI_MODEL = 'gemini-2.5-pro';
export const GEMINI_FLASH_MODEL = 'gemini-2.5-flash';

// Some thinking models do not default to dynamic thinking which is done by a value of -1
export const DEFAULT_THINKING_MODE = -1;
