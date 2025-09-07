#!/usr/bin/env node

// Test script for Qwen3-Coder-30B-A3B-Instruct via HuggingFace Inference API

async function testQwen3Coder() {
  const HF_TOKEN = process.env.HF_TOKEN;
  
  if (!HF_TOKEN) {
    console.error('HF_TOKEN environment variable is required');
    console.error('Please set: export HF_TOKEN=your_huggingface_token');
    process.exit(1);
  }
  
  const modelId = 'Qwen/Qwen3-Coder-30B-A3B-Instruct';
  const url = `https://api-inference.huggingface.co/models/${modelId}`;
  
  const prompts = [
    {
      name: 'Simple greeting',
      prompt: '<|im_start|>user\nHello! Can you help me write code?<|im_end|>\n<|im_start|>assistant\n'
    },
    {
      name: 'Code generation',
      prompt: '<|im_start|>user\nWrite a Python function to calculate the factorial of a number<|im_end|>\n<|im_start|>assistant\n'
    },
    {
      name: 'Math problem',
      prompt: '<|im_start|>user\nWhat is 2+2?<|im_end|>\n<|im_start|>assistant\n'
    }
  ];
  
  for (const test of prompts) {
    console.log(`\n=== Testing: ${test.name} ===`);
    console.log('Prompt:', test.prompt.replace(/\n/g, '\\n'));
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${HF_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs: test.prompt,
          parameters: {
            max_new_tokens: 150,
            temperature: 0.7,
            top_p: 0.95,
            do_sample: true,
            return_full_text: false,
            stop: ['<|im_end|>', '<|endoftext|>'],
          },
          options: {
            wait_for_model: true,
          },
        }),
      });
      
      const responseText = await response.text();
      console.log('Response status:', response.status);
      
      if (response.ok) {
        const result = JSON.parse(responseText);
        console.log('Success! Response:', result);
        if (Array.isArray(result)) {
          console.log('Generated text:', result[0]?.generated_text);
        } else if (result.generated_text) {
          console.log('Generated text:', result.generated_text);
        }
      } else {
        console.log('Error response:', responseText);
      }
    } catch (error) {
      console.error('Request failed:', error);
    }
  }
}

console.log('Testing Qwen3-Coder-30B-A3B-Instruct via HuggingFace Inference API...');
testQwen3Coder().catch(console.error);