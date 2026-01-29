"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.agentRunner = agentRunner;
const providerFactory_1 = require("../llm/providerFactory");
const index_1 = require("../agents/index");
const memoryStore_1 = require("../memory/memoryStore");
const fileContext_1 = require("../context/fileContext");
const intentRouter_1 = require("./intentRouter");
const toolRegistry_1 = require("../tools/toolRegistry");
const semanticStore_1 = require("../memory/semanticStore");
const projectContext_1 = require("../context/projectContext");
/**
 * Main orchestration layer for LOKI.
 */
async function agentRunner(userMessage, options = {}) {
    // --- 0. FAST INTENT ROUTING ---
    const intent = await (0, intentRouter_1.routeIntent)(userMessage);
    if (intent.handled) {
        return intent.result || "Done.";
    }
    if (options.signal?.aborted)
        throw new Error('Aborted');
    // --- 1. PREPARE CONTEXT ---
    const projectCtx = (0, projectContext_1.getProjectContext)();
    const projectBlock = `\n=== PROJECT CONTEXT ===\n${(0, projectContext_1.formatProjectContext)(projectCtx)}\n=======================\n`;
    let semanticBlock = '';
    if (options.useSemantic !== false) {
        const memories = await (0, semanticStore_1.retrieveRelevantMemory)(userMessage);
        if (memories.length > 0) {
            semanticBlock = `\n=== RELEVANT MEMORIES ===\n${memories.join('\n')}\n=========================\n`;
        }
    }
    let historyBlock = '';
    if (options.useMemory !== false) {
        const history = (0, memoryStore_1.loadMemory)();
        if (history.length > 0) {
            const h = history.map(getItem => `${getItem.role.toUpperCase()}: ${getItem.content}`).join('\n');
            historyBlock = `\n=== CONVERSATION HISTORY ===\n${h}\n============================\n`;
        }
    }
    let fileBlock = '';
    if (options.fileContextPaths && options.fileContextPaths.length > 0) {
        const fileContent = (0, fileContext_1.loadFileContext)(options.fileContextPaths);
        if (fileContent) {
            fileBlock = `\n=== FILE CONTEXT ===\n${fileContent}\n====================\n`;
        }
    }
    // --- 2. BUILD PROMPT ---
    const systemPrompt = (0, index_1.getSystemPrompt)(options.agent);
    let fullPrompt;
    if (options.isChat) {
        // Chat mode (WhatsApp) - cleaner, conversational responses
        const chatSystemPrompt = `You are LOKI, a friendly AI assistant chatting on WhatsApp.

CRITICAL RULES:
1. NEVER output JSON, code blocks (\`\`\`), or any programming syntax
2. NEVER mention "tools", "commands", or technical implementation details
3. Respond in plain, natural language only
4. Be conversational, friendly, and concise
5. Keep responses under 300 characters
6. If asked about files/folders/system tasks, explain you can only help with those in the full CLI version
7. For chat, focus on conversation, advice, information, and friendly assistance

Remember: You are chatting casually. No technical output allowed.`;
        fullPrompt = `${chatSystemPrompt}

User: ${userMessage}
Assistant:`;
    }
    else {
        // Full mode (CLI) - with tools and project context
        // System Context - Real user info
        const os = require('os');
        const systemContext = `
=== SYSTEM CONTEXT ===
User: ${os.userInfo().username}
Home Directory: ${os.homedir()}
Desktop Path: ${os.homedir()}/Desktop
Current Working Directory: ${process.cwd()}
OS: ${os.platform()}
======================
`;
        const toolsBlock = `
=== AVAILABLE TOOLS ===
You can use tools by outputting a JSON block:
\`\`\`json
{ "tool": "tool_name", "args": { ... } }
\`\`\`
${(0, toolRegistry_1.getToolSchemas)()}
=======================
If you use a tool, output ONLY the JSON block first. I will give you the result.
Then you can answer the user.
        `;
        fullPrompt = `
${systemPrompt}

${systemContext}
${projectBlock}
${semanticBlock}
${fileBlock}
${toolsBlock}
${historyBlock}

User: ${userMessage}
Assistant:`;
    }
    // --- 3. EXECUTE ---
    if (options.signal?.aborted)
        throw new Error('Aborted');
    const provider = (0, providerFactory_1.getProvider)(options.provider);
    // Initial pass (Non-streaming to catch JSON better, or standard)
    // We use generated promise wrapper to allow abort
    let initialResponse = await provider.generate(fullPrompt, undefined, options.signal);
    // Check for JSON tool call
    const toolRegex = /```json\s*(\{.*"tool":.*\})\s*```/s;
    const match = initialResponse.match(toolRegex);
    if (match) {
        try {
            const toolCall = JSON.parse(match[1]);
            if (options.onToken)
                options.onToken(`[Executing ${toolCall.tool}...] `);
            const toolResult = await (0, toolRegistry_1.executeToolCall)(toolCall.tool, toolCall.args);
            fullPrompt += `\n${initialResponse}\n\nTool Output: ${toolResult}\n\nAssistant (Interpreting result):`;
            // Final Response
            if (options.stream && provider.streamGenerate && options.onToken) {
                const final = await provider.streamGenerate(fullPrompt, options.onToken, options.signal);
                await saveInteraction(userMessage, final, options);
                return final.trim();
            }
            else {
                const final = await provider.generate(fullPrompt, undefined, options.signal);
                await saveInteraction(userMessage, final, options);
                return final.trim();
            }
        }
        catch (e) {
            // failed tool parse
        }
    }
    // Pass through initial response if no tool
    if (options.stream && options.onToken) {
        options.onToken(initialResponse);
    }
    await saveInteraction(userMessage, initialResponse, options);
    return initialResponse.trim();
}
async function saveInteraction(user, assistant, options) {
    if (options.useMemory !== false) {
        const timestamp = new Date().toISOString();
        (0, memoryStore_1.appendMemory)({ timestamp, role: 'user', content: user });
        (0, memoryStore_1.appendMemory)({ timestamp, role: 'assistant', content: assistant });
    }
    if (options.useSemantic !== false) {
        await (0, semanticStore_1.storeSemanticMemory)(user, 'chat');
    }
}
