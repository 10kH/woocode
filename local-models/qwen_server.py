#!/usr/bin/env python3
"""
Local Qwen3-Coder Model Server
Runs Qwen3-Coder-30B locally using transformers library
"""

import os
import sys
import json
import logging
from typing import List, Dict, Optional
from dataclasses import dataclass

import torch
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from transformers import (
    AutoModelForCausalLM, 
    AutoTokenizer,
    BitsAndBytesConfig,
    GenerationConfig
)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Qwen3-Coder Local Server")

# CORS middleware for local access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global model and tokenizer
model = None
tokenizer = None

class Message(BaseModel):
    role: str  # 'system', 'user', 'assistant'
    content: str

class GenerateRequest(BaseModel):
    messages: List[Message]
    max_tokens: Optional[int] = 512
    temperature: Optional[float] = 0.7
    top_p: Optional[float] = 0.95
    top_k: Optional[int] = 40
    stream: Optional[bool] = False

class GenerateResponse(BaseModel):
    content: str
    usage: Dict[str, int]

def load_model(model_name: str = "Qwen/Qwen3-Coder-30B-A3B-Instruct"):
    """Load the Qwen3-Coder model with optimizations"""
    global model, tokenizer
    
    logger.info(f"Loading model: {model_name}")
    
    # Model directory for caching
    cache_dir = os.path.expanduser("~/.woocode/models")
    os.makedirs(cache_dir, exist_ok=True)
    
    # Check available memory and GPU
    if torch.cuda.is_available():
        device = "cuda"
        logger.info(f"Using GPU: {torch.cuda.get_device_name()}")
        
        # Try to use quantization if bitsandbytes is available
        try:
            import bitsandbytes as bnb
            quantization_config = BitsAndBytesConfig(
                load_in_4bit=True,
                bnb_4bit_compute_dtype=torch.float16,
                bnb_4bit_use_double_quant=True,
                bnb_4bit_quant_type="nf4"
            )
            logger.info("Using 4-bit quantization with bitsandbytes")
        except ImportError:
            logger.warning("bitsandbytes not available, loading full precision model")
            quantization_config = None
    else:
        device = "cpu"
        logger.info("Using CPU (this will be slow for 30B model)")
        quantization_config = None
        
        # For CPU, use smaller model or quantization
        if "30B" in model_name or "32B" in model_name:
            logger.warning("30B/32B models are too large for CPU. Consider using smaller variants.")
            model_name = "Qwen/Qwen2.5-Coder-7B-Instruct"  # Fallback to smaller model
    
    # Load tokenizer
    tokenizer = AutoTokenizer.from_pretrained(
        model_name,
        trust_remote_code=True,
        cache_dir=cache_dir
    )
    
    # Load model with appropriate config
    try:
        if quantization_config:
            model = AutoModelForCausalLM.from_pretrained(
                model_name,
                quantization_config=quantization_config,
                device_map="auto",
                trust_remote_code=True,
                cache_dir=cache_dir,
                torch_dtype=torch.float16
            )
        else:
            model = AutoModelForCausalLM.from_pretrained(
                model_name,
                device_map="auto" if device == "cuda" else None,
                trust_remote_code=True,
                cache_dir=cache_dir,
                torch_dtype=torch.float16 if device == "cuda" else torch.float32,
                low_cpu_mem_usage=True
            )
            
        if device == "cpu":
            model = model.to(device)
            
    except Exception as e:
        logger.error(f"Failed to load model: {e}")
        logger.info("Trying with CPU offloading...")
        
        # Try with CPU offloading for large models
        model = AutoModelForCausalLM.from_pretrained(
            model_name,
            device_map="auto",
            trust_remote_code=True,
            cache_dir=cache_dir,
            torch_dtype=torch.float32,
            offload_folder=os.path.join(cache_dir, "offload"),
            offload_state_dict=True
        )
    
    logger.info(f"Model loaded successfully: {model_name}")
    return model, tokenizer

def format_messages(messages: List[Message]) -> str:
    """Format messages for Qwen models using ChatML format"""
    formatted = ""
    for message in messages:
        if message.role == "system":
            formatted += f"<|im_start|>system\n{message.content}<|im_end|>\n"
        elif message.role == "user":
            formatted += f"<|im_start|>user\n{message.content}<|im_end|>\n"
        elif message.role == "assistant":
            formatted += f"<|im_start|>assistant\n{message.content}<|im_end|>\n"
    
    formatted += "<|im_start|>assistant\n"
    return formatted

@app.on_event("startup")
async def startup_event():
    """Load model on server startup"""
    model_name = os.environ.get("QWEN_MODEL", "Qwen/Qwen3-Coder-30B-A3B-Instruct")
    load_model(model_name)

@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "status": "running",
        "model": "Qwen3-Coder",
        "device": "cuda" if torch.cuda.is_available() else "cpu"
    }

@app.post("/generate", response_model=GenerateResponse)
async def generate(request: GenerateRequest):
    """Generate text from messages"""
    global model, tokenizer
    
    if not model or not tokenizer:
        raise HTTPException(status_code=500, detail="Model not loaded")
    
    try:
        # Format messages
        prompt = format_messages(request.messages)
        
        # Tokenize
        inputs = tokenizer(prompt, return_tensors="pt", truncation=True, max_length=32768)
        
        # Move to device
        if torch.cuda.is_available():
            inputs = inputs.to("cuda")
        
        # Generate
        with torch.no_grad():
            generation_config = GenerationConfig(
                max_new_tokens=request.max_tokens,
                temperature=request.temperature,
                top_p=request.top_p,
                top_k=request.top_k,
                do_sample=True,
                pad_token_id=tokenizer.pad_token_id,
                eos_token_id=tokenizer.eos_token_id
            )
            
            outputs = model.generate(
                **inputs,
                generation_config=generation_config
            )
        
        # Decode
        generated = tokenizer.decode(outputs[0], skip_special_tokens=False)
        
        # Extract only the new generation
        if prompt in generated:
            response_text = generated[len(prompt):]
        else:
            response_text = generated
        
        # Remove end tokens
        response_text = response_text.replace("<|im_end|>", "").strip()
        
        # Calculate usage (approximate)
        prompt_tokens = len(inputs.input_ids[0])
        completion_tokens = len(outputs[0]) - prompt_tokens
        
        return GenerateResponse(
            content=response_text,
            usage={
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "total_tokens": prompt_tokens + completion_tokens
            }
        )
        
    except Exception as e:
        logger.error(f"Generation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/models")
async def list_models():
    """List available models"""
    return {
        "models": [
            {
                "id": "Qwen/Qwen3-Coder-30B-A3B-Instruct",
                "name": "Qwen3-Coder 30B A3B",
                "description": "Advanced coding model with 30B parameters"
            },
            {
                "id": "Qwen/Qwen2.5-Coder-32B-Instruct",
                "name": "Qwen2.5-Coder 32B",
                "description": "Latest Qwen2.5 coding model"
            },
            {
                "id": "Qwen/Qwen2.5-Coder-7B-Instruct",
                "name": "Qwen2.5-Coder 7B",
                "description": "Smaller, faster Qwen2.5 model"
            }
        ]
    }

if __name__ == "__main__":
    # Get port from environment or default
    port = int(os.environ.get("QWEN_SERVER_PORT", 8765))
    
    # Run server
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=port,
        log_level="info"
    )