#!/usr/bin/env node

/**
 * Quick test for transformers.js functionality
 */

async function testTransformersJS() {
  console.log('Testing transformers.js...\n');
  
  try {
    // Import transformers
    const { pipeline, env } = await import('@xenova/transformers');
    
    // Set cache directory
    const homeDir = process.env['HOME'] || process.env['USERPROFILE'];
    env.cacheDir = `${homeDir}/.woocode/models`;
    
    console.log('✓ transformers.js loaded successfully');
    console.log(`✓ Cache directory: ${env.cacheDir}`);
    
    // Test with a very small model
    console.log('\nTesting with a tiny model (Xenova/distilgpt2)...');
    console.log('This will download the model on first run (about 100MB)');
    
    const generator = await pipeline('text-generation', 'Xenova/distilgpt2', {
      progress_callback: (progress) => {
        if (progress.status === 'download') {
          process.stdout.write(`\rDownloading ${progress.file}: ${Math.round(progress.progress)}%`);
        }
      },
    });
    
    console.log('\n✓ Model loaded successfully');
    
    // Generate text
    console.log('\nGenerating text...');
    const prompt = 'def add_numbers(a, b):';
    const output = await generator(prompt, {
      max_new_tokens: 20,
      temperature: 0.7,
      do_sample: true,
    });
    
    console.log('Prompt:', prompt);
    console.log('Generated:', output[0].generated_text);
    
    console.log('\n✅ transformers.js is working correctly!');
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Run test
testTransformersJS().catch(console.error);