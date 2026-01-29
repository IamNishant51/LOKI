import { getProvider } from '../llm/providerFactory';
import { getSystemPrompt } from '../agents/index';
import { loadMemory, appendMemory } from '../memory/memoryStore';
import { loadFileContext } from '../context/fileContext';
import { routeIntent } from './intentRouter';
import { executeToolCall, getToolSchemas } from '../tools/toolRegistry';
import { storeSemanticMemory, retrieveRelevantMemory } from '../memory/semanticStore';
import { getProjectContext, formatProjectContext } from '../context/projectContext';

export interface RunOptions {
    provider?: string;
    agent?: string;
    useMemory?: boolean;
    useSemantic?: boolean;
    fileContextPaths?: string[];
    stream?: boolean;
    onToken?: (token: string) => void;
    signal?: AbortSignal; // New
}

/**
 * Main orchestration layer for LOKI.
 */
export async function agentRunner(userMessage: string, options: RunOptions = {}): Promise<string> {

    // --- 0. FAST INTENT ROUTING ---
    const intent = await routeIntent(userMessage);
    if (intent.handled) {
        return intent.result || "Done.";
    }

    if (options.signal?.aborted) throw new Error('Aborted');

    // --- 1. PREPARE CONTEXT ---
    const projectCtx = getProjectContext();
    const projectBlock = `\n=== PROJECT CONTEXT ===\n${formatProjectContext(projectCtx)}\n=======================\n`;

    let semanticBlock = '';
    if (options.useSemantic !== false) {
        const memories = await retrieveRelevantMemory(userMessage);
        if (memories.length > 0) {
            semanticBlock = `\n=== RELEVANT MEMORIES ===\n${memories.join('\n')}\n=========================\n`;
        }
    }

    let historyBlock = '';
    if (options.useMemory !== false) {
        const history = loadMemory();
        if (history.length > 0) {
            const h = history.map(getItem => `${getItem.role.toUpperCase()}: ${getItem.content}`).join('\n');
            historyBlock = `\n=== CONVERSATION HISTORY ===\n${h}\n============================\n`;
        }
    }

    let fileBlock = '';
    if (options.fileContextPaths && options.fileContextPaths.length > 0) {
        const fileContent = loadFileContext(options.fileContextPaths);
        if (fileContent) {
            fileBlock = `\n=== FILE CONTEXT ===\n${fileContent}\n====================\n`;
        }
    }

    const toolsBlock = `
=== AVAILABLE TOOLS ===
You can use tools by outputting a JSON block:
\`\`\`json
{ "tool": "tool_name", "args": { ... } }
\`\`\`
${getToolSchemas()}
=======================
If you use a tool, output ONLY the JSON block first. I will give you the result.
Then you can answer the user.
    `;

    // --- 2. BUILD PROMPT ---
    const systemPrompt = getSystemPrompt(options.agent);

    let fullPrompt = `
${systemPrompt}

${projectBlock}
${semanticBlock}
${fileBlock}
${toolsBlock}
${historyBlock}

User: ${userMessage}
Assistant:`;

    // --- 3. EXECUTE ---
    if (options.signal?.aborted) throw new Error('Aborted');

    const provider = getProvider(options.provider);

    // Initial pass (Non-streaming to catch JSON better, or standard)
    // We use generated promise wrapper to allow abort
    let initialResponse = await provider.generate(fullPrompt, undefined, options.signal);

    // Check for JSON tool call
    const toolRegex = /```json\s*(\{.*"tool":.*\})\s*```/s;
    const match = initialResponse.match(toolRegex);

    if (match) {
        try {
            const toolCall = JSON.parse(match[1]);
            if (options.onToken) options.onToken(`[Executing ${toolCall.tool}...] `);

            const toolResult = await executeToolCall(toolCall.tool, toolCall.args);

            fullPrompt += `\n${initialResponse}\n\nTool Output: ${toolResult}\n\nAssistant (Interpreting result):`;

            // Final Response
            if (options.stream && provider.streamGenerate && options.onToken) {
                const final = await provider.streamGenerate(fullPrompt, options.onToken, options.signal);
                await saveInteraction(userMessage, final, options);
                return final.trim();
            } else {
                const final = await provider.generate(fullPrompt, undefined, options.signal);
                await saveInteraction(userMessage, final, options);
                return final.trim();
            }

        } catch (e) {
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

async function saveInteraction(user: string, assistant: string, options: RunOptions) {
    if (options.useMemory !== false) {
        const timestamp = new Date().toISOString();
        appendMemory({ timestamp, role: 'user', content: user });
        appendMemory({ timestamp, role: 'assistant', content: assistant });
    }
    if (options.useSemantic !== false) {
        await storeSemanticMemory(user, 'chat');
    }
}
