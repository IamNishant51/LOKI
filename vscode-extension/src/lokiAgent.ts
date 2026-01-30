/**
 * lokiAgent.ts - Copilot-Level Autonomous Coding Agent
 * 
 * Key Features:
 * - Robust code generation (no placeholders ever)
 * - Direct file writing with complete code
 * - Error recovery and self-healing
 * - Multiple parsing strategies for tool calls
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';

// ============== TYPES ==============

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

const SYSTEM_PROMPT = `You are LOKI, an elite autonomous coding assistant. You write COMPLETE, PRODUCTION-READY code.

CRITICAL RULES:
1. NEVER write placeholders like "// code here", "// TODO", "...", or "// implementation"
2. ALWAYS write FULL, WORKING, COMPLETE code
3. When creating files, include ALL necessary code - imports, classes, functions, everything
4. Write code that compiles and runs immediately

TOOLS - Use this EXACT JSON format:

To create/write a file:
{"tool": "writeFile", "args": {"path": "filename.ext", "content": "COMPLETE CODE HERE"}}

To read a file:
{"tool": "readFile", "args": {"path": "filename.ext"}}

To edit part of a file:
{"tool": "editFile", "args": {"path": "filename.ext", "search": "old code", "replace": "new code"}}

To run a command:
{"tool": "runCommand", "args": {"command": "npm install"}}

When done:
{"tool": "complete", "args": {"summary": "What was done"}}

EXAMPLE - Creating a Java calculator:
{"tool": "writeFile", "args": {"path": "Calculator.java", "content": "import java.util.Scanner;\\n\\npublic class Calculator {\\n    public static void main(String[] args) {\\n        Scanner scanner = new Scanner(System.in);\\n        System.out.println(\\"Simple Calculator\\");\\n        System.out.print(\\"Enter first number: \\");\\n        double num1 = scanner.nextDouble();\\n        System.out.print(\\"Enter operator (+, -, *, /): \\");\\n        char operator = scanner.next().charAt(0);\\n        System.out.print(\\"Enter second number: \\");\\n        double num2 = scanner.nextDouble();\\n        double result = 0;\\n        switch (operator) {\\n            case '+': result = num1 + num2; break;\\n            case '-': result = num1 - num2; break;\\n            case '*': result = num1 * num2; break;\\n            case '/': result = num1 / num2; break;\\n            default: System.out.println(\\"Invalid operator\\"); return;\\n        }\\n        System.out.println(\\"Result: \\" + result);\\n        scanner.close();\\n    }\\n}"}}

Remember: Your code must be COMPLETE and FUNCTIONAL. No shortcuts, no placeholders.`;

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
            options: {
                temperature: 0.2,
                num_predict: 4096  // Allow longer responses for complete code
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
            timeout: 180000 // 3 minutes for complex code generation
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

async function executeWriteFile(filePath: string, content: string, callbacks: ToolCallbacks): Promise<string> {
    try {
        // Validate content - reject placeholders
        if (!content || content.length < 10) {
            return 'Error: Content too short. Please provide complete code.';
        }

        const placeholders = ['...code here', '// TODO', '// implementation', '/* code */', '...'];
        for (const ph of placeholders) {
            if (content.includes(ph)) {
                return `Error: Placeholder "${ph}" detected. Please provide complete, working code.`;
            }
        }

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

        // Unescape the content (handle escaped newlines, quotes)
        let finalContent = content
            .replace(/\\n/g, '\n')
            .replace(/\\t/g, '\t')
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, '\\');

        fs.writeFileSync(fullPath, finalContent, 'utf-8');
        callbacks.onEditing(filePath);

        // Open in VS Code
        const doc = await vscode.workspace.openTextDocument(fullPath);
        await vscode.window.showTextDocument(doc, { preview: false });

        return `Successfully created ${filePath} with ${finalContent.split('\n').length} lines of code`;
    } catch (e) {
        return `Error writing file: ${e}`;
    }
}

