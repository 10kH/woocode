# 🤖 WooCode - Privacy-First AI Coding Assistant

<div align="center">
  <img src="docs/assets/logo.png" alt="WooCode Logo" width="200"/>
  
  [![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
  [![Node Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
  [![npm Version](https://img.shields.io/npm/v/woocode)](https://www.npmjs.com/package/woocode)
  
  **Your code never leaves your machine. Period.**
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

### Option 1: NPM (Recommended)

```bash
# Install globally
npm install -g woocode

# Run
woocode
```

### Option 2: Build from Source

```bash
# Clone the repository
git clone https://github.com/woody/woocode.git
cd woocode

# Install dependencies
npm install

# Build the project
npm run build
npm run bundle

# Run
./bundle/woocode.js
```

### Option 3: Pre-built Binary

```bash
# Download the latest release
wget https://github.com/woody/woocode/releases/latest/download/woocode.js

# Make executable
chmod +x woocode.js

# Run
./woocode.js
```

## 🚀 Quick Start

### Basic Usage

```bash
# Start WooCode in your project directory
cd your-project
woocode

# WooCode will:
# 1. Detect your GPU capabilities
# 2. Recommend the best local model
# 3. Auto-download the model (first run only)
# 4. Start the interactive session
```

### First Run Example

```
$ woocode
Detected GPU: NVIDIA RTX 4090 with 24GB VRAM
Recommended: Qwen3-Coder 30B (A3B) - Good balance
Downloading model... [████████████████████] 100%
Model ready! Starting WooCode...

Welcome to WooCode! How can I help you today?

> Help me understand this codebase
```

## 🎮 Usage Examples

### Interactive Mode (Default)

```bash
# Start interactive session
woocode

# Examples of what you can do:
> Explain the architecture of this project
> Find all API endpoints in this codebase
> Add error handling to the user authentication
> Write unit tests for the payment module
> Debug why the login feature is broken
```

### Non-Interactive Mode

```bash
# Single prompt execution
woocode -p "Generate a README for this project"

# Pipe input
echo "Explain this error" | woocode -p "Help me fix this:"

# Process files
cat error.log | woocode -p "Analyze these logs and suggest fixes"
```

### Provider Selection

```bash
# Use local GPU (default)
woocode

# Use specific local model
woocode --provider huggingface
woocode --provider ollama

# Use cloud APIs (requires API keys)
woocode --provider openai
woocode --provider anthropic
woocode --provider gemini
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

---

<div align="center">
  <b>WooCode - Your Code, Your Control, Your AI</b>
  <br>
  Made with ❤️ by the WooCode Community
</div>