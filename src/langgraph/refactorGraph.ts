import { StateGraph, END } from "@langchain/langgraph";
import { BaseMessage, HumanMessage, AIMessage } from "@langchain/core/messages";
import { LokiChatModel } from "../langchain/llmAdapter";
import { RunnableConfig } from "@langchain/core/runnables";

interface RefactorState {
    messages: BaseMessage[];
    plan?: string;
    analysis?: string;
    code?: string;
    approved?: boolean;
}

// Agents execution 
async function plannerNode(state: RefactorState, config?: RunnableConfig) {
    const model = new LokiChatModel();
    const result = await model.invoke([
        ...state.messages,
        new HumanMessage("Create a plan for this request.")
    ]);
    return { plan: result.content as string, messages: [result] };
}

async function analyzerNode(state: RefactorState) {
    const model = new LokiChatModel();
    const result = await model.invoke([
        new HumanMessage(`Analyze the plan: ${state.plan}`)
    ]);
    return { analysis: result.content as string };
}

async function refactorNode(state: RefactorState) {
    const model = new LokiChatModel();
    const result = await model.invoke([
        new HumanMessage(`Generate code for plan: ${state.plan}. Analysis: ${state.analysis}`)
    ]);
    return { code: result.content as string };
}

// Build Graph
const builder = new StateGraph<RefactorState>({
    channels: {
        messages: { reducer: (a: BaseMessage[], b: BaseMessage[]) => a.concat(b) },
        plan: null,
        analysis: null,
        code: null,
        approved: null
    }
});

// Register nodes
builder.addNode("planner", plannerNode);
builder.addNode("analyzer", analyzerNode);
builder.addNode("refactor", refactorNode);

// Define edges with strict casts to bypass TS checking "Start" node logic
builder.addEdge("planner" as any, "analyzer" as any);
builder.addEdge("analyzer" as any, "refactor" as any);
builder.addEdge("refactor" as any, END);

builder.setEntryPoint("planner" as any);

export const refactorGraph = builder.compile();
