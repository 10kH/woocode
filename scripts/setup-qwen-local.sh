#!/bin/bash

# Setup script for local Qwen3-Coder model
# This will install Python dependencies and download the model

set -e

echo "========================================"
echo "WooCode Local Qwen3-Coder Setup"
echo "========================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check Python version
echo -e "${YELLOW}Checking Python installation...${NC}"
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}Python 3 is not installed!${NC}"
    echo "Please install Python 3.8 or later and try again."
    exit 1
fi

PYTHON_VERSION=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
echo -e "${GREEN}Python $PYTHON_VERSION found${NC}"

# Check if version is 3.8 or higher
MIN_VERSION="3.8"
if [ "$(printf '%s\n' "$MIN_VERSION" "$PYTHON_VERSION" | sort -V | head -n1)" != "$MIN_VERSION" ]; then
    echo -e "${RED}Python 3.8 or higher is required!${NC}"
    exit 1
fi

# Create virtual environment
VENV_DIR="$HOME/.woocode/qwen-venv"
echo -e "${YELLOW}Creating virtual environment at $VENV_DIR...${NC}"
python3 -m venv "$VENV_DIR"

# Activate virtual environment
source "$VENV_DIR/bin/activate"

# Upgrade pip
echo -e "${YELLOW}Upgrading pip...${NC}"
pip install --upgrade pip

# Check available memory and GPU
echo -e "${YELLOW}Checking system resources...${NC}"
if command -v nvidia-smi &> /dev/null; then
    echo -e "${GREEN}NVIDIA GPU detected:${NC}"
    nvidia-smi --query-gpu=name,memory.total --format=csv,noheader
    
    # Install CUDA-enabled PyTorch
    echo -e "${YELLOW}Installing PyTorch with CUDA support...${NC}"
    pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118
    
    # Install 4-bit quantization support
    echo -e "${YELLOW}Installing quantization libraries...${NC}"
    pip install bitsandbytes accelerate
else
    echo -e "${YELLOW}No NVIDIA GPU detected. Using CPU (this will be slower).${NC}"
    
    # Check available RAM
    TOTAL_RAM=$(free -g | awk 'NR==2{print $2}')
    echo "Total RAM: ${TOTAL_RAM}GB"
    
    if [ "$TOTAL_RAM" -lt 32 ]; then
        echo -e "${YELLOW}Warning: Less than 32GB RAM detected.${NC}"
        echo "Large models may not run well. Consider using smaller models."
        echo ""
        echo "Recommended models for your system:"
        echo "  - Qwen/Qwen2.5-Coder-7B-Instruct (7B parameters)"
        echo "  - Qwen/Qwen2.5-Coder-1.5B-Instruct (1.5B parameters)"
        
        read -p "Continue with setup anyway? (y/n): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
    
    # Install CPU-only PyTorch
    echo -e "${YELLOW}Installing PyTorch for CPU...${NC}"
    pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu
fi

# Install required packages
echo -e "${YELLOW}Installing required Python packages...${NC}"
pip install transformers
pip install fastapi uvicorn[standard]
pip install huggingface_hub
pip install sentencepiece protobuf

# Create model directory
MODEL_DIR="$HOME/.woocode/models"
mkdir -p "$MODEL_DIR"

# Download model selection
echo ""
echo -e "${GREEN}Select the model to download:${NC}"
echo "1) Qwen3-Coder-30B-A3B-Instruct (30B parameters, ~60GB, requires GPU)"
echo "2) Qwen2.5-Coder-32B-Instruct (32B parameters, ~64GB, requires GPU)"
echo "3) Qwen2.5-Coder-7B-Instruct (7B parameters, ~14GB, works on CPU)"
echo "4) Qwen2.5-Coder-1.5B-Instruct (1.5B parameters, ~3GB, fast on CPU)"
echo "5) Skip download (will download on first use)"

read -p "Enter your choice (1-5): " -n 1 -r MODEL_CHOICE
echo

