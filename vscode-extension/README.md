# 🧠 LOKI AI - Your Private Local Assistant

![LOKI Banner](https://raw.githubusercontent.com/IamNishant51/LOKI/main/vscode-extension/icon.png)

**LOKI (Local Omni Knowledge Interface)** is a privacy-first AI assistant that runs 100% locally on your machine. Chat with your codebase, explain complex functions, and generate code without sending a single byte to the cloud.

> 🔒 **Privacy First:** Your code never leaves your computer.
> ⚡ **Zero Latency:** No waiting for API calls.
> 💸 **Free Forever:** No subscriptions, no token limits.

---

## ✨ Features

### 1. 📝 Explain Code Instantly
Highlight any code snippet, right-click, and select **"LOKI: Explain Code Selection"**. LOKI will analyze the logic and explain it in plain English.

### 2. 💬 In-Editor Chat
Need to refactor? Just ask! LOKI lives in your sidebar and contextually understands your open files.

### 3. 🛡️ 100% Local (Ollama Powered)
Works seamlessly with [Ollama](https://ollama.ai/). Switch models instantly between Llama 3, Mistral, CodeLlama, and more.

---

## 🚀 Getting Started

### Prerequisites
1.  **Install [Ollama](https://ollama.ai/)**
2.  Pull a model: `ollama pull llama3` (or `mistral`, `codellama`)

### Installation
1.  Install this extension from the Marketplace.
2.  That's it! LOKI detects your local Ollama instance automatically.

---

## 🎮 Usage

### Context Menu
1.  Select code in any file.
2.  Right-click selection.
3.  Click **"LOKI: Explain Code Selection"**.

### Commands
Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac) and type:
*   `LOKI: Explain Selection` - Analyze highlighted code.
*   `LOKI: Open Chat` - Start a conversation.

---

## ⚙️ Configuration

You can customize LOKI in your VS Code settings:

| Setting | Default | Description |
| :--- | :--- | :--- |
| `loki.model` | `llama3` | The Ollama model to use. |
| `loki.apiEndpoint` | `http://localhost:11434` | Your local Ollama API URL. |

---

## 🤝 Support & Privacy

*   **Open Source:** [View Source Code on GitHub](https://github.com/IamNishant51/LOKI)
*   **Privacy Policy:** Use LOKI with confidence. We do not collect *any* telemetry or code data. Everything stays on `localhost`.

---

**Enjoy coding with LOKI?**
Please leave a ⭐ review on the Marketplace! it helps a lot. ❤️
