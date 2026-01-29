"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.refactorGraph = void 0;
const langgraph_1 = require("@langchain/langgraph");
const messages_1 = require("@langchain/core/messages");
const llmAdapter_1 = require("../langchain/llmAdapter");
// Agents execution 
async function plannerNode(state, config) {
    const model = new llmAdapter_1.LokiChatModel();
    const result = await model.invoke([
        ...state.messages,
        new messages_1.HumanMessage("Create a plan for this request.")
    ]);
    return { plan: result.content, messages: [result] };
}
async function analyzerNode(state) {
    const model = new llmAdapter_1.LokiChatModel();
    const result = await model.invoke([
        new messages_1.HumanMessage(`Analyze the plan: ${state.plan}`)
    ]);
    return { analysis: result.content };
}
async function refactorNode(state) {
    const model = new llmAdapter_1.LokiChatModel();
    const result = await model.invoke([
        new messages_1.HumanMessage(`Generate code for plan: ${state.plan}. Analysis: ${state.analysis}`)
    ]);
    return { code: result.content };
}
// Build Graph
const builder = new langgraph_1.StateGraph({
    channels: {
        messages: { reducer: (a, b) => a.concat(b) },
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
builder.addEdge("planner", "analyzer");
builder.addEdge("analyzer", "refactor");
builder.addEdge("refactor", langgraph_1.END);
builder.setEntryPoint("planner");
exports.refactorGraph = builder.compile();
