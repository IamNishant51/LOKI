# Architecture

LOKI follows a modular, local-first architecture designed for transparency and extensibility.

## Core Components

### 1. CLI Layer (`src/cli/`)
- Handles user input, flags, and terminal rendering.
- Uses `commander` for parsing and `chalk` for styling.
- **Project Principles**: No magic. Emojis for status, raw text for data.

### 2. Agent Core (`src/core/`)
- **AgentRunner**: Main loop. Combines prompts, context, and LLM IO.
- **IntentRouter**: Decides if a query needs a Tool, Memory, or Reasoning.
- **Orchestrator**: Manages multi-agent workflows (Plan -> Analyze -> Execute).

### 3. Tool System (`src/tools/`)
- Standardized `Tool` interface.
- Tools are functions exposed to the LLM via JSON schema.
- **Safety**: Tools like `fs` and `git` are sandboxed to read-only where possible.

### 4. Memory System (`src/memory/`)
- **Semantic Store**: Local vector database (JSON-based for simplicity).
- **Embeddings**: Generated locally via Ollama (`nomic-embed-text`).
- No data ever leaves `~/.loki`.

### 5. RAG Engine (`src/rag/`)
- Indexes local repositories associated with hash.
- Chunks files and embeds them for context retrieval.

## Data Flow

User Input -> CLI -> Spinner -> IntentRouter
   |
   +-> [Fast Path] -> Time/Math/Simple Tools -> Output
   |
   +-> [Slow Path] -> AgentRunner
          |
          +-> Load Context (Project, git, memory, RAG)
          +-> Build Prompt
          +-> LLM (Ollama) <-> Tool Loop
          +-> Semantic Store (Save)
          +-> Output
