#!/usr/bin/env node

/**
 * Bundle wrapper for WooCode
 * Handles external dependencies that can't be bundled
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create require function for loading CommonJS modules
const require = createRequire(import.meta.url);

// Pre-load external dependencies
try {
  // Check if transformers.js is available
  const transformersPath = require.resolve('@xenova/transformers');
  console.log('Found transformers.js at:', transformersPath);
} catch (error) {
  console.warn('transformers.js not found. Local inference will not be available.');
  console.warn('To enable local inference, run: npm install @xenova/transformers');
}

// Load and run the bundled woocode
import('./bundle/woocode.js').then(module => {
  // Bundle exports are handled by the bundle itself
}).catch(error => {
  console.error('Failed to load WooCode bundle:', error);
  process.exit(1);
});