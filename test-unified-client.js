#!/usr/bin/env node

/**
 * Test script for UnifiedClient with local providers
 */

import { Config } from './packages/core/dist/src/config/config.js';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

async function testUnifiedClient() {
  console.log('Testing UnifiedClient with local provider...\n');
  
  // Set environment to use local provider
  process.env.WOOCODE_PROVIDER = 'huggingface';
  process.env.WOOCODE_USE_LOCAL = 'true';
  process.env.WOOCODE_API_KEY = 'dummy'; // Dummy key for local mode
  
  // Create a proper config
  const configParams = {
    sessionId: 'test-session-' + Date.now(),
    targetDir: process.cwd(),
    cwd: process.cwd(),
    debugMode: false,
    model: 'Xenova/distilgpt2',
    useProviderSystem: true,
    provider: 'huggingface',
    parameters: {
      useProviderSystem: true,
      provider: 'huggingface',
    }
  };
  
  try {
    // Create and initialize config
    const config = new Config(configParams);
    console.log('1. Initializing Config...');
    await config.initialize();
    console.log('   ✓ Config initialized successfully\n');
    
    // Need to call refreshAuth to create the client
    console.log('2. Creating UnifiedClient via refreshAuth...');
    // Use a dummy auth type for local mode
    await config.refreshAuth(1); // AuthType.USE_GEMINI = 1
    console.log('   ✓ UnifiedClient created\n');
    
    // Get the unified client
    const client = config.getGeminiClient();
    console.log('3. Got UnifiedClient from config\n');
    
    console.log('4. Checking if client is initialized...');
    const isInit = client.isInitialized();
    console.log(`   ✓ Client initialized: ${isInit}\n`);
    
    if (!isInit) {
      console.log('5. Client not initialized, initializing now...');
      await client.initialize();
      console.log('   ✓ Client initialized\n');
    }
    
    console.log('6. Testing message generation...');
    const parts = [{ text: 'What is 2 + 2?' }];
    
    // Create an abort controller for the signal
    const controller = new AbortController();
    
    console.log('   Sending message to provider...');
    const stream = client.sendMessageStream(parts, controller.signal, 'test-prompt');
    
    let response = '';
    let eventCount = 0;
    const timeout = setTimeout(() => {
      console.log('\n   ⚠️ Timeout - stopping generation');
      controller.abort();
    }, 30000); // 30 second timeout
    
    for await (const event of stream) {
      eventCount++;
      if (event.type === 'content' && event.value) {
        response += event.value;
        process.stdout.write('.');
      } else if (event.type === 'finished') {
        clearTimeout(timeout);
        console.log('\n   ✓ Generation completed\n');
        break;
      } else if (event.type === 'error') {
        clearTimeout(timeout);
        console.log('\n   ❌ Error during generation:', event.value);
        break;
      }
      
      // Safety limit
      if (eventCount > 100) {
        clearTimeout(timeout);
        console.log('\n   ⚠️ Too many events, stopping');
        break;
      }
    }
    
    console.log('7. Response received:');
    if (response) {
      console.log(`   "${response.slice(0, 200)}${response.length > 200 ? '...' : ''}"`);
      console.log(`   Length: ${response.length} characters\n`);
    } else {
      console.log('   No response generated\n');
    }
    
    console.log('✅ UnifiedClient test completed!');
    console.log('\n📝 Summary:');
    console.log(`   - Provider: huggingface`);
    console.log(`   - Model: ${configParams.model}`);
    console.log(`   - Events received: ${eventCount}`);
    console.log(`   - Response length: ${response.length} chars`);
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    if (error.stack) {
      console.error('\nStack trace:', error.stack);
    }
    process.exit(1);
  }
}

// Run the test
testUnifiedClient().catch(console.error);