/**
 * chatViewProvider.ts - Copilot-Level Chat Sidebar
 * 
 * Features:
 * - Typing animation
 * - Code blocks with Insert/Copy
 * - Slash commands
 * - Base64 Script Injection for robustness
 */

import * as vscode from 'vscode';
import { EnhancedLokiAgent } from './enhancedAgent';
import * as ollamaClient from './ollamaClient';
import * as fs from 'fs';
import * as path from 'path';
import { StatusBarManager } from './statusBarManager';

interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
    codeBlocks?: { language: string; code: string }[];
}

interface ChatSession {
    id: string;
    title: string;
    messages: ChatMessage[];
    createdAt: number;
    updatedAt: number;
}

// Slash command definitions
const SLASH_COMMANDS: { [key: string]: { description: string; prompt: string } } = {
    '/explain': {
        description: 'Explain the selected code',
        prompt: 'Explain this code in detail. What does it do, how does it work, and what are the key concepts?'
    },
    '/fix': {
        description: 'Fix errors in the code',
        prompt: 'Find and fix any bugs, errors, or issues in this code. Explain what was wrong and provide the corrected code.'
    },
    '/tests': {
        description: 'Generate unit tests',
        prompt: 'Generate comprehensive unit tests for this code. Include edge cases and use a popular testing framework.'
    },
    '/doc': {
        description: 'Add documentation',
        prompt: 'Add detailed documentation comments to this code. Include JSDoc/docstrings with parameter descriptions and examples.'
    },
    '/refactor': {
        description: 'Refactor for better quality',
        prompt: 'Refactor this code to improve readability, performance, and maintainability. Follow best practices.'
    },
    '/optimize': {
        description: 'Optimize performance',
        prompt: 'Optimize this code for better performance. Identify bottlenecks and improve efficiency.'
    },
    '/clear': {
        description: 'Start a new chat',
        prompt: ''
    },
    '/new': {
        description: 'Create a new file',
        prompt: 'Create a new file with the following requirements:'
    }
};