case $MODEL_CHOICE in
    1)
        MODEL_ID="Qwen/Qwen3-Coder-30B-A3B-Instruct"
        ;;
    2)
        MODEL_ID="Qwen/Qwen2.5-Coder-32B-Instruct"
        ;;
    3)
        MODEL_ID="Qwen/Qwen2.5-Coder-7B-Instruct"
        ;;
    4)
        MODEL_ID="Qwen/Qwen2.5-Coder-1.5B-Instruct"
        ;;
    5)
        echo -e "${YELLOW}Skipping model download.${NC}"
        MODEL_ID=""
        ;;
    *)
        echo -e "${RED}Invalid choice. Skipping download.${NC}"
        MODEL_ID=""
        ;;
esac

if [ -n "$MODEL_ID" ]; then
    echo -e "${YELLOW}Downloading model: $MODEL_ID${NC}"
    echo "This may take a while depending on your internet connection..."
    
    # Check if HF token is available
    if [ -n "$HF_TOKEN" ] || [ -n "$HUGGINGFACE_TOKEN" ]; then
        echo -e "${GREEN}Using HuggingFace token for download${NC}"
        export HF_TOKEN="${HF_TOKEN:-$HUGGINGFACE_TOKEN}"
    fi
    
    # Download model using Python
    python3 << EOF
import os
from transformers import AutoModelForCausalLM, AutoTokenizer

model_id = "$MODEL_ID"
cache_dir = "$MODEL_DIR"

print(f"Downloading tokenizer for {model_id}...")
tokenizer = AutoTokenizer.from_pretrained(
    model_id,
    cache_dir=cache_dir,
    trust_remote_code=True
)

print(f"Downloading model {model_id}...")
print("This may take 10-30 minutes depending on model size and connection speed...")

# Only download, don't load into memory
from huggingface_hub import snapshot_download
snapshot_download(
    repo_id=model_id,
    cache_dir=cache_dir,
    ignore_patterns=["*.bin", "*.safetensors"],  # Skip weights for now
)

print("Model metadata downloaded successfully!")
print("Full model weights will be downloaded on first use.")
EOF
    
    echo -e "${GREEN}Model setup complete!${NC}"
fi

# Create systemd service (optional)
echo ""
read -p "Create systemd service for auto-start? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    SERVICE_FILE="$HOME/.config/systemd/user/woocode-qwen.service"
    mkdir -p "$HOME/.config/systemd/user"
    
    cat > "$SERVICE_FILE" << EOF
[Unit]
Description=WooCode Qwen Local Model Server
After=network.target

[Service]
Type=simple
WorkingDirectory=$HOME/workspace/woocode
Environment="PATH=$VENV_DIR/bin:/usr/bin:/bin"
Environment="PYTHONUNBUFFERED=1"
Environment="QWEN_MODEL=${MODEL_ID:-Qwen/Qwen2.5-Coder-7B-Instruct}"
ExecStart=$VENV_DIR/bin/python3 $HOME/workspace/woocode/local-models/qwen_server.py
Restart=on-failure
RestartSec=10

[Install]
WantedBy=default.target
EOF
    
    systemctl --user daemon-reload
    echo -e "${GREEN}Systemd service created!${NC}"
    echo "To start the service: systemctl --user start woocode-qwen"
    echo "To enable auto-start: systemctl --user enable woocode-qwen"
fi

# Create launcher script
LAUNCHER_SCRIPT="$HOME/.woocode/start-qwen-server.sh"
cat > "$LAUNCHER_SCRIPT" << EOF
#!/bin/bash
source "$VENV_DIR/bin/activate"
export QWEN_MODEL="${MODEL_ID:-Qwen/Qwen2.5-Coder-7B-Instruct}"
cd "$HOME/workspace/woocode"
python3 local-models/qwen_server.py
EOF
chmod +x "$LAUNCHER_SCRIPT"

# Setup complete
echo ""
echo -e "${GREEN}========================================"
echo -e "Setup Complete!"
echo -e "========================================${NC}"
echo ""
echo "To use the local Qwen model with WooCode:"
echo ""
echo "1. Start the server (choose one):"
echo "   - Run: $LAUNCHER_SCRIPT"
echo "   - Or: systemctl --user start woocode-qwen"
echo ""
echo "2. Run WooCode with local provider:"
echo "   export WOOCODE_PROVIDER=qwen-local"
echo "   woocode"
echo ""
echo "The model will be downloaded on first use if not already cached."
echo ""
echo -e "${YELLOW}Note: First run may take time to download and load the model.${NC}"