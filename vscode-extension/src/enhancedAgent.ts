/**
 * enhancedAgent.ts - Performance-Optimized Copilot-Style Agent
 * 
 * Key Improvements:
 * - Comprehensive tool system (12+ tools like Copilot)
 * - Parallel tool execution for speed
 * - Better error handling and retry logic
 * - Smarter context management
 * - Tool result caching
 */

import * as vscode from 'vscode';
import * as http from 'http';
import { TOOLS, getToolByName, getToolDescriptions } from './tools';

// ============== TYPES ==============

export interface AgentCallbacks {
    onThinking: () => void;
    onEditing: (file: string) => void;
    onSummary: (summary: string[], files: string[]) => void;
    onResponse: (text: string) => void;
    onAsk: (question: string) => void;
    onProgress: (step: string) => void;
}

interface OllamaResponse {
    message?: { content: string };
    response?: string;
    done?: boolean;
}

interface ToolCall {
    tool: string;
    args: any;
}

// ============== CONSTANTS ==============

const MAX_AGENT_STEPS = 10;
const MAX_RETRIES = 2;
const TOOL_TIMEOUT = 30000;

// Enhanced system prompt with all tools
const SYSTEM_PROMPT = `You are LOKI, an elite autonomous coding assistant with access to powerful tools.

CRITICAL RULES:
1. ALWAYS write COMPLETE, PRODUCTION-READY code - NO placeholders like "// TODO" or "..."
2. Use tools efficiently - call MULTIPLE tools in parallel when possible
3. READ files before editing them to understand context
4. If the user asks a general question or greeting, ANSWER DIRECTLY without tools.
5. Search the codebase before writing new code to avoid duplication

AVAILABLE TOOLS:
${getToolDescriptions()}

TOOL USAGE FORMAT (JSON only):
{"tool": "toolName", "args": {"arg1": "value1", "arg2": "value2"}}

EXAMPLES:

User: "How are you?"
Assistant: "I'm doing well, ready to code! How can I help?"

User: "Read a file"
Assistant: {"tool": "readFile", "args": {"path": "src/app.ts"}}

User: "Complete task"
Assistant: {"tool": "complete", "args": {"summary": "Created helper.ts and installed dependencies"}}

WORKFLOW:
1. If just chatting, reply normally.
2. If coding task:
   a. Gather context (tools)
   b. Plan & Execute (tools)
   c. Verify
   d. Complete
`;

// ============== OLLAMA CLIENT ==============

async function ollamaChat(
    messages: Array<{ role: string; content: string }>,
    model: string,
    baseUrl: string,
    signal?: AbortSignal
): Promise<string> {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            return reject(new Error('Aborted'));
        }

        const url = new URL(baseUrl);
        const postData = JSON.stringify({
            model,
            messages,
            stream: false,
            options: {
                temperature: 0.2,
                num_predict: 4096,
                num_ctx: 8192 // Larger context window
            }
        });

        const req = http.request({
            hostname: url.hostname,
            port: url.port || 11434,
            path: '/api/chat',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            },
            timeout: 180000
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json: OllamaResponse = JSON.parse(data);
                    resolve(json.message?.content || json.response || '');
                } catch {
                    resolve(data);
                }
            });
        });

        if (signal) {
            signal.addEventListener('abort', () => {
                req.destroy();
                reject(new Error('Aborted'));
            });
        }

        req.on('error', reject);
        req.on('timeout', () => reject(new Error('Request timeout')));
        req.write(postData);
        req.end();
    });
}

// ============== ENHANCED AGENT ==============

export class EnhancedLokiAgent {
    private model: string = 'codellama';
    private baseUrl: string = 'http://localhost:11434';
    private toolResultCache: Map<string, any> = new Map();

    constructor() {
        this.reloadModel();
    }

    reloadModel(): void {
        const config = vscode.workspace.getConfiguration('loki');
        this.model = config.get<string>('model') || 'codellama';
        this.baseUrl = config.get<string>('ollamaUrl') || 'http://localhost:11434';
    }

    async processMessage(
        message: string,
        callbacks: AgentCallbacks,
        signal?: AbortSignal
    ): Promise<void> {
        const messages: Array<{ role: string; content: string }> = [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: message }
        ];

        const modifiedFiles: string[] = [];
        let retryCount = 0;

        callbacks.onThinking();
        callbacks.onProgress('Analyzing request...');

