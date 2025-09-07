const test = async () => {
  try {
    console.log('Testing Qwen model...');
    
    const transformers = await import('@xenova/transformers');
    
    // Set HF token
    transformers.env.accessToken = process.env.HF_TOKEN;
    console.log('HF Token set:', !!process.env.HF_TOKEN);
    
    // Create pipeline
    console.log('Creating pipeline...');
    const pipeline = await transformers.pipeline('text-generation', 'Xenova/Qwen1.5-0.5B-Chat', {
      quantized: true,
      device: 'cpu',
    });
    
    console.log('Pipeline created!');
    
    // Test generation with different prompts
    const prompts = [
      '<|im_start|>user\nHello!<|im_end|>\n<|im_start|>assistant\n',
      'Human: Hello!\nAssistant:',
      'Q: What is 2+2?\nA:',
      'Hello',
    ];
    
    for (const prompt of prompts) {
      console.log('Testing prompt:', prompt);
      const output = await pipeline(prompt, {
        max_new_tokens: 50,
        temperature: 0.7,
        do_sample: false, // Try without sampling first
        return_full_text: true, // Include full text
      });
      console.log('Output:', output);
      console.log('---');
    }
    
    // Cleanup
    await pipeline.dispose();
    console.log('Done!');
  } catch (error) {
    console.error('Error:', error);
  }
};

test();