export class LokiChatViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'loki.chatView';
    private _view?: vscode.WebviewView;
    private currentSession: ChatSession | null = null;
    private sessions: ChatSession[] = [];
    private historyFile: string;
    private modifiedFiles: Set<string> = new Set();
    private abortController: AbortController | null = null;
    private agent: EnhancedLokiAgent;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly context: vscode.ExtensionContext,
        private readonly statusBar: StatusBarManager
    ) {
        this.agent = new EnhancedLokiAgent();
        const globalStoragePath = context.globalStorageUri.fsPath;
        if (!fs.existsSync(globalStoragePath)) {
            fs.mkdirSync(globalStoragePath, { recursive: true });
        }
        this.historyFile = path.join(globalStoragePath, 'chat-history.json');
        this.loadHistory();

        this.context.subscriptions.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('loki.model')) {
                    this.sendModelOptions();
                }
            })
        );
    }

    getModifiedFiles(): Set<string> {
        return this.modifiedFiles;
    }

    resolveWebviewView(webviewView: vscode.WebviewView) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this.getHtmlContent();

        webviewView.webview.onDidReceiveMessage(async (msg) => {
            switch (msg.type) {
                case 'chat':
                    await this.handleChatMessage(msg.text);
                    break;
                case 'insertCode':
                    await this.insertCodeAtCursor(msg.code);
                    break;
                case 'copyCode':
                    await vscode.env.clipboard.writeText(msg.code);
                    this.post({ type: 'toast', message: 'Copied to clipboard!' });
                    break;
                case 'newChat':
                    this.startNewSession();
                    break;
                case 'loadSession':
                    this.loadSession(msg.id);
                    break;
                case 'deleteSession':
                    this.deleteSession(msg.id);
                    break;
                case 'getHistory':
                    this.sendHistory();
                    break;
                case 'getSlashCommands':
                    this.post({ type: 'slashCommands', commands: SLASH_COMMANDS });
                    break;
                case 'changeModel':
                    await this.changeModel(msg.model);
                    break;
                case 'pickImage':
                    await this.pickImage();
                    break;
                case 'getContext':
                    await this.sendEditorContext();
                    break;
                case 'addCurrentFile':
                    await this.addCurrentFileContext();
                    break;
                case 'addSelection':
                    await this.addSelectionContext();
                    break;
                case 'addProblems':
                    await this.addProblemsContext();
                    break;
                case 'addFile':
                    await this.addFileContext();
                    break;
                case 'stop':
                    this.abortController?.abort();
                    break;
            }
        });

        // Start new session if none exists
        if (!this.currentSession) {
            this.startNewSession();
        }

        // Send initial data
        this.sendModelOptions();
        this.sendHistory();
        this.post({ type: 'slashCommands', commands: SLASH_COMMANDS });
    }

    private async insertCodeAtCursor(code: string) {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor to insert code');
            return;
        }

        await editor.edit(editBuilder => {
            editBuilder.insert(editor.selection.active, code);
        });

        this.post({ type: 'toast', message: 'Code inserted!' });
    }

    private async sendEditorContext() {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const selection = editor.selection;
            const selectedText = editor.document.getText(selection);
            const fileName = path.basename(editor.document.fileName);
            const language = editor.document.languageId;

            this.post({
                type: 'editorContext',
                fileName,
                language,
                selectedText: selectedText || null,
                hasSelection: !selection.isEmpty
            });
        } else {
            this.post({ type: 'toast', message: 'No active editor' });
        }
    }

    private async addCurrentFileContext() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            this.post({ type: 'toast', message: 'No active editor' });
            return;
        }

        const content = editor.document.getText();
        const fileName = path.basename(editor.document.fileName);
        const language = editor.document.languageId;
        const relativePath = vscode.workspace.asRelativePath(editor.document.uri);

        // Truncate if too long
        const lines = content.split('\n');
        const maxLines = 100;
        const truncatedContent = lines.length > maxLines
            ? lines.slice(0, maxLines).join('\n') + `\n... (${lines.length - maxLines} more lines)`
            : content;

        this.post({
            type: 'contextAdded',
            contextType: 'file',
            label: `📄 ${fileName}`,
            content: `File: ${relativePath}\n\`\`\`${language}\n${truncatedContent}\n\`\`\``
        });
    }

    private async addSelectionContext() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            this.post({ type: 'toast', message: 'No active editor' });
            return;
        }

        const selection = editor.selection;
        if (selection.isEmpty) {
            this.post({ type: 'toast', message: 'No text selected' });
            return;
        }

        const selectedText = editor.document.getText(selection);
        const fileName = path.basename(editor.document.fileName);
        const language = editor.document.languageId;
        const startLine = selection.start.line + 1;
        const endLine = selection.end.line + 1;

        this.post({
            type: 'contextAdded',
            contextType: 'selection',
            label: `✂️ ${fileName}:${startLine}-${endLine}`,
            content: `Selection from ${fileName}:${startLine}-${endLine}\n\`\`\`${language}\n${selectedText}\n\`\`\``
        });
    }

    private async addProblemsContext() {
        const diagnostics = vscode.languages.getDiagnostics();
        const problems: string[] = [];
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';

        for (const [uri, diags] of diagnostics) {
            const filtered = diags.filter(d =>
                d.severity === vscode.DiagnosticSeverity.Error ||
                d.severity === vscode.DiagnosticSeverity.Warning
            );
            if (filtered.length === 0) continue;

            const relativePath = path.relative(root, uri.fsPath);
            if (relativePath.includes('node_modules')) continue;

            for (const diag of filtered.slice(0, 5)) {
                const severity = diag.severity === vscode.DiagnosticSeverity.Error ? '❌' : '⚠️';
                problems.push(`${severity} ${relativePath}:${diag.range.start.line + 1} - ${diag.message}`);
            }
        }

        if (problems.length === 0) {
            this.post({ type: 'toast', message: 'No problems found!' });
            return;
        }

        this.post({
            type: 'contextAdded',
            contextType: 'problems',
            label: `🔍 ${problems.length} Problems`,
            content: `Current Problems:\n${problems.join('\n')}`
        });
    }

    private async addFileContext() {
        const files = await vscode.window.showOpenDialog({
            canSelectMany: false,
            openLabel: 'Add to Context',
            filters: {
                'Code Files': ['ts', 'tsx', 'js', 'jsx', 'py', 'java', 'cpp', 'c', 'go', 'rs', 'rb', 'php'],
                'All Files': ['*']
            }
        });

        if (!files || files.length === 0) return;

        const file = files[0];
        const content = (await vscode.workspace.fs.readFile(file)).toString();
        const fileName = path.basename(file.fsPath);
        const relativePath = vscode.workspace.asRelativePath(file);
        const ext = path.extname(file.fsPath).slice(1);

        // Truncate if too long
        const lines = content.split('\n');
        const maxLines = 100;
        const truncatedContent = lines.length > maxLines
            ? lines.slice(0, maxLines).join('\n') + `\n... (${lines.length - maxLines} more lines)`
            : content;

        this.post({
            type: 'contextAdded',
            contextType: 'file',
            label: `📄 ${fileName}`,
            content: `File: ${relativePath}\n\`\`\`${ext}\n${truncatedContent}\n\`\`\``
        });
    }

    private post(message: any) {
        this._view?.webview.postMessage(message);
    }

    private startNewSession() {
        this.currentSession = {
            id: Date.now().toString(),
            title: 'New Chat',
            messages: [],
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        this.sessions.unshift(this.currentSession);
        this.saveHistory();
        this.post({ type: 'sessionStarted', id: this.currentSession.id });
        this.sendHistory();
    }

    private loadSession(id: string) {
        const session = this.sessions.find(s => s.id === id);
        if (session) {
            this.currentSession = session;
            this.post({ type: 'sessionLoaded', messages: session.messages });
        }
    }

    private deleteSession(id: string) {
        this.sessions = this.sessions.filter(s => s.id !== id);
        if (this.currentSession?.id === id) {
            this.startNewSession();
        }
        this.saveHistory();
        this.sendHistory();
    }

    private sendHistory() {
        const history = this.sessions.map(s => ({
            id: s.id,
            title: s.title,
            preview: s.messages[0]?.content.slice(0, 50) || 'Empty chat',
            date: new Date(s.updatedAt).toLocaleDateString()
        }));
        this.post({ type: 'history', sessions: history });
    }

    private saveHistory() {
        try {
            fs.writeFileSync(this.historyFile, JSON.stringify(this.sessions.slice(0, 50), null, 2));
        } catch (e) {
            console.error('Failed to save history:', e);
        }
    }

    private loadHistory() {
        try {
            if (fs.existsSync(this.historyFile)) {
                this.sessions = JSON.parse(fs.readFileSync(this.historyFile, 'utf-8'));
            }
        } catch (e) {
            console.error('Failed to load history:', e);
            this.sessions = [];
        }
    }

    private async changeModel(model: string) {
        if (!model) return;

        await vscode.workspace.getConfiguration('loki').update(
            'model',
            model,
            vscode.ConfigurationTarget.Global
        );

        this.statusBar.setModel(model);
        this.agent.reloadModel();
        this.post({ type: 'toast', message: `Model set to ${model}` });
    }

    private async sendModelOptions() {
        const config = vscode.workspace.getConfiguration('loki');
        const currentModel = config.get<string>('model') || 'codellama';

        try {
            const models = await ollamaClient.listModels();
            const list = models.length > 0 ? models : this.getDefaultModels();
            this.post({ type: 'models', models: list, current: currentModel });
        } catch {
            this.post({ type: 'models', models: this.getDefaultModels(), current: currentModel });
        }
    }

    private getDefaultModels(): string[] {
        return [
            'codellama',
            'codellama:13b',
            'mistral:7b',
            'llama3',
            'qwen2.5-coder',
            'deepseek-coder'
        ];
    }

    private addMessageToSession(role: 'user' | 'assistant', content: string) {
        if (!this.currentSession) return;

        const codeBlocks = this.extractCodeBlocks(content);
        this.currentSession.messages.push({
            role,
            content,
            timestamp: Date.now(),
            codeBlocks
        });

        // Update title from first user message
        if (role === 'user' && this.currentSession.messages.length === 1) {
            this.currentSession.title = content.slice(0, 40) + (content.length > 40 ? '...' : '');
        }

        this.currentSession.updatedAt = Date.now();
        this.saveHistory();
    }

    private extractCodeBlocks(content: string): { language: string; code: string }[] {
        const blocks: { language: string; code: string }[] = [];
        const regex = /```(\w*)\n([\s\S]*?)```/g;
        let match;

        while ((match = regex.exec(content)) !== null) {
            blocks.push({
                language: match[1] || 'plaintext',
                code: match[2].trim()
            });
        }

        return blocks;
    }

    private async handleChatMessage(text: string) {
        if (!text.trim()) return;
        if (!this._view) return;

        // Handle slash commands
        if (text.startsWith('/')) {
            const handled = await this.handleSlashCommand(text);
            if (handled) return;
        }

        // Add context if selected text exists
        const editor = vscode.window.activeTextEditor;
        let contextText = text;

        if (editor && !editor.selection.isEmpty) {
            const selectedCode = editor.document.getText(editor.selection);
            const language = editor.document.languageId;
            contextText = `${text}\n\nHere is the code:\n\`\`\`${language}\n${selectedCode}\n\`\`\``;
        }

        // Add user message
        this.addMessageToSession('user', text);
        this.post({ type: 'message', role: 'user', content: text });

        // Show typing indicator
        this.post({ type: 'typing', value: true });

        this.abortController = new AbortController();

        try {
            // Process with agent
            await this.agent.processMessage(contextText, {
                onThinking: () => {
                    this.post({ type: 'typing', value: true });
                },
                onResponse: async (response: string) => {
                    this.addMessageToSession('assistant', response);
                    this.post({ type: 'typing', value: false });
                    // Stream the response character by character
                    await this.streamResponse(response);
                },
                onEditing: (file: string) => {
                    this.modifiedFiles.add(file);
                    this.post({ type: 'system', content: `📝 Editing ${file}...` });
                    // Trigger file decoration update
                    vscode.commands.executeCommand('loki.refreshDecorations');
                },
                onSummary: (summary: string[], files: string[]) => {
                    files.forEach(f => this.modifiedFiles.add(f));
                    const summaryText = summary.join('\n');
                    this.addMessageToSession('assistant', summaryText);
                    this.post({ type: 'summary', summary, files });
                    this.post({ type: 'done' });
                },
                onAsk: (question: string) => {
                    this.post({ type: 'typing', value: false });
                    this.post({ type: 'message', role: 'assistant', content: question });
                },
                onProgress: (step: string) => {
                    this.post({ type: 'status', text: step });
                }
            }, this.abortController.signal);
        } catch (e: any) {
            this.post({ type: 'typing', value: false });
            if (e.message === 'Aborted by user' || e.message === 'Aborted') {
                this.post({ type: 'system', content: '⏹️ Response stopped' });
            } else {
                this.post({ type: 'error', message: `${e.message || e}` });
            }
        } finally {
            this.abortController = null;
            this.post({ type: 'done' });
        }
    }

    private async handleSlashCommand(text: string): Promise<boolean> {
        const parts = text.split(' ');
        const command = parts[0].toLowerCase();
        const args = parts.slice(1).join(' ');

        if (command === '/clear') {
            this.startNewSession();
            this.post({ type: 'cleared' });
            return true;
        }

        if (command === '/new' && args) {
            await this.handleChatMessage(`Create a new file: ${args}`);
            return true;
        }

        const cmd = SLASH_COMMANDS[command];
        if (cmd) {
            const editor = vscode.window.activeTextEditor;
            let prompt = cmd.prompt;

            if (editor && !editor.selection.isEmpty) {
                const selectedCode = editor.document.getText(editor.selection);
                const language = editor.document.languageId;
                prompt = `${cmd.prompt}\n\n\`\`\`${language}\n${selectedCode}\n\`\`\``;
            } else if (args) {
                prompt = `${cmd.prompt} ${args}`;
            }

            await this.handleChatMessage(prompt);
            return true;
        }

        return false;
    }

    private async streamResponse(content: string) {
        const chunkSize = 10;
        for (let i = 0; i < content.length; i += chunkSize) {
            const chunk = content.slice(i, i + chunkSize);
            this.post({ type: 'stream', chunk, done: i + chunkSize >= content.length });
            await new Promise(r => setTimeout(r, 15));
        }
        this.post({ type: 'done' });
    }

    private async pickImage() {
        const options: vscode.OpenDialogOptions = {
            canSelectMany: false,
            openLabel: 'Select Image',
            filters: { 'Images': ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] }
        };

        const fileUri = await vscode.window.showOpenDialog(options);
        if (fileUri && fileUri[0]) {
            const filePath = fileUri[0].fsPath;
            const fileName = path.basename(filePath);
            this.post({ type: 'imageSelected', path: filePath, name: fileName });
        }
    }

    private getHtmlContent(): string {
        const scriptPath = vscode.Uri.joinPath(this._extensionUri, 'src', 'chatViewScript.js');
        let scriptContent = '';
        try {
            scriptContent = fs.readFileSync(scriptPath.fsPath, 'utf-8');
        } catch (e) {
            console.error('Failed to read chat script:', e);
            scriptContent = 'console.error("Failed to read chat script file");';
        }

        const base64Script = Buffer.from(scriptContent).toString('base64');

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline' 'unsafe-eval'; font-src data: https:;">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>LOKI AI Chat</title>
    <style>
        :root {
            --bg: var(--vscode-sideBar-background);
            --fg: var(--vscode-sideBar-foreground);
            --border: var(--vscode-sideBarSectionHeader-border);
            --input-bg: var(--vscode-input-background);
            --input-fg: var(--vscode-input-foreground);
            --input-border: var(--vscode-input-border);
            --focus-border: var(--vscode-focusBorder);
            --button-bg: var(--vscode-button-background);
            --button-fg: var(--vscode-button-foreground);
            --button-hover: var(--vscode-button-hoverBackground);
            --code-bg: var(--vscode-textCodeBlock-background);
            --font-family: var(--vscode-font-family, "Segoe UI", "Helvetica Neue", sans-serif);
            --skeleton-bg: var(--vscode-editor-lineHighlightBackground);
            --skeleton-shimmer: var(--vscode-editor-selectionBackground);
            /* Dropdown specific */
            --dropdown-bg: #252526; 
            --dropdown-fg: #cccccc;
            --dropdown-border: #3c3c3c;
        }

        * { box-sizing: border-box; margin: 0; padding: 0; }
        
        body { 
            font-family: var(--font-family); 
            background: var(--bg); 
            color: var(--fg); 
            height: 100vh; 
            display: flex; 
            flex-direction: column; 
            overflow: hidden;
            font-size: 13px;
        }

        /* Header */
        .header { 
            display: flex; 
            align-items: center; 
            justify-content: space-between; 
            padding: 10px 16px; 
            border-bottom: 1px solid var(--border);
            background: var(--bg);
            flex-shrink: 0;
            z-index: 10;
        }
        .header-title { 
            font-weight: 600; 
            font-size: 12px; 
            display: flex;
            align-items: center;
            gap: 8px;
            color: var(--fg);
        }
        .header-actions { display: flex; align-items: center; gap: 6px; }
        
        .icon-btn { 
            background: transparent; 
            border: none; 
            color: var(--fg); 
            opacity: 0.7; 
            cursor: pointer; 
            padding: 4px; 
            border-radius: 4px; 
            display: flex; 
            align-items: center; 
            justify-content: center;
            transition: all 0.2s ease;
        }
        .icon-btn:hover { opacity: 1; background: var(--vscode-toolbar-hoverBackground); }
        
        /* Styled Dropdown */
        .model-select-wrapper {
            position: relative;
            display: flex;
            align-items: center;
            margin-right: 4px;
        }
        .model-select {
            background: var(--dropdown-bg);
            color: var(--dropdown-fg);
            border: 1px solid var(--dropdown-border);
            padding: 3px 8px;
            padding-right: 20px;
            border-radius: 4px;
            font-size: 11px;
            outline: none;
            cursor: pointer;
            appearance: none;
            -webkit-appearance: none;
            font-family: inherit;
            height: 24px;
            min-width: 100px;
        }
        .model-select:focus { border-color: var(--focus-border); }
        .model-select-wrapper::after {
            content: '';
            position: absolute;
            right: 8px;
            top: 50%;
            transform: translateY(-20%);
            border-left: 4px solid transparent;
            border-right: 4px solid transparent;
            border-top: 4px solid var(--dropdown-fg);
            opacity: 0.7;
            pointer-events: none;
        }
        
        /* Messages Area */
        .messages { 
            flex: 1; 
            overflow-y: auto; 
            padding: 16px; 
            display: flex; 
            flex-direction: column; 
            gap: 16px; 
            scroll-behavior: smooth;
        }
        
        .welcome-message {
            text-align: center;
            padding: 40px 20px;
            color: var(--fg);
            opacity: 0.8;
            display: flex;
            flex-direction: column;
            gap: 16px;
            align-items: center;
            justify-content: center;
            height: 100%;
        }
        .welcome-logo { color: var(--button-bg); }

        /* Message */
        .message { 
            display: flex; 
            flex-direction: column; 
            gap: 6px; 
            max-width: 100%;
            animation: fadeIn 0.3s ease;
        }
        
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(8px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .message-header {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 11px;
            font-weight: 600;
            margin-bottom: 2px;
            opacity: 0.9;
        }
        
        .avatar {
            width: 20px;
            height: 20px;
            border-radius: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
        }
        .avatar.assistant { color: var(--button-bg); }
        .avatar.user { color: var(--fg); opacity: 0.8; }
        
        .message-content {
            font-size: 13px;
            line-height: 1.6;
            overflow-wrap: break-word;
        }
        .message-content p { margin-bottom: 8px; }
        .message-content p:last-child { margin-bottom: 0; }
        
        /* User Message Bubble */
        .message.user { align-items: flex-end; }
        .message.user .message-header { flex-direction: row-reverse; }
        .message.user .message-content {
            background: var(--vscode-chat-requestBackground, rgba(128,128,128,0.1));
            padding: 8px 12px;
            border-radius: 12px;
            border-top-right-radius: 2px;
            max-width: 90%;
        }

        /* Assistant Message */
        .message.assistant { align-items: flex-start; }
        .message.assistant .message-content {
            width: 100%;
            padding: 0 4px;
        }
        
        /* Code Blocks */
        pre {
            background: var(--code-bg);
            border: 1px solid var(--border);
            border-radius: 6px;
            margin: 10px 0;
            overflow: hidden;
        }
        .code-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 6px 12px;
            background: rgba(0,0,0,0.2);
            font-size: 11px;
            color: var(--fg);
        }
        .code-actions { display: flex; gap: 8px; }
        .code-btn {
            background: transparent;
            border: none;
            color: inherit;
            cursor: pointer;
            font-size: 10px;
            display: flex;
            align-items: center;
            gap: 4px;
            padding: 2px 4px;
            border-radius: 3px;
            opacity: 0.7;
        }
        .code-btn:hover { opacity: 1; background: rgba(255,255,255,0.1); }
        code {
            display: block;
            padding: 12px;
            overflow-x: auto;
            font-family: var(--vscode-editor-font-family, 'Consolas', monospace);
            font-size: var(--vscode-editor-font-size, 12px);
        }

        /* Input Area */
        .input-container {
            padding: 16px;
            background: var(--bg);
            border-top: 1px solid var(--border);
            z-index: 20;
        }
        
        .input-wrapper {
            background: var(--input-bg);
            border: 1px solid var(--input-border);
            border-radius: 8px;
            padding: 10px 12px;
            display: flex;
            flex-direction: column;
            gap: 8px;
            transition: border-color 0.2s, box-shadow 0.2s;
        }
        .input-wrapper:focus-within {
            border-color: var(--focus-border);
            box-shadow: 0 0 0 1px var(--focus-border);
        }

        .context-pills {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            margin-bottom: 4px;
        }
        .context-pill {
            background: rgba(128,128,128,0.15);
            border-radius: 4px;
            padding: 2px 8px;
            font-size: 10px;
            display: flex;
            align-items: center;
            gap: 6px;
            cursor: default;
        }
        .context-pill .remove {
            cursor: pointer;
            opacity: 0.6;
            font-weight: bold;
        }
        .context-pill .remove:hover { opacity: 1; }

        textarea {
            background: transparent;
            border: none;
            color: var(--input-fg);
            font-family: inherit;
            font-size: 13px;
            resize: none;
            width: 100%;
            outline: none;
            min-height: 24px;
            max-height: 200px;
            line-height: 1.5;
        }
        
        .input-footer {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-top: 4px;
        }
        
        .input-actions-left { display: flex; gap: 4px; }
        
        .action-btn {
            background: transparent;
            border: none;
            color: var(--fg);
            opacity: 0.5;
            width: 28px;
            height: 28px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.2s;
        }
        .action-btn:hover { opacity: 1; background: rgba(128,128,128,0.15); }
        
        .send-btn {
            background: var(--button-bg);
            color: var(--button-fg);
            border: none;
            width: 28px;
            height: 28px;
            border-radius: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: background 0.2s;
        }
        .send-btn:hover { background: var(--button-hover); }
        .send-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        /* Skeleton Loading */
        .skeleton-container {
            display: flex;
            flex-direction: column;
            gap: 8px;
            width: 100%;
            padding: 4px 0;
            animation: fadeIn 0.3s ease;
        }
        .skeleton-line {
            height: 12px;
            background: var(--skeleton-bg);
            border-radius: 4px;
            width: 100%;
            position: relative;
            overflow: hidden;
        }
        .skeleton-line::after {
            content: '';
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            background: linear-gradient(90deg, transparent, var(--skeleton-shimmer), transparent);
            transform: translateX(-100%);
            animation: shimmer 1.5s infinite;
        }
        .skeleton-line.short { width: 60%; }
        .skeleton-line.medium { width: 80%; }
        @keyframes shimmer { 100% { transform: translateX(100%); } }

        /* Icons */
        .codicon { width: 16px; height: 16px; fill: currentColor; }

        /* History Panel */
        .history-panel {
            position: absolute;
            top: 48px; left: 0; right: 0; bottom: 0;
            background: var(--bg);
            z-index: 50;
            overflow-y: auto;
            display: none;
            border-top: 1px solid var(--border);
            padding: 10px;
        }
        .history-panel.show { display: block; }
        .history-item {
            padding: 12px;
            border-radius: 6px;
            margin-bottom: 6px;
            cursor: pointer;
            transition: background 0.2s;
            border: 1px solid transparent;
        }
        .history-item:hover { background: var(--vscode-list-hoverBackground); border-color: var(--border); }
        .history-item-title { font-weight: 500; font-size: 13px; color: var(--fg); }
        .history-item-date { font-size: 11px; color: var(--vscode-descriptionForeground); }

        /* Scrollbar aesthetics */
        ::-webkit-scrollbar { width: 10px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: var(--button-bg); opacity: 0.5; border-radius: 5px; border: 3px solid var(--bg); }
        ::-webkit-scrollbar-thumb:hover { background: var(--button-hover); }

        .slash-menu {
            position: absolute; bottom: 100%; left: 16px; right: 16px;
            background: var(--input-bg);
            border: 1px solid var(--focus-border);
            border-radius: 6px;
            max-height: 200px; overflow-y: auto;
            display: none; z-index: 100; margin-bottom: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        }
        .slash-menu.show { display: block; }
        .slash-item {
            padding: 8px 12px; cursor: pointer; display: flex; align-items: center; gap: 8px;
            border-bottom: 1px solid rgba(128,128,128,0.1);
        }
        .slash-item:last-child { border-bottom: none; }
        .slash-item.selected, .slash-item:hover {
            background: var(--vscode-list-activeSelectionBackground);
            color: var(--vscode-list-activeSelectionForeground);
        }
        .slash-cmd { font-weight: bold; font-family: monospace; }
        .slash-desc { font-size: 11px; opacity: 0.8; }
    </style>

</head>
<body>
    <div class="header">
        <div class="header-title">
            <svg class="codicon" viewBox="0 0 16 16"><path d="M6 14.5L7.5 10l4.5-1.5L7.5 7 6 2.5 4.5 7 0 8.5l4.5 1.5z"/></svg>
            LOKI AI
        </div>
        <div class="header-actions">
            <!-- Dropdown -->
            <div class="model-select-wrapper">
                <select id="modelSelect" class="model-select">
                    <option value="codellama">CodeLlama</option>
                    <option value="mistral:7b">Mistral</option>
                    <option value="llama3">Llama 3</option>
                    <option value="deepseek-coder">DeepSeek</option>
                </select>
            </div>
            <!-- Standard History Icon -->
            <button class="icon-btn" id="historyBtn" title="History">
                <svg class="codicon" viewBox="0 0 16 16"><path fill-rule="evenodd" clip-rule="evenodd" d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14zm0-1A6 6 0 1 1 8 2a6 6 0 0 1 0 12zM8 4a.5.5 0 0 1 .5.5v3.293l2.854 2.853a.5.5 0 1 1-.708.708l-3-3a.5.5 0 0 1-.146-.354V4.5A.5.5 0 0 1 8 4z"/></svg>
            </button>
            <!-- Add Chat Icon -->
            <button class="icon-btn" id="newChatBtn" title="New Chat">
                <svg class="codicon" viewBox="0 0 16 16"><path d="M14 7v1H8v6H7V8H1V7h6V1h1v6h6z"/></svg>
            </button>
        </div>
    </div>

    <!-- Main Messages Area -->
    <div class="messages" id="messages">
        <div class="welcome-message">
            <div class="welcome-logo">
                <!-- Large Sparkle Icon -->
                <svg width="60" height="60" viewBox="0 0 16 16" fill="currentColor">
                     <path d="M6 14.5L7.5 10l4.5-1.5L7.5 7 6 2.5 4.5 7 0 8.5l4.5 1.5z"/>
                </svg>
            </div>
            <h2 style="font-weight:600;">How can I help you?</h2>
            <p style="font-size:12px; max-width: 80%;">I can generate code, explain complex logic, or help you refactor your project.</p>
        </div>
    </div>

    <div class="slash-menu" id="slashMenu"></div>
    <div class="history-panel" id="historyPanel"></div>

    <div class="input-container">
        <div class="input-wrapper">
            <div class="context-pills" id="contextChips"></div>
            <textarea id="chatInput" placeholder="Ask anything... ( / for commands )" rows="1"></textarea>
            <div class="input-footer">
                <div class="input-actions-left">
                    <button class="action-btn" id="contextBtn" title="Add File Context">
                        <!-- File Icon -->
                        <svg class="codicon" viewBox="0 0 16 16"><path d="M13.71 4.29l-3-3L10 1H4L3 2v12l1 1h9l1-1V5l-.29-.71zM10 5V2h3v3h-3zM4 14V2h5v4h4v8H4z"/></svg>
                    </button>
                    <button class="action-btn" id="imageBtn" title="Add Image" onclick="document.getElementById('imageInput').click()">
                        <!-- Image Icon -->
                        <svg class="codicon" viewBox="0 0 16 16"><path d="M13 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1zm0 11H3V3h10v10zM5 8a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm1 4l2.5-3 2.5 3H6z"/></svg>
                    </button>
                </div>
                <button class="send-btn" id="sendBtn">
                    <!-- Send/Arrow Icon -->
                    <svg class="codicon" viewBox="0 0 16 16"><path d="M1.5 8a.5.5 0 0 1 .5-.5h10.793l-3.147-3.146a.5.5 0 1 1 .708-.708l4 4a.5.5 0 0 1 0 .708l-4 4a.5.5 0 0 1-.708-.708L12.793 8.5H2a.5.5 0 0 1-.5-.5z"/></svg>
                </button>
            </div>
        </div>
    </div>

    <!-- Hidden file input for images -->
    <input type="file" id="imageInput" accept="image/*" style="display:none;" onchange="handleImageUpload(this)">

    <script>
        const vscode = acquireVsCodeApi();
        window.vscode = vscode; 
        
        try {
            const raw = "${base64Script}";
            const decoded = atob(raw);
            eval(decoded);
        } catch (e) {
            console.error('Loader Error:', e);
            document.body.innerHTML += '<div style="color:red;padding:20px;border:2px solid red;">Script Load Error: ' + e.message + '</div>';
        }
    </script>
</body>
</html>`;
    }
}