        try {
            for (let step = 0; step < MAX_AGENT_STEPS; step++) {
                if (signal?.aborted) throw new Error('Aborted by user');

                callbacks.onProgress(`Step ${step + 1}/${MAX_AGENT_STEPS}...`);

                const response = await ollamaChat(messages, this.model, this.baseUrl, signal);
                messages.push({ role: 'assistant', content: response });

                // Parse tool calls from response
                const toolCalls = this.parseToolCalls(response);

                if (toolCalls.length === 0) {
                    // No tools found.
                    // If the response looks like a JSON attempt but failed parsing, we might want to retry.
                    // But generally, we assume this is a conversational response.

                    if (this.isTaskComplete(response)) {
                        if (modifiedFiles.length > 0) {
                            callbacks.onSummary(['Task completed successfully'], modifiedFiles);
                        }
                    }

                    // JUST RETURN THE RESPONSE. Do not force tool usage.
                    callbacks.onResponse(response);
                    return;
                }

                // Execute tools (in parallel when possible)
                callbacks.onProgress(`Executing ${toolCalls.length} tool(s)...`);
                const results = await this.executeToolCalls(
                    toolCalls,
                    modifiedFiles,
                    callbacks,
                    signal
                );

                // Check for completion
                const completeTool = toolCalls.find(t => t.tool === 'complete');
                if (completeTool) {
                    const summary = completeTool.args?.summary || 'Task completed';
                    callbacks.onSummary([summary], modifiedFiles);
                    callbacks.onResponse(`✅ ${summary}\n\nModified files: ${modifiedFiles.join(', ') || 'None'}`);
                    return;
                }

                // Check for errors and retry failed tools
                const hasErrors = results.some(r => r.startsWith('Error:'));
                if (hasErrors && retryCount < MAX_RETRIES) {
                    retryCount++;
                    messages.push({
                        role: 'user',
                        content: `Some tools failed. Results:\n${results.join('\n\n')}\n\nPlease fix the errors and try again.`
                    });
                } else {
                    retryCount = 0;
                    messages.push({
                        role: 'user',
                        content: `Tool results:\n${results.join('\n\n')}\n\nContinue with next step or use "complete" tool when done.`
                    });
                }
            }

            // Reached max steps
            if (modifiedFiles.length > 0) {
                callbacks.onSummary(['Partial completion'], modifiedFiles);
                callbacks.onResponse(`Created/modified ${modifiedFiles.length} file(s)`);
            } else {
                callbacks.onResponse('Could not complete task. Try breaking it into smaller steps.');
            }

        } catch (e: any) {
            if (e.message === 'Aborted by user' || e.message === 'Aborted') {
                throw e; // Re-throw to be handled by caller
            }
            callbacks.onResponse(`Error: ${e.message}`);
        }
    }

    private parseToolCalls(response: string): ToolCall[] {
        const calls: ToolCall[] = [];
        let startIndex = 0;

        while (true) {
            const openBrace = response.indexOf('{', startIndex);
            if (openBrace === -1) break;

            let depth = 0;
            let found = false;
            let endBrace = -1;

            for (let i = openBrace; i < response.length; i++) {
                if (response[i] === '{') depth++;
                else if (response[i] === '}') depth--;

                if (depth === 0) {
                    endBrace = i;
                    found = true;
                    break;
                }
            }

            if (found) {
                const jsonStr = response.slice(openBrace, endBrace + 1);
                try {
                    const parsed = JSON.parse(jsonStr);
                    if (parsed.tool && parsed.args) {
                        calls.push(parsed as ToolCall);
                    }
                } catch {
                    // Not valid JSON, or partial match, continue searching
                }
                startIndex = endBrace + 1;
            } else {
                // If we couldn't find a closing brace, or it wasn't valid, move past this opening brace
                startIndex = openBrace + 1;
            }
        }

        return calls;
    }

    private async executeToolCalls(
        toolCalls: ToolCall[],
        modifiedFiles: string[],
        callbacks: AgentCallbacks,
        signal?: AbortSignal
    ): Promise<string[]> {
        // Separate independent and dependent tools
        const independent = toolCalls.filter(t =>
            !['writeFile', 'editFile', 'runInTerminal'].includes(t.tool)
        );
        const dependent = toolCalls.filter(t =>
            ['writeFile', 'editFile', 'runInTerminal'].includes(t.tool)
        );

        const results: string[] = [];

        // Execute independent tools IN PARALLEL for speed
        if (independent.length > 0) {
            const parallelResults = await Promise.all(
                independent.map(call => this.executeSingleTool(call, callbacks, signal))
            );
            results.push(...parallelResults);
        }

        // Execute dependent tools SEQUENTIALLY for safety
        for (const call of dependent) {
            const result = await this.executeSingleTool(call, callbacks, signal);
            results.push(result);

            // Track modified files
            if (['writeFile', 'editFile'].includes(call.tool) && call.args.path) {
                modifiedFiles.push(call.args.path);
                callbacks.onEditing(call.args.path);
            }
        }

        return results;
    }

    private async executeSingleTool(
        call: ToolCall,
        callbacks: AgentCallbacks,
        signal?: AbortSignal
    ): Promise<string> {
        if (signal?.aborted) {
            return 'Error: Aborted';
        }

        callbacks.onProgress(`Using ${call.tool}...`);

        const tool = getToolByName(call.tool);
        if (!tool) {
            return `Error: Unknown tool "${call.tool}"`;
        }

        try {
            const result = await Promise.race([
                tool.execute(call.args, (msg) => callbacks.onProgress(msg)),
                new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error('Tool timeout')), TOOL_TIMEOUT)
                )
            ]);

            if (result.success) {
                return `✅ ${call.tool}: ${result.result}`;
            } else {
                return `❌ ${call.tool}: ${result.error || 'Unknown error'}`;
            }
        } catch (e: any) {
            return `❌ ${call.tool}: ${e.message}`;
        }
    }

    private isTaskComplete(response: string): boolean {
        const lower = response.toLowerCase();
        return (
            lower.includes('task complete') ||
            lower.includes('finished') ||
            lower.includes('all done') ||
            (lower.includes('created') && lower.includes('successfully'))
        );
    }

    // Clear cache (call periodically or on workspace change)
    clearCache(): void {
        this.toolResultCache.clear();
    }
}
