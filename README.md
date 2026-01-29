# 🧠 LOKI - Local Omni Knowledge Interface

[![npm version](https://badge.fury.io/js/%40iamnishant51%2Floki-ai.svg)](https://www.npmjs.com/package/@iamnishant51/loki-ai)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**LOKI** is a powerful, privacy-first AI assistant that runs entirely on your local machine. No cloud, no subscriptions, just pure local AI power.

## ✨ Features

- 🔒 **100% Local** - Your data never leaves your machine
- 💬 **WhatsApp Integration** - Chat with LOKI via WhatsApp
- 🛠️ **Built-in Tools** - File system, math, time, and more
- 🧠 **Memory** - Remembers your conversations
- 🎨 **Beautiful TUI** - Intuitive terminal interface
- ⚡ **LangChain Powered** - Use multiple LLM providers (Ollama, Groq, OpenAI)
- 🔌 **VS Code Extension** - Available on the marketplace

## 🚀 Quick Start

```bash
# Install globally
npm install -g @iamnishant51/loki-ai

# Run LOKI
loki

# Or use npx (no install needed)
npx @iamnishant51/loki-ai
```

## 📋 Prerequisites

- **Node.js** 18+
- **Ollama** (for local LLM) - [Install here](https://ollama.ai)

## 🎯 Usage

### Interactive TUI Mode
```bash
loki
```

### Chat Mode
```bash
loki chat
```

### WhatsApp Integration
```bash
loki server
```
Then scan the QR code with WhatsApp!

### Direct Questions
```bash
loki ask "What time is it?"
```

## 🛠️ Available Tools

LOKI comes with built-in tools:

- **📁 File System** - List files, read directories
- **🧮 Math** - Calculate expressions
- **⏰ Time** - Get current time
- **💾 Memory** - Semantic and conversation memory
- **🔍 RAG** - Index repositories for context-aware responses

## 🔧 Configuration

Create a `.env` file:

```env
# LLM Provider (ollama, groq, openai)
LLM_PROVIDER=ollama

# Ollama settings
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2

# Optional: Groq API
GROQ_API_KEY=your_groq_key

# Optional: OpenAI API
OPENAI_API_KEY=your_openai_key
```

## 📱 WhatsApp Integration

1. Run `loki server`
2. Scan QR code with WhatsApp
3. Message yourself or share your number
4. LOKI responds automatically!

## 💻 VS Code Extension

Install from the [VS Code Marketplace](https://marketplace.visualstudio.com/) - Search for "LOKI AI"

Features:
- Explain code selections
- In-editor AI assistance
- Context-aware suggestions

## 🏗️ Development

```bash
# Clone repository
git clone https://github.com/IamNishant51/LOKI.git
cd LOKI

# Install dependencies
npm install

# Run in dev mode
npm run dev

# Build
npm run build
```

## 📦 Project Structure

```
loki-ai/
├── src/
│   ├── agents/         # AI agent configurations
│   ├── cli/            # CLI & TUI interface
│   ├── core/           # Core logic & agent runner
│   ├── tools/          # Built-in tools
│   ├── memory/         # Memory management
│   ├── interfaces/     # WhatsApp, etc.
│   └── index.ts        # Entry point
├── vscode-extension/   # VS Code extension
└── dist/               # Compiled output
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

MIT © Nishant

## 🔗 Links

- [GitHub](https://github.com/IamNishant51/LOKI)
- [NPM Package](https://www.npmjs.com/package/@iamnishant51/loki-ai)
- [VS Code Extension](https://marketplace.visualstudio.com/)
- [Documentation](#) *(coming soon)*

## ⭐ Show Your Support

If you like LOKI, please give it a ⭐ on [GitHub](https://github.com/IamNishant51/LOKI)!

---

Made with ❤️ by [Nishant](https://github.com/IamNishant51)
