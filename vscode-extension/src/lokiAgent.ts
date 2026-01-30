/**
 * lokiAgent.ts - Lightweight Autonomous Coding Agent
 * 
 * Optimized for fast compilation:
 * - Direct HTTP calls to Ollama (no heavy LangChain types)
 * - Simple state management
 * - Error recovery with self-healing
 * - Copilot-level autonomous coding
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';

// ============== TYPES ==============

interface AgentState {
    task: string;
    messages: Array<{ role: string; content: string }>;
    errors: string[];
    retryCount: number;
    status: 'thinking' | 'executing' | 'fixing' | 'done' | 'error';
}

interface ToolCallbacks {
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

// ============== CONSTANTS ==============

const MAX_RETRIES = 3;
const MAX_ITERATIONS = 10;

const SYSTEM_PROMPT = `You are LOKI, an elite autonomous coding agent.

## RULES
1. Write COMPLETE code only - no placeholders or TODOs
2. If errors occur, fix them automatically
3. Use tools to accomplish tasks

## TOOLS (use JSON format)
To use a tool, respond with: {"tool": "toolName", "args": {...}}

Available tools:
- readFile: {"tool": "readFile", "args": {"path": "file.ts"}}
- writeFile: {"tool": "writeFile", "args": {"path": "file.ts", "content": "code..."}}
- editFile: {"tool": "editFile", "args": {"path": "file.ts", "search": "old", "replace": "new"}}
- listFiles: {"tool": "listFiles", "args": {"path": "."}}
- runCommand: {"tool": "runCommand", "args": {"command": "npm install"}}
- complete: {"tool": "complete", "args": {"summary": "What was done", "files": ["file1.ts"]}}

## WORKFLOW
1. Understand the task
2. Use tools to implement
3. When done, use "complete" tool

Be concise. Focus on code quality.`;

// ============== OLLAMA CLIENT ==============

async function ollamaChat(
    messages: Array<{ role: string; content: string }>,
    model: string,
    baseUrl: string
): Promise<string> {
    return new Promise((resolve, reject) => {
        const url = new URL(baseUrl);
        const postData = JSON.stringify({
            model,
            messages,
            stream: false,
            options: { temperature: 0.1 }
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
            timeout: 120000
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

        req.on('error', reject);
        req.on('timeout', () => reject(new Error('Request timeout')));
        req.write(postData);
        req.end();
    });
}

// ============== TOOL IMPLEMENTATIONS ==============

function getWorkspaceRoot(): string {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
}

function resolvePath(filePath: string): string {
    const root = getWorkspaceRoot();
    return path.isAbsolute(filePath) ? filePath : path.join(root, filePath);
}

async function executeReadFile(filePath: string): Promise<string> {
    try {
        const fullPath = resolvePath(filePath);
        if (!fs.existsSync(fullPath)) {
            return `Error: File not found: ${filePath}`;
        }
        const content = fs.readFileSync(fullPath, 'utf-8');
        return `File ${filePath}:\n\`\`\`\n${content}\n\`\`\``;
    } catch (e) {
        return `Error: ${e}`;
    }
}

async function executeWriteFile(filePath: string, content: string, callbacks: ToolCallbacks): Promise<string> {
    try {
        const fullPath = resolvePath(filePath);
        const dir = path.dirname(fullPath);

        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        // Backup existing file
        if (fs.existsSync(fullPath)) {
            const backupDir = path.join(getWorkspaceRoot(), '.loki-backups');
            if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
            const ts = new Date().toISOString().replace(/[:.]/g, '-');
            fs.copyFileSync(fullPath, path.join(backupDir, `${path.basename(filePath)}.${ts}.bak`));
        }

        fs.writeFileSync(fullPath, content, 'utf-8');
        callbacks.onEditing(filePath);

        // Open in VS Code
        const doc = await vscode.workspace.openTextDocument(fullPath);
        await vscode.window.showTextDocument(doc, { preview: false });

        return `Created ${filePath} (${content.split('\n').length} lines)`;
    } catch (e) {
        return `Error: ${e}`;
    }
}

async function executeEditFile(filePath: string, search: string, replace: string, callbacks: ToolCallbacks): Promise<string> {
    try {
        const fullPath = resolvePath(filePath);
        if (!fs.existsSync(fullPath)) {
            return `Error: File not found: ${filePath}`;
        }

        let content = fs.readFileSync(fullPath, 'utf-8');
        if (!content.includes(search)) {
            return `Error: Search text not found in ${filePath}`;
        }

        // Backup
        const backupDir = path.join(getWorkspaceRoot(), '.loki-backups');
        if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        fs.copyFileSync(fullPath, path.join(backupDir, `${path.basename(filePath)}.${ts}.bak`));

        content = content.replace(search, replace);
        fs.writeFileSync(fullPath, content, 'utf-8');
        callbacks.onEditing(filePath);

        return `Edited ${filePath}`;
    } catch (e) {
        return `Error: ${e}`;
    }
}

async function executeListFiles(dirPath: string): Promise<string> {
    try {
        const fullPath = resolvePath(dirPath || '.');
        const ignored = new Set(['.git', 'node_modules', 'dist', 'out', '.loki-backups']);
        const results: string[] = [];

        const entries = fs.readdirSync(fullPath, { withFileTypes: true });
        for (const entry of entries) {
            if (ignored.has(entry.name)) continue;
            results.push(`${entry.isDirectory() ? '📁' : '📄'} ${entry.name}`);
        }

        return `Files:\n${results.join('\n')}`;
    } catch (e) {
        return `Error: ${e}`;
    }
}

async function executeCommand(command: string, callbacks: ToolCallbacks): Promise<string> {
    callbacks.onProgress(`Running: ${command}`);

    return new Promise((resolve) => {
        const { exec } = require('child_process');
        exec(command, { cwd: getWorkspaceRoot(), timeout: 30000 }, (err: any, stdout: string, stderr: string) => {
            if (err) {
                resolve(`Error: ${stderr || err.message}`);
            } else {
                resolve(`Output:\n${stdout || '(done)'}`);
            }
        });
    });
}

// ============== AGENT CLASS ==============

export class LokiAgent {
    private model: string = 'codellama';
    private baseUrl: string = 'http://localhost:11434';

    constructor() {
        this.reloadModel();
    }

    reloadModel(): void {
        const config = vscode.workspace.getConfiguration('loki');
        this.model = config.get<string>('model') || 'codellama';
        this.baseUrl = config.get<string>('ollamaUrl') || 'http://localhost:11434';
    }

    async processMessage(message: string, callbacks: ToolCallbacks): Promise<void> {
        const state: AgentState = {
            task: message,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: message }
            ],
            errors: [],
            retryCount: 0,
            status: 'thinking'
        };

        callbacks.onThinking();
        callbacks.onProgress('Analyzing task...');

        try {
            await this.runLoop(state, callbacks);
        } catch (e) {
            callbacks.onResponse(`Error: ${e}`);
        }
    }

    private async runLoop(state: AgentState, callbacks: ToolCallbacks): Promise<void> {
        const modifiedFiles: string[] = [];

        for (let i = 0; i < MAX_ITERATIONS && state.status !== 'done' && state.status !== 'error'; i++) {
            callbacks.onProgress(`Step ${i + 1}...`);

            try {
                const response = await ollamaChat(state.messages, this.model, this.baseUrl);
                state.messages.push({ role: 'assistant', content: response });

                // Parse tool calls
                const toolCall = this.parseToolCall(response);

                if (toolCall) {
                    callbacks.onProgress(`Using ${toolCall.tool}...`);
                    const result = await this.executeTool(toolCall, callbacks, modifiedFiles);

                    if (result === 'COMPLETE') {
                        state.status = 'done';
                        return;
                    }

                    state.messages.push({ role: 'user', content: `Tool result: ${result}` });

                    // Check for errors
                    if (result.startsWith('Error:')) {
                        state.retryCount++;
                        if (state.retryCount >= MAX_RETRIES) {
                            callbacks.onResponse(`Failed after ${MAX_RETRIES} attempts: ${result}`);
                            state.status = 'error';
                            return;
                        }
                    } else {
                        state.retryCount = 0;
                    }
                } else {
                    // No tool call - check if it's a final response
                    if (response.toLowerCase().includes('complete') || response.toLowerCase().includes('done')) {
                        callbacks.onResponse(response);
                        callbacks.onSummary([response], modifiedFiles);
                        state.status = 'done';
                        return;
                    }

                    // Prompt to continue
                    state.messages.push({
                        role: 'user',
                        content: 'Continue with the task. Use a tool or mark complete when done.'
                    });
                }
            } catch (e) {
                state.retryCount++;
                if (state.retryCount >= MAX_RETRIES) {
                    callbacks.onResponse(`Error: ${e}`);
                    state.status = 'error';
                    return;
                }
                state.messages.push({ role: 'user', content: `Error occurred: ${e}. Try again.` });
            }
        }

        if (state.status !== 'done') {
            callbacks.onResponse('Task timeout. Progress made was limited.');
        }
    }

    private parseToolCall(response: string): { tool: string; args: any } | null {
        // Try to extract JSON tool call
        const patterns = [
            /\{"tool":\s*"(\w+)",\s*"args":\s*(\{[^}]+\})\}/,
            /\{"tool":\s*"(\w+)"[^}]*\}/
        ];

        for (const pattern of patterns) {
            const match = response.match(pattern);
            if (match) {
                try {
                    const fullMatch = match[0];
                    const parsed = JSON.parse(fullMatch);
                    return { tool: parsed.tool, args: parsed.args || {} };
                } catch { }
            }
        }

        return null;
    }

    private async executeTool(
        toolCall: { tool: string; args: any },
        callbacks: ToolCallbacks,
        modifiedFiles: string[]
    ): Promise<string> {
        const { tool, args } = toolCall;

        switch (tool) {
            case 'readFile':
                return executeReadFile(args.path);

            case 'writeFile':
                modifiedFiles.push(args.path);
                return executeWriteFile(args.path, args.content, callbacks);

            case 'editFile':
                modifiedFiles.push(args.path);
                return executeEditFile(args.path, args.search, args.replace, callbacks);

            case 'listFiles':
                return executeListFiles(args.path);

            case 'runCommand':
                return executeCommand(args.command, callbacks);

            case 'complete':
                callbacks.onSummary([args.summary || 'Task completed'], args.files || modifiedFiles);
                return 'COMPLETE';

            default:
                return `Unknown tool: ${tool}`;
        }
    }

    // ============== UTILITY METHODS ==============

    async openFile(filePath: string): Promise<vscode.TextEditor | null> {
        try {
            const fullPath = resolvePath(filePath);
            const doc = await vscode.workspace.openTextDocument(fullPath);
            return await vscode.window.showTextDocument(doc, { preview: false });
        } catch {
            return null;
        }
    }

    async readFile(filePath: string): Promise<string | null> {
        try {
            return fs.readFileSync(resolvePath(filePath), 'utf-8');
        } catch {
            return null;
        }
    }

    async createFile(filePath: string, content: string): Promise<boolean> {
        try {
            const fullPath = resolvePath(filePath);
            const dir = path.dirname(fullPath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(fullPath, content, 'utf-8');
            const doc = await vscode.workspace.openTextDocument(fullPath);
            await vscode.window.showTextDocument(doc, { preview: false });
            return true;
        } catch {
            return false;
        }
    }

    // Quick LLM methods
    async generateCompletion(prefix: string, suffix: string, _language: string): Promise<string> {
        try {
            const response = await ollamaChat([
                { role: 'system', content: 'Complete the code. Return ONLY the completion, no explanation.' },
                { role: 'user', content: `Complete (max 6 lines):\n${prefix.slice(-400)}█${suffix.slice(0, 150)}` }
            ], this.model, this.baseUrl);

            return response.replace(/```[\w]*\n?/g, '').replace(/```$/g, '').trim().split('\n').slice(0, 6).join('\n');
        } catch {
            return '';
        }
    }

    async explainCode(code: string, language: string): Promise<string> {
        try {
            return await ollamaChat([
                { role: 'system', content: 'Explain code clearly and concisely.' },
                { role: 'user', content: `Explain this ${language} code:\n\`\`\`${language}\n${code}\n\`\`\`` }
            ], this.model, this.baseUrl);
        } catch {
            return 'Failed to explain code.';
        }
    }

    async refactorCode(code: string, language: string): Promise<string> {
        try {
            const response = await ollamaChat([
                { role: 'system', content: 'Refactor code for clarity and performance. Return ONLY code.' },
                { role: 'user', content: `Refactor:\n\`\`\`${language}\n${code}\n\`\`\`` }
            ], this.model, this.baseUrl);

            const match = response.match(/```[\w]*\n([\s\S]*?)```/);
            return match ? match[1].trim() : response.trim();
        } catch {
            return code;
        }
    }

    async generateTests(code: string, language: string): Promise<string> {
        try {
            return await ollamaChat([
                { role: 'system', content: 'Generate comprehensive unit tests.' },
                { role: 'user', content: `Generate tests for:\n\`\`\`${language}\n${code}\n\`\`\`` }
            ], this.model, this.baseUrl);
        } catch {
            return 'Failed to generate tests.';
        }
    }

    async fixBugs(code: string, language: string): Promise<{ analysis: string; fixed: string }> {
        try {
            const response = await ollamaChat([
                { role: 'system', content: 'Find and fix bugs. Format: ANALYSIS: ... FIXED: ```code```' },
                { role: 'user', content: `Fix bugs:\n\`\`\`${language}\n${code}\n\`\`\`` }
            ], this.model, this.baseUrl);

            const parts = response.split('FIXED:');
            const analysis = parts[0]?.replace('ANALYSIS:', '').trim() || 'Reviewed';
            const match = parts[1]?.match(/```[\w]*\n([\s\S]*?)```/);
            return { analysis, fixed: match ? match[1].trim() : code };
        } catch {
            return { analysis: 'Error analyzing', fixed: code };
        }
    }
}
