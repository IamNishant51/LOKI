# LOKI (Local Omni Knowledge Interface)

LOKI is a local-first, privacy-focused AI assistant for developers. It runs entirely on your machine using Ollama, with optional cloud acceleration.

## Features

- 🧠 **Local Intelligence**: Uses `mistral:7b` by default. No API keys needed.
- 💾 **Semantic Memory**: Remembers context across sessions using local vector embeddings.
- 🛠 **Tool-Use**: Can manage files, run git commands, and calculate math.
- 📂 **Project Awareness**: Understands your project structure and git history.
- 🚀 **Extensible**: Add new tools and agents easily.

## Getting Started

1. **Prerequisites**:
   - Install [Ollama](https://ollama.com/)
   - Pull the default model: `ollama pull mistral:7b`
   - Pull the embedding model: `ollama pull nomic-embed-text`

2. **Installation**:
   ```bash
   git clone https://github.com/yourusername/loki.git
   cd loki
   npm install
   ```

3. **Usage**:
   ```bash
   # Chat
   npm run dev -- chat "Help me fix this bug"
   
   # Interactive
   npm run dev -- chat
   
   # Diagnose
   npm run dev -- doctor
   ```

## Privacy & Ethics

LOKI is designed to protect your code and data.
- **No telemetry**: We do not track your usage.
- **Local Vectors**: Your memory database stays in `~/.loki`.
- **Read-Only Tools**: LOKI defaults to reading data, not overwriting it without permission.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## License

MIT
