/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from 'woocode-core';
import { AuthType } from 'woocode-core';
import { USER_SETTINGS_PATH } from './config/settings.js';
import { validateAuthMethod } from './config/auth.js';

function getAuthTypeFromEnv(): AuthType | undefined {
  // Check for local provider first
  if (process.env['WOOCODE_PROVIDER'] || process.env['WOOCODE_USE_LOCAL'] === 'true') {
    // Return a dummy auth type for local mode
    // The provider system will handle actual authentication
    return AuthType.USE_GEMINI; // with dummy key
  }
  
  if (process.env['GOOGLE_GENAI_USE_GCA'] === 'true') {
    return AuthType.LOGIN_WITH_GOOGLE;
  }
  if (process.env['GOOGLE_GENAI_USE_VERTEXAI'] === 'true') {
    return AuthType.USE_VERTEX_AI;
  }
  if (process.env['WOOCODE_API_KEY']) {
    return AuthType.USE_GEMINI;
  }
  return undefined;
}

export async function validateNonInteractiveAuth(
  configuredAuthType: AuthType | undefined,
  useExternalAuth: boolean | undefined,
  nonInteractiveConfig: Config,
) {
  const effectiveAuthType = configuredAuthType || getAuthTypeFromEnv();

  // Skip auth check if using provider system
  const useProviderSystem = process.env['WOOCODE_PROVIDER'] || 
                           process.env['WOOCODE_USE_LOCAL'] === 'true';
  
  if (!effectiveAuthType && !useProviderSystem) {
    console.error(
      `Please set an Auth method in your ${USER_SETTINGS_PATH} or specify one of the following environment variables before running: WOOCODE_API_KEY, GOOGLE_GENAI_USE_VERTEXAI, GOOGLE_GENAI_USE_GCA`,
    );
    process.exit(1);
  }

  if (!useExternalAuth && effectiveAuthType) {
    const err = validateAuthMethod(effectiveAuthType);
    if (err != null) {
      console.error(err);
      process.exit(1);
    }
  }

  // Only refresh auth if we have a valid auth type
  if (effectiveAuthType) {
    await nonInteractiveConfig.refreshAuth(effectiveAuthType);
  } else if (useProviderSystem) {
    // For provider system, use a dummy auth type or skip auth
    await nonInteractiveConfig.refreshAuth(AuthType.USE_GEMINI);
  }
  return nonInteractiveConfig;
}
