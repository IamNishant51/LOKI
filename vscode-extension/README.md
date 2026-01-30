# 🚀 LOKI - Ultimate Local AI Coding Agent

**Privacy-first, fully local VS Code extension providing Copilot-style AI assistance.**

## 🔒 Privacy & Security

> **LOKI runs 100% locally. No data leaves your machine.**

- All AI requests go to `localhost:11434` (Ollama)
- No telemetry, no analytics, no external API calls
- No cloud services required
- Your code stays on your machine

## ✨ Features

### 1. Inline Ghost Text Completions
Copilot-style suggestions as you type:
- Debounced for performance (300ms default)
- Cancellable on new input
- Context-aware (reads surrounding code)

### 2. Chat Sidebar
Interactive AI chat with:
- Model selector dropdown
- Streaming responses
- Code blocks with "Insert" buttons
- Slash commands: `/explain`, `/refactor`, `/tests`, `/fix`

### 3. Code Actions
Right-click menu and `Ctrl+.` quick fixes:
- 💡 Explain Code
- ✨ Refactor Code
- 🧪 Generate Tests
- 🔧 Fix Bugs

### 4. Autonomous Agent
Build entire projects with natural language:
- "Build a React portfolio app"
- "Create a Node.js REST API"
- Step-by-step execution with user approval
- **Automatic backups** to `.loki-backups/`

## 📋 Requirements

### Ollama (Required)
LOKI uses Ollama for local LLM inference.

**Install Ollama:**
```bash
# Linux
curl -fsSL https://ollama.com/install.sh | sh

# macOS
brew install ollama

# Windows
# Download from https://ollama.com/download
```

**Start Ollama:**
```bash
ollama serve
```

**Download a model:**
```bash
# Recommended for coding
ollama pull codellama

# Alternative options
ollama pull deepseek-coder
ollama pull mistral
ollama pull qwen2.5-coder
```

## ⚙️ Configuration

Open VS Code Settings (`Ctrl+,`) and search for "LOKI":

| Setting | Default | Description |
|---------|---------|-------------|
| `loki.ollamaUrl` | `http://localhost:11434` | Ollama server URL |
| `loki.model` | `codellama` | Model for chat and code actions |
| `loki.completionModel` | `codellama` | Model for inline completions |
| `loki.enableCompletions` | `true` | Enable inline ghost text |
| `loki.completionDebounce` | `300` | Debounce delay (ms) |
| `loki.autonomousAutoApprove` | `false` | Auto-approve file changes (DANGEROUS) |

## 🎹 Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+L` | Open LOKI Chat |
| `Ctrl+Shift+;` | Toggle Inline Completions |
| `Ctrl+.` | Show Code Actions (with selection) |

## 🛡️ Safety Guarantees

### Autonomous Mode Safety
1. **Backups**: All file modifications create backups in `.loki-backups/`
2. **Approval**: Each potentially destructive step requires user confirmation (unless disabled)
3. **Logging**: All actions logged to `loki.log` in workspace root
4. **Rollback**: Automatic rollback on failure

### What LOKI Will NOT Do
- ❌ Send data to external servers
- ❌ Execute shell commands without approval
- ❌ Modify files outside your workspace
- ❌ Access network resources (except localhost Ollama)

## 🏗️ Project Structure

```
vscode-extension/
├── extension.ts           # Entry point, command registration
├── src/
│   ├── agent.ts           # Autonomous agent, code actions
│   ├── chatViewProvider.ts # Chat sidebar UI
│   ├── completionProvider.ts # Inline completions
│   ├── codeActionProvider.ts # Quick fix menu
│   └── ollamaClient.ts    # HTTP client for Ollama
├── package.json           # Extension manifest
└── tsconfig.json          # TypeScript config
```

## 🔧 Development

```bash
# Install dependencies
npm install

# Compile
npm run compile

# Watch mode
npm run watch

# Package extension
npm run package
```

**Debug the extension:**
1. Open in VS Code
2. Press F5
3. A new VS Code window opens with LOKI loaded

## 📄 License

MIT License - See [LICENSE](LICENSE)

## 🤝 Contributing

Contributions welcome! Please ensure:
- No external service dependencies
- All AI remains local
- User approval for destructive actions
- Comprehensive error handling

---

**Built with privacy in mind. Your code, your machine, your control.** 🔒
