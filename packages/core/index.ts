/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export * from './src/index.js';
export { Storage } from './src/config/storage.js';
export {
  DEFAULT_WOOCODE_MODEL,
  DEFAULT_WOOCODE_FLASH_MODEL,
  DEFAULT_WOOCODE_FLASH_LITE_MODEL,
  DEFAULT_WOOCODE_EMBEDDING_MODEL,
} from './src/config/models.js';
export { logIdeConnection } from './src/telemetry/loggers.js';
export {
  IdeConnectionEvent,
  IdeConnectionType,
} from './src/telemetry/types.js';
export { makeFakeConfig } from './src/test-utils/config.js';
export * from './src/utils/pathReader.js';