async function executeReadFile(filePath: string): Promise<string> {
    try {
        const fullPath = resolvePath(filePath);
        if (!fs.existsSync(fullPath)) {
            return `Error: File not found: ${filePath}`;
        }
        const content = fs.readFileSync(fullPath, 'utf-8');
        return `Contents of ${filePath}:\n\`\`\`\n${content}\n\`\`\``;
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

        // Unescape search/replace
        const searchText = search.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
        const replaceText = replace.replace(/\\n/g, '\n').replace(/\\t/g, '\t');

        if (!content.includes(searchText)) {
            return `Error: Search text not found in ${filePath}`;
        }

        // Backup
        const backupDir = path.join(getWorkspaceRoot(), '.loki-backups');
        if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        fs.copyFileSync(fullPath, path.join(backupDir, `${path.basename(filePath)}.${ts}.bak`));

        content = content.replace(searchText, replaceText);
        fs.writeFileSync(fullPath, content, 'utf-8');
        callbacks.onEditing(filePath);

        return `Successfully edited ${filePath}`;
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
        const messages: Array<{ role: string; content: string }> = [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: message }
        ];

        const modifiedFiles: string[] = [];
        let retryCount = 0;

        callbacks.onThinking();
        callbacks.onProgress('Analyzing task...');

        try {
            for (let step = 0; step < 10 && retryCount < MAX_RETRIES; step++) {
                callbacks.onProgress(`Step ${step + 1}...`);

                const response = await ollamaChat(messages, this.model, this.baseUrl);
                messages.push({ role: 'assistant', content: response });

                // Try to parse tool call
                const toolCall = this.parseToolCall(response);

                if (toolCall) {
                    callbacks.onProgress(`Using ${toolCall.tool}...`);

                    let result: string;

                    switch (toolCall.tool) {
                        case 'writeFile':
                            if (toolCall.args.path && toolCall.args.content) {
                                modifiedFiles.push(toolCall.args.path);
                                result = await executeWriteFile(toolCall.args.path, toolCall.args.content, callbacks);
                            } else {
                                result = 'Error: writeFile requires path and content';
                            }
                            break;

                        case 'readFile':
                            result = await executeReadFile(toolCall.args.path);
                            break;

                        case 'editFile':
                            if (toolCall.args.path && toolCall.args.search && toolCall.args.replace) {
                                modifiedFiles.push(toolCall.args.path);
                                result = await executeEditFile(toolCall.args.path, toolCall.args.search, toolCall.args.replace, callbacks);
                            } else {
                                result = 'Error: editFile requires path, search, and replace';
                            }
                            break;

                        case 'listFiles':
                            result = await executeListFiles(toolCall.args.path || '.');
                            break;

                        case 'runCommand':
                            result = await executeCommand(toolCall.args.command, callbacks);
                            break;

                        case 'complete':
                            const summary = toolCall.args.summary || 'Task completed';
                            callbacks.onSummary([summary], modifiedFiles);
                            callbacks.onResponse(`✅ ${summary}\n\nFiles modified: ${modifiedFiles.join(', ') || 'None'}`);
                            return;

                        default:
                            result = `Unknown tool: ${toolCall.tool}`;
                    }

                    // Check for errors
                    if (result.startsWith('Error:')) {
                        retryCount++;
                        messages.push({
                            role: 'user',
                            content: `${result}\n\nPlease fix this and try again. Remember: Write COMPLETE code, no placeholders.`
                        });
                    } else {
                        retryCount = 0;
                        messages.push({ role: 'user', content: `Tool result: ${result}\n\nContinue with the next step or use the "complete" tool when done.` });
                    }
                } else {
                    // No tool call found - try to extract code from response
                    const extracted = this.extractCodeFromResponse(response, message);

                    if (extracted) {
                        callbacks.onProgress('Writing extracted code...');
                        modifiedFiles.push(extracted.filename);
                        const result = await executeWriteFile(extracted.filename, extracted.code, callbacks);

                        if (!result.startsWith('Error:')) {
                            callbacks.onSummary([`Created ${extracted.filename}`], modifiedFiles);
                            callbacks.onResponse(`✅ Created ${extracted.filename}\n\n${response}`);
                            return;
                        }
                    }

                    // Check if response indicates completion
                    const lower = response.toLowerCase();
                    if (lower.includes('complete') || lower.includes('done') || lower.includes('created') || lower.includes('finished')) {
                        if (modifiedFiles.length > 0) {
                            callbacks.onSummary(['Task completed'], modifiedFiles);
                        }
                        callbacks.onResponse(response);
                        return;
                    }

                    // Prompt to use tools
                    messages.push({
                        role: 'user',
                        content: 'Please use the writeFile tool to create the file. Use this exact format:\n{"tool": "writeFile", "args": {"path": "filename.ext", "content": "YOUR COMPLETE CODE HERE"}}\n\nREMEMBER: Write the FULL, COMPLETE code. No placeholders.'
                    });
                }
            }

            // If we get here, provide whatever we have
            if (modifiedFiles.length > 0) {
                callbacks.onSummary(['Partial completion'], modifiedFiles);
                callbacks.onResponse(`Created files: ${modifiedFiles.join(', ')}`);
            } else {
                callbacks.onResponse('Could not complete the task. Please try rephrasing your request.');
            }

        } catch (e) {
            callbacks.onResponse(`Error: ${e}`);
        }
    }

    private parseToolCall(response: string): { tool: string; args: any } | null {
        // Strategy 1: Direct JSON parsing
        const jsonPatterns = [
            /\{"tool"\s*:\s*"(\w+)"\s*,\s*"args"\s*:\s*(\{[\s\S]*?\})\s*\}/,
            /\{\s*"tool"\s*:\s*"(\w+)"[\s\S]*?"args"\s*:\s*(\{[\s\S]*?\})\s*\}/
        ];

        for (const pattern of jsonPatterns) {
            const match = response.match(pattern);
            if (match) {
                try {
                    const tool = match[1];
                    // Handle nested JSON - need to find the matching closing brace
                    const argsStart = response.indexOf(match[2]);
                    const argsJson = this.extractBalancedJson(response.substring(argsStart));

                    if (argsJson) {
                        const args = JSON.parse(argsJson);
                        return { tool, args };
                    }
                } catch { }
            }
        }

        // Strategy 2: Look for tool name and extract content
        const toolMatch = response.match(/"tool"\s*:\s*"(writeFile|readFile|editFile|listFiles|runCommand|complete)"/);
        if (toolMatch) {
            const tool = toolMatch[1];

            if (tool === 'writeFile') {
                const pathMatch = response.match(/"path"\s*:\s*"([^"]+)"/);
                const contentMatch = response.match(/"content"\s*:\s*"([\s\S]*?)(?:"\s*\}|"\s*,)/);

                if (pathMatch && contentMatch) {
                    return {
                        tool: 'writeFile',
                        args: {
                            path: pathMatch[1],
                            content: contentMatch[1]
                        }
                    };
                }
            } else if (tool === 'complete') {
                const summaryMatch = response.match(/"summary"\s*:\s*"([^"]+)"/);
                return {
                    tool: 'complete',
                    args: { summary: summaryMatch?.[1] || 'Task completed' }
                };
            }
        }

        return null;
    }

    private extractBalancedJson(str: string): string | null {
        if (!str.startsWith('{')) return null;

        let depth = 0;
        let inString = false;
        let escape = false;

        for (let i = 0; i < str.length; i++) {
            const char = str[i];

            if (escape) {
                escape = false;
                continue;
            }

            if (char === '\\') {
                escape = true;
                continue;
            }

            if (char === '"' && !escape) {
                inString = !inString;
                continue;
            }

            if (!inString) {
                if (char === '{') depth++;
                if (char === '}') {
                    depth--;
                    if (depth === 0) {
                        return str.substring(0, i + 1);
                    }
                }
            }
        }

        return null;
    }

    private extractCodeFromResponse(response: string, originalRequest: string): { filename: string; code: string } | null {
        // Look for code blocks
        const codeBlockMatch = response.match(/```(\w+)?\n([\s\S]*?)```/);

        if (codeBlockMatch) {
            const lang = codeBlockMatch[1] || '';
            const code = codeBlockMatch[2].trim();

            if (code.length > 20) { // Reasonable code length
                // Determine filename from request or language
                let filename = '';

                const nameMatch = originalRequest.match(/(?:create|make|build|write)\s+(?:a\s+)?(?:simple\s+)?(\w+)/i);
                const name = nameMatch ? nameMatch[1] : 'main';

                const extMap: { [key: string]: string } = {
                    'java': '.java',
                    'python': '.py',
                    'javascript': '.js',
                    'typescript': '.ts',
                    'cpp': '.cpp',
                    'c': '.c',
                    'go': '.go',
                    'rust': '.rs',
                    'ruby': '.rb',
                    'php': '.php'
                };

                const ext = extMap[lang.toLowerCase()] || '.txt';

                // For Java, try to extract class name
                if (lang.toLowerCase() === 'java') {
                    const classMatch = code.match(/public\s+class\s+(\w+)/);
                    filename = classMatch ? `${classMatch[1]}.java` : `${name.charAt(0).toUpperCase() + name.slice(1)}.java`;
                } else {
                    filename = `${name}${ext}`;
                }

                return { filename, code };
            }
        }

        return null;
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
                { role: 'system', content: 'Complete the code. Return ONLY the completion, no explanation. Write complete, working code.' },
                { role: 'user', content: `Complete this code (max 8 lines):\n${prefix.slice(-500)}█${suffix.slice(0, 200)}` }
            ], this.model, this.baseUrl);

            return response.replace(/```[\w]*\n?/g, '').replace(/```$/g, '').trim().split('\n').slice(0, 8).join('\n');
        } catch {
            return '';
        }
    }

    async explainCode(code: string, language: string): Promise<string> {
        try {
            return await ollamaChat([
                { role: 'system', content: 'Explain code clearly and concisely. Be helpful and thorough.' },
                { role: 'user', content: `Explain this ${language} code:\n\`\`\`${language}\n${code}\n\`\`\`` }
            ], this.model, this.baseUrl);
        } catch {
            return 'Failed to explain code.';
        }
    }

    async refactorCode(code: string, language: string): Promise<string> {
        try {
            const response = await ollamaChat([
                { role: 'system', content: 'Refactor code for clarity, performance, and best practices. Return ONLY the improved code, no explanations.' },
                { role: 'user', content: `Refactor this ${language} code:\n\`\`\`${language}\n${code}\n\`\`\`` }
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
                { role: 'system', content: 'Generate comprehensive unit tests. Write complete, runnable test code.' },
                { role: 'user', content: `Generate unit tests for this ${language} code:\n\`\`\`${language}\n${code}\n\`\`\`` }
            ], this.model, this.baseUrl);
        } catch {
            return 'Failed to generate tests.';
        }
    }

    async fixBugs(code: string, language: string): Promise<{ analysis: string; fixed: string }> {
        try {
            const response = await ollamaChat([
                { role: 'system', content: 'Find and fix bugs. Format your response as:\nANALYSIS: (brief description of issues)\nFIXED:\n```\n(corrected code)\n```' },
                { role: 'user', content: `Fix bugs in this ${language} code:\n\`\`\`${language}\n${code}\n\`\`\`` }
            ], this.model, this.baseUrl);

            const parts = response.split(/FIXED:/i);
            const analysis = parts[0]?.replace(/ANALYSIS:/i, '').trim() || 'Reviewed';
            const match = parts[1]?.match(/```[\w]*\n([\s\S]*?)```/);
            return { analysis, fixed: match ? match[1].trim() : code };
        } catch {
            return { analysis: 'Error analyzing', fixed: code };
        }
    }
}
