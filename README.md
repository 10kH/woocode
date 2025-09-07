# 🤖 WooCode - Privacy-First AI Coding Assistant

<div align="center">
  <img src="docs/assets/logo.png" alt="WooCode Logo" width="200"/>
  
  [![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
  [![Node Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org/)
  [![Status](https://img.shields.io/badge/Status-Alpha-orange)](https://github.com/woody/woocode)
  
  **Your code never leaves your machine. Period.**
  
  *Fork of Google Gemini CLI, refactored for local AI inference*
</div>

## 🌟 Why WooCode?

WooCode is a powerful AI coding assistant that prioritizes your **privacy** and **control**. Unlike cloud-based solutions, WooCode runs entirely on your local GPU by default, ensuring your code stays on your machine. When needed, you can seamlessly switch to cloud APIs.

### Key Features

- 🔒 **Privacy First** - Local GPU inference by default, your code stays private
- 🚀 **State-of-the-art Models** - Qwen3-Coder, CodeLlama, and more
- 🔄 **Flexible Providers** - Switch between local (HuggingFace, Ollama) and cloud (OpenAI, Anthropic, Gemini)
- 🎯 **GPU Auto-Detection** - Automatically recommends the best model for your hardware
- 📂 **Full Codebase Context** - Understands your entire project structure
- 🛠️ **Powerful Tools** - File operations, shell commands, web search, and more
- 🔌 **Extensible** - MCP (Model Context Protocol) support for custom tools

## 📦 Installation

### Quick Start (5 minutes)

```bash
# Clone and build from source (npm package coming soon)
git clone https://github.com/woody/woocode.git
cd woocode
npm install
npm run build
npm run bundle

# Start using WooCode with local inference
WOOCODE_PROVIDER=huggingface ./bundle/woocode.js
```

### Detailed Installation

#### Option 1: Build from Source (Currently Required)

```bash
# Clone the repository
git clone https://github.com/woody/woocode.git
cd woocode

# Install dependencies
npm install

# Build the project
npm run build

# Set up local inference (recommended)
./scripts/setup-local-inference.sh
npm run bundle

# Run
./bundle/woocode.js
```

#### Option 2: Docker (Coming Soon)

Docker images with pre-configured local models will be available soon.

## 🚀 Quick Start

### Basic Usage

```bash
# Start WooCode in your project directory
cd your-project

# Run with HuggingFace transformers.js (works immediately)
WOOCODE_PROVIDER=huggingface ./path/to/woocode/bundle/woocode.js

# WooCode will:
# 1. Initialize the HuggingFace provider
# 2. Auto-download the model on first use (~500MB for Qwen1.5-0.5B)
# 3. Start the interactive session
```

### First Run Example

```
$ WOOCODE_PROVIDER=huggingface ./bundle/woocode.js
Using provider: huggingface
Loading model: Xenova/Qwen1.5-0.5B-Chat
Downloading onnx/model_quantized.onnx: 100%
Model Xenova/Qwen1.5-0.5B-Chat loaded successfully

Welcome to WooCode! How can I help you today?

> Help me understand this codebase
```

## 🎮 Usage Examples

### Interactive Mode (Default)

```bash
# Start interactive session with local model
WOOCODE_PROVIDER=huggingface ./bundle/woocode.js

# Or use development mode
cd woocode
npm start

# Examples of what you can do:
> Explain the architecture of this project
> Find all API endpoints in this codebase
> Add error handling to the user authentication
> Write unit tests for the payment module
> Debug why the login feature is broken
```

### Non-Interactive Mode

```bash
# Single prompt execution (use --no-interactive flag)
WOOCODE_PROVIDER=huggingface ./bundle/woocode.js --prompt "Generate a README for this project" --no-interactive

# Pipe input
echo "Explain this error" | WOOCODE_PROVIDER=huggingface ./bundle/woocode.js --prompt "Help me fix this:" --no-interactive

# Process files
cat error.log | WOOCODE_PROVIDER=huggingface ./bundle/woocode.js --prompt "Analyze these logs and suggest fixes" --no-interactive
```

### Provider Selection

```bash
# Use HuggingFace transformers.js (works out of the box)
WOOCODE_PROVIDER=huggingface ./bundle/woocode.js

# Use HuggingFace Inference API (requires HF token)
HF_TOKEN=hf_xxx WOOCODE_PROVIDER=huggingface-api ./bundle/woocode.js

# Use llama.cpp (requires setup)
WOOCODE_PROVIDER=llamacpp ./bundle/woocode.js

# Use cloud APIs (requires API keys)
OPENAI_API_KEY=sk-xxx WOOCODE_PROVIDER=openai ./bundle/woocode.js
ANTHROPIC_API_KEY=sk-ant-xxx WOOCODE_PROVIDER=anthropic ./bundle/woocode.js
GEMINI_API_KEY=AI-xxx WOOCODE_PROVIDER=gemini ./bundle/woocode.js

# Auto-detect best available provider
./bundle/woocode.js  # Will try providers in priority order
```

## 🖥️ Local Inference Setup

WooCode supports multiple local inference engines for maximum privacy and performance:

### Automatic Setup

```bash
# Interactive setup wizard
woocode setup

# Or use the setup script directly
./scripts/setup-local-inference.sh
```

### Supported Inference Engines

#### 1. llama.cpp (Recommended)
- **Best for**: Maximum performance, low memory usage
- **Supports**: NVIDIA/AMD/Apple Silicon GPUs, CPU
- **Models**: GGUF format (quantized)

```bash
# Manual installation
git clone https://github.com/ggerganov/llama.cpp
cd llama.cpp
make LLAMA_CUDA=1  # For NVIDIA GPUs
# make LLAMA_METAL=1  # For Apple Silicon
# make LLAMA_HIPBLAS=1  # For AMD GPUs
```

#### 2. transformers.js
- **Best for**: Browser/Node.js, no compilation needed
- **Supports**: WebGPU, WASM, CPU
- **Models**: ONNX format

```bash
# Installation
npm install @xenova/transformers
```

#### 3. Ollama (Coming Soon)
- **Best for**: Easy model management
- **Supports**: All platforms
- **Models**: Multiple formats

### GPU Support

WooCode automatically detects and optimizes for your GPU:

| GPU Type | Support | Recommended VRAM |
|----------|---------|------------------|
| NVIDIA (CUDA) | ✅ Full | 8GB+ |
| Apple Silicon (Metal) | ✅ Full | 16GB+ unified |
| AMD (ROCm) | ✅ Full | 8GB+ |
| Intel Arc | ⚠️ Partial | 8GB+ |
| CPU Only | ✅ Full | 16GB+ RAM |

### Model Recommendations

Based on your hardware:

| VRAM/RAM | Recommended Model | Provider | Size | Quality |
|----------|------------------|----------|------|---------|
| 2-4GB | Xenova/Qwen1.5-0.5B-Chat | HuggingFace JS | 500MB | Good for basic tasks |
| 4-8GB | qwen2.5-coder-1.5b-q4_k_m.gguf | llama.cpp | 1GB | Good code completion |
| 8-16GB | qwen2.5-coder-7b-q4_k_m.gguf | llama.cpp | 4GB | Excellent balance |
| 16-24GB | codellama-13b-q4_k_m.gguf | llama.cpp | 7GB | Professional quality |
| 24GB+ | Qwen/Qwen3-Coder-30B-A3B | Qwen Local | 15GB | State-of-the-art |

### Testing Local Inference

```bash
# Run test suite
node test-local-inference.js

# Output:
# ✓ GPU detected: NVIDIA RTX 4090 (24GB)
# ✓ llama.cpp available
# ✓ Model ready: Qwen3-Coder-30B
# ✓ Inference test passed
```

## 🔧 Configuration

### Settings File

Create `~/.woocode/settings.json`:

```json
{
  "provider": "huggingface",
  "useProviderSystem": true,
  "model": {
    "name": "Qwen/Qwen3-Coder-30B-A3B-Instruct",
    "maxSessionTurns": -1
  },
  "apiKeys": {
    "openai": "sk-...",
    "anthropic": "sk-ant-...",
    "gemini": "AI..."
  },
  "ui": {
    "theme": "dark",
    "showLineNumbers": true
  },
  "tools": {
    "useRipgrep": true,
    "usePty": false
  }
}
```

### Environment Variables

```bash
# Provider selection
export WOOCODE_PROVIDER=huggingface

# API Keys (optional, for cloud providers)
export OPENAI_API_KEY="sk-..."
export ANTHROPIC_API_KEY="sk-ant-..."
export GEMINI_API_KEY="AI..."
export WOOCODE_API_KEY="AI..."  # Alternative for Gemini

# Model selection
export WOOCODE_MODEL="Qwen/Qwen3-Coder-30B-A3B-Instruct"
```

## 🤖 Supported Models & Providers

### Local Providers (Privacy-First)

#### HuggingFace Models (Auto-download)
| Model | VRAM | Description |
|-------|------|-------------|
| **Qwen3-Coder 30B (A3B)** | 24GB+ | Best for RTX 4090, A6000 |
| **Qwen3-Coder 480B (A35B)** | 80GB+ | Enterprise GPUs (A100, H100) |
| **CodeLlama 34B** | 24GB+ | Meta's code model |
| **DeepSeek-Coder 33B** | 24GB+ | Excellent for code completion |

#### Ollama Models
| Model | Size | Command |
|-------|------|---------|
| **Llama 3** | 8B | `ollama pull llama3` |
| **CodeLlama** | 7B-34B | `ollama pull codellama` |
| **Qwen2.5-Coder** | 7B-32B | `ollama pull qwen2.5-coder` |
| **DeepSeek-Coder** | 6.7B-33B | `ollama pull deepseek-coder` |

### Cloud Providers (Optional)

#### OpenAI
- GPT-4 Turbo
- GPT-3.5 Turbo
- o1-preview (reasoning model)

#### Anthropic
- Claude 3 Opus
- Claude 3.5 Sonnet
- Claude 3.5 Haiku

#### Google Gemini
- Gemini 1.5 Pro
- Gemini 1.5 Flash
- Gemini 2.0 Flash (Experimental)

## 💻 Commands

### In-Session Commands

| Command | Description | Example |
|---------|-------------|---------|
| `/help` | Show all available commands | `/help` |
| `/provider` | Manage LLM providers | `/provider list` |
| `/provider switch` | Change provider/model | `/provider switch openai gpt-4-turbo` |
| `/model` | Show current model info | `/model` |
| `/context` | Manage context files | `/context add src/` |
| `/memory` | Manage session memory | `/memory save project-analysis` |
| `/checkpoint` | Create restore point | `/checkpoint create` |
| `/chat` | Manage conversations | `/chat save debugging-session` |
| `/settings` | View/edit settings | `/settings edit` |
| `/clear` | Clear screen | `/clear` |
| `/exit` | Exit WooCode | `/exit` |

### File Operations

```bash
# Read files
> Show me the contents of package.json

# Edit files
> Add error handling to src/api/auth.js

# Create files
> Create a new React component for user profile

# Search code
> Find all TODO comments in the codebase
```

### Shell Commands

```bash
# Run commands (requires approval)
> Run the test suite
> Install express package
> Check git status
```

## 🔒 Privacy & Security

### Local-First Architecture

1. **Default Local Processing**: All AI inference runs on your GPU by default
2. **No Telemetry**: Unless explicitly enabled, no data is sent anywhere
3. **Code Never Leaves**: Your source code stays on your machine
4. **Explicit Cloud Usage**: Cloud APIs only used when you explicitly switch

### Security Features

- **Sandboxed Execution**: Shell commands run in controlled environment
- **Approval Required**: All file modifications and commands need approval
- **Folder Trust**: Untrusted folders have restricted operations
- **No Auto-Upload**: Files are never automatically uploaded anywhere

## 🛠️ Advanced Features

### GPU Detection & Optimization

WooCode automatically detects your GPU and recommends the best model:

```
Detected: NVIDIA RTX 4090 (24GB VRAM)
✓ Can run: Qwen3-Coder-30B (Recommended)
✓ Can run: CodeLlama-34B
✗ Cannot run: Qwen3-Coder-480B (Requires 80GB+)
```

### Model Context Protocol (MCP)

Extend WooCode with custom tools:

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["@woocode/mcp-github", "--token", "$GITHUB_TOKEN"]
    },
    "database": {
      "command": "python",
      "args": ["mcp_server.py"]
    }
  }
}
```

### Checkpoint & Recovery

```bash
# Create checkpoint before major changes
> /checkpoint create "before-refactoring"

# List checkpoints
> /checkpoint list

# Restore if needed
> /checkpoint restore "before-refactoring"
```

## 🔍 Troubleshooting

### Common Issues

#### GPU Not Detected
```bash
# Check CUDA installation
nvidia-smi

# For AMD GPUs
rocm-smi

# For Apple Silicon
system_profiler SPDisplaysDataType
```

#### Model Download Issues
```bash
# Clear cache and retry
rm -rf ~/.cache/huggingface
woocode --debug
```

#### Out of Memory
```bash
# Use smaller model
woocode --model Qwen/Qwen3-Coder-7B

# Or use CPU (slower)
export CUDA_VISIBLE_DEVICES=""
woocode
```

## 🤝 Contributing

We welcome contributions! WooCode is fully open source (Apache 2.0).

```bash
# Fork and clone
git clone https://github.com/YOUR_USERNAME/woocode.git

# Create feature branch
git checkout -b feature/amazing-feature

# Make changes and test
npm test

# Submit PR
git push origin feature/amazing-feature
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## 📚 Documentation

- [Installation Guide](docs/installation.md)
- [Configuration Guide](docs/configuration.md)
- [Provider Setup](docs/providers.md)
- [MCP Integration](docs/mcp.md)
- [API Reference](docs/api.md)
- [Troubleshooting](docs/troubleshooting.md)

## 📄 License

Apache License 2.0 - see [LICENSE](LICENSE) file.

## 🙏 Acknowledgments

- Built on top of Google's Gemini CLI architecture
- Powered by amazing open-source models from Qwen, Meta, and others
- Thanks to the Ollama, HuggingFace, and MCP communities

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/woody/woocode/issues)
- **Discussions**: [GitHub Discussions](https://github.com/woody/woocode/discussions)
- **Security**: [Security Policy](SECURITY.md)

## 🚧 Current Status & Roadmap

### ✅ What's Working (Updated: January 2025)
✅ **Complete rebranding** from Gemini to WooCode  
✅ **Provider abstraction layer** - Fully implemented with ProviderAdapter, ProviderManager, and UnifiedClient  
✅ **Local inference with HuggingFace** - transformers.js (@xenova/transformers) fully integrated  
✅ **Multiple provider implementations** - HuggingFace JS, llama.cpp, Qwen local server, and cloud APIs  
✅ **UnifiedClient architecture** - Seamless switching between traditional Gemini and new provider modes  
✅ **Auto model downloading** - Models download automatically via transformers.js  
✅ **Zero-config local mode** - Set `WOOCODE_PROVIDER=huggingface` and go  
✅ **Bundle compatibility** - esbuild configured with external dependencies  
✅ **Purple gradient theme** - New visual identity implemented  

### 🎯 Implemented Providers
| Provider | Status | Description |
|----------|--------|-------------|
| **HuggingFace JS** | ✅ Working | Uses @xenova/transformers for browser/Node.js inference |
| **llama.cpp** | ✅ Implemented | GGUF model support with GPU acceleration |
| **Qwen Local** | ✅ Implemented | Python server for large Qwen models |
| **HuggingFace API** | ✅ Working | Cloud inference with HF token |
| **OpenAI** | ✅ Implemented | GPT-4, GPT-3.5 (requires API key) |
| **Anthropic** | ✅ Implemented | Claude models (requires API key) |
| **Gemini** | ✅ Implemented | Google's models (requires API key) |
| **Ollama** | ⚠️ Planned | Local model management (coming soon) |

### 📝 Available Models
**HuggingFace JS (ONNX format):**
- Xenova/Qwen1.5-0.5B-Chat (500M params, 32K context)
- Xenova/Qwen1.5-1.8B (1.8B params, 32K context)  
- Xenova/deepseek-coder-1.3b-instruct (1.3B params, 16K context)
- Xenova/distilgpt2 (Basic testing model)

**llama.cpp (GGUF format):**
- Qwen2.5-Coder series (1.5B, 7B models)
- CodeLlama (7B-34B models)
- DeepSeek-Coder (6.7B model)

### 🔧 Technical Architecture
- **Config System**: Extended with provider support (`useProviderSystem` flag)
- **Provider Manager**: Auto-detection and switching between providers
- **Unified Client**: Bridges legacy Gemini client with new provider system
- **Dynamic Loading**: transformers.js loaded at runtime to avoid bundling issues
- **Model Caching**: Models stored in `~/.woocode/models/`

### 🚀 Quick Testing
```bash
# Test with HuggingFace transformers.js (working)
WOOCODE_PROVIDER=huggingface npm start

# Test with HuggingFace API (requires token)
HF_TOKEN=your_token WOOCODE_PROVIDER=huggingface-api npm start

# Test with llama.cpp (requires setup)
./scripts/setup-local-inference.sh
WOOCODE_PROVIDER=llamacpp npm start

# Test with cloud providers
OPENAI_API_KEY=sk-... WOOCODE_PROVIDER=openai npm start
```

### 📊 Performance Notes
- **transformers.js**: Runs on CPU/WebGPU, slower but works everywhere
- **llama.cpp**: Fast with GPU support, requires compilation
- **Model sizes**: 500MB-8GB depending on model and quantization
- **Context limits**: Vary by model (1K-32K tokens)

### 🐛 Known Limitations
- transformers.js models are smaller and less capable than full models
- No streaming support for transformers.js yet
- Windows support needs testing
- Large models may require significant RAM/VRAM
- Initial model download can be slow

### 🤝 How to Contribute
We need help with:
- Testing different GPU configurations (NVIDIA, AMD, Apple Silicon)
- Windows compatibility testing and fixes
- Adding more provider implementations
- Improving model quality and selection
- Performance optimizations
- Documentation and examples

### Developer Notes
This is a fork of Google's Gemini CLI, refactored for privacy-first local AI. The architecture is fully implemented and functional, with multiple working providers. The codebase maintains backward compatibility while adding the new provider system. Default models are optimized for privacy (local inference) but can easily switch to cloud providers when needed.

## 📋 Summary of Current State

**What's Ready to Use:**
- ✅ HuggingFace transformers.js provider - Works immediately, no setup required
- ✅ Full provider abstraction system - Easy to add new providers
- ✅ Multiple provider implementations - Local and cloud options
- ✅ Auto model downloading - Models cached locally after first download
- ✅ Complete CLI interface - Based on Google's production Gemini CLI

**What Needs Work:**
- ⚠️ Model quality - Current small models (0.5B-1.8B) are limited
- ⚠️ Performance - transformers.js is slower than native implementations  
- ⚠️ Documentation - Need more examples and guides
- ⚠️ Testing - More testing needed across different platforms

**Recommended Setup for Testing:**
```bash
# Quick test with small model (works immediately)
git clone https://github.com/woody/woocode.git && cd woocode
npm install && npm run build && npm run bundle
WOOCODE_PROVIDER=huggingface ./bundle/woocode.js

# For better quality (requires API key)
OPENAI_API_KEY=your_key WOOCODE_PROVIDER=openai ./bundle/woocode.js
```

---

<div align="center">
  <b>WooCode - Your Code, Your Control, Your AI</b>
  <br>
  <i>⚠️ Alpha Software - Working but limited. Contributors welcome!</i>
  <br><br>
  Made with ❤️ by the WooCode Community
  <br>
  <i>Forked from Google Gemini CLI with major refactoring for local AI</i>
</div>