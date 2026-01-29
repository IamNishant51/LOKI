# LangChain Integration

LOKI includes an optional integration with [LangChain](https://js.langchain.com/).

## Why is it optional?
LOKI is built on a custom, lightweight architecture (`src/core`) to ensure zero-dependency, transparent operation by default. LangChain is powerful but can introduce complexity. We treat it as an "Engine" you can swap in.

## Capabilities Enabled
- **Advanced RAG**: Uses LangChain's recursive splitters and vector stores.
- **Portability**: Allows LOKI to easily swap to OpenAI/Anthropic via LangChain adapters if desired.
- **Tools**: Wraps LOKI tools into standard LangChain `DynamicStructuredTool`.

## Configuration
Set `USE_LANGCHAIN=true` in `src/utils/config.ts` or via `.env`.

---

# LangGraph Workflows

[LangGraph](https://langchain-ai.github.io/langgraphjs/) allows for cyclical, multi-agent workflows.

## Workflows
- **RefactorGraph**: Planner -> Analyzer -> Refactor Agent -> Review.

## Usage
When `USE_LANGGRAPH=true`, the `loki workflow` command will attempt to use the graph-based execution engine instead of the linear orchestrator.
