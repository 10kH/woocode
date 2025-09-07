#!/bin/bash

# WooCode Local Inference Setup Script
# This script helps install local inference engines

set -e

echo "🚀 WooCode Local Inference Setup"
echo "================================="
echo ""

# Detect OS
OS="unknown"
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    OS="linux"
elif [[ "$OSTYPE" == "darwin"* ]]; then
    OS="macos"
elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]]; then
    OS="windows"
fi

echo "Detected OS: $OS"
echo ""

# Function to check command existence
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to detect GPU
detect_gpu() {
    echo "Detecting GPU..."
    
    if command_exists nvidia-smi; then
        echo "✓ NVIDIA GPU detected"
        nvidia-smi --query-gpu=name,memory.total --format=csv
        GPU_TYPE="nvidia"
    elif [[ "$OS" == "macos" ]] && [[ $(uname -m) == "arm64" ]]; then
        echo "✓ Apple Silicon detected"
        GPU_TYPE="apple"
    elif command_exists rocm-smi; then
        echo "✓ AMD GPU detected"
        rocm-smi --showproductname
        GPU_TYPE="amd"
    else
        echo "No GPU detected, will use CPU inference"
        GPU_TYPE="cpu"
    fi
    echo ""
}

# Function to install llama.cpp
install_llama_cpp() {
    echo "Installing llama.cpp..."
    
    INSTALL_DIR="$HOME/.woocode"
    mkdir -p "$INSTALL_DIR"
    
    # Check if already installed
    if [ -f "$INSTALL_DIR/bin/llama-server" ]; then
        echo "llama.cpp is already installed at $INSTALL_DIR/bin/llama-server"
        return
    fi
    
    # Clone llama.cpp
    cd "$INSTALL_DIR"
    if [ ! -d "llama.cpp" ]; then
        git clone https://github.com/ggerganov/llama.cpp
    fi
    
    cd llama.cpp
    git pull
    
    # Build with appropriate flags using CMake
    mkdir -p build
    cd build
    
    if [ "$GPU_TYPE" == "nvidia" ]; then
        echo "Building with CUDA support..."
        cmake .. -DGGML_CUDA=ON
    elif [ "$GPU_TYPE" == "apple" ]; then
        echo "Building with Metal support..."
        cmake .. -DGGML_METAL=ON
    elif [ "$GPU_TYPE" == "amd" ]; then
        echo "Building with ROCm support..."
        cmake .. -DGGML_HIPBLAS=ON
    else
        echo "Building for CPU..."
        cmake ..
    fi
    
    cmake --build . --config Release -j$(nproc 2>/dev/null || sysctl -n hw.ncpu)
    cd ..
    
    # Copy binaries
    mkdir -p "$INSTALL_DIR/bin"
    cp build/bin/llama-server "$INSTALL_DIR/bin/" 2>/dev/null || cp build/llama-server "$INSTALL_DIR/bin/"
    cp build/bin/llama-cli "$INSTALL_DIR/bin/" 2>/dev/null || cp build/llama-cli "$INSTALL_DIR/bin/"
    
    echo "✓ llama.cpp installed successfully!"
    echo "  Binary location: $INSTALL_DIR/bin/llama-server"
    echo ""
    
    # Add to PATH if not already there
    if ! echo "$PATH" | grep -q "$INSTALL_DIR/bin"; then
        echo "Add the following to your shell profile (.bashrc, .zshrc, etc.):"
        echo "export PATH=\"\$PATH:$INSTALL_DIR/bin\""
    fi
}

# Function to install transformers.js
install_transformers_js() {
    echo "Installing transformers.js..."
    
    if ! command_exists npm; then
        echo "❌ npm is required but not installed. Please install Node.js first."
        return 1
    fi
    
    # Install in the project
    npm install @xenova/transformers
    
    echo "✓ transformers.js installed successfully!"
    echo ""
}

# Function to download a starter model
download_starter_model() {
    echo "Downloading starter model..."
    
    MODEL_DIR="$HOME/.woocode/models"
    mkdir -p "$MODEL_DIR"
    
    # Choose model based on available VRAM/RAM
    if [ "$GPU_TYPE" == "nvidia" ] || [ "$GPU_TYPE" == "amd" ]; then
        # Check VRAM
        VRAM=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits 2>/dev/null | head -1 || echo "8192")
        VRAM_GB=$((VRAM / 1024))
        
        if [ "$VRAM_GB" -ge 8 ]; then
            MODEL_URL="https://huggingface.co/Qwen/Qwen2.5-Coder-7B-Instruct-GGUF/resolve/main/qwen2.5-coder-7b-instruct-q4_k_m.gguf"
            MODEL_NAME="qwen2.5-coder-7b-instruct-q4_k_m.gguf"
        else
            MODEL_URL="https://huggingface.co/Qwen/Qwen2.5-Coder-3B-Instruct-GGUF/resolve/main/qwen2.5-coder-3b-instruct-q4_k_m.gguf"
            MODEL_NAME="qwen2.5-coder-3b-instruct-q4_k_m.gguf"
        fi
    else
        # CPU or Apple Silicon - use smaller model
        MODEL_URL="https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF/resolve/main/qwen2.5-coder-1.5b-instruct-q4_k_m.gguf"
        MODEL_NAME="qwen2.5-coder-1.5b-instruct-q4_k_m.gguf"
    fi
    
    MODEL_PATH="$MODEL_DIR/$MODEL_NAME"
    
    if [ -f "$MODEL_PATH" ]; then
        echo "Model already downloaded: $MODEL_PATH"
    else
        echo "Downloading $MODEL_NAME..."
        echo "This may take a while depending on your internet connection..."
        
        # Download with wget or curl
        if command_exists wget; then
            wget -c "$MODEL_URL" -O "$MODEL_PATH"
        elif command_exists curl; then
            curl -L -C - "$MODEL_URL" -o "$MODEL_PATH"
        else
            echo "❌ Neither wget nor curl found. Please install one of them."
            return 1
        fi
        
        echo "✓ Model downloaded successfully!"
    fi
    
    echo "  Model location: $MODEL_PATH"
    echo ""
}

# Main menu
main_menu() {
    echo "What would you like to install?"
    echo ""
    echo "1) llama.cpp (Recommended - Fast C++ inference)"
    echo "2) transformers.js (Browser/Node.js inference)"
    echo "3) Both"
    echo "4) Download starter model"
    echo "5) Full setup (install everything)"
    echo "0) Exit"
    echo ""
    
    read -p "Enter your choice [0-5]: " choice
    
    case $choice in
        1)
            detect_gpu
            install_llama_cpp
            ;;
        2)
            install_transformers_js
            ;;
        3)
            detect_gpu
            install_llama_cpp
            install_transformers_js
            ;;
        4)
            detect_gpu
            download_starter_model
            ;;
        5)
            detect_gpu
            install_llama_cpp
            install_transformers_js
            download_starter_model
            echo "✅ Full setup completed!"
            echo ""
            echo "You can now run WooCode with local inference:"
            echo "  npm start"
            echo ""
            echo "To test local inference:"
            echo "  node test-local-inference.js"
            ;;
        0)
            echo "Exiting..."
            exit 0
            ;;
        *)
            echo "Invalid choice. Please try again."
            main_menu
            ;;
    esac
}

# Run main menu
main_menu