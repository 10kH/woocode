#!/usr/bin/env python3
"""Test script for local Qwen server with smaller model"""

import os
os.environ['QWEN_MODEL'] = 'Qwen/Qwen2.5-Coder-1.5B-Instruct'  # Small model for testing

# Import after setting environment
from local_models.qwen_server import app, load_model
import uvicorn

if __name__ == "__main__":
    print("Starting test server with Qwen2.5-Coder-1.5B...")
    model_name = os.environ.get("QWEN_MODEL", "Qwen/Qwen2.5-Coder-1.5B-Instruct")
    load_model(model_name)
    uvicorn.run(app, host="127.0.0.1", port=8765, log_level="info")