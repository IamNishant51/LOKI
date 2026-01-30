/**
 * chatViewProvider.ts - Copilot-Level Chat Sidebar
 * 
 * Features:
 * - Typing animation (character-by-character)
 * - Code blocks with Insert/Copy buttons
 * - Slash commands (/explain, /fix, /tests, /doc, /clear, /new)
 * - VS Code theme integration
 * - Chat history persistence
 * - Smooth animations and auto-scroll
 */

import * as vscode from 'vscode';
import { LokiAgent } from './lokiAgent';
import * as ollamaClient from './ollamaClient';
import * as fs from 'fs';
import * as path from 'path';

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

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly agent: LokiAgent,
        private readonly context: vscode.ExtensionContext
    ) {
        const globalStoragePath = context.globalStorageUri.fsPath;
        if (!fs.existsSync(globalStoragePath)) {
            fs.mkdirSync(globalStoragePath, { recursive: true });
        }
        this.historyFile = path.join(globalStoragePath, 'chat-history.json');
        this.loadHistory();
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
                case 'pickImage':
                    await this.pickImage();
                    break;
                case 'getContext':
                    await this.sendEditorContext();
                    break;
            }
        });

        // Start new session if none exists
        if (!this.currentSession) {
            this.startNewSession();
        }

        // Send initial data
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
        }
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
                    this.post({ type: 'progress', step });
                }
            });
        } catch (e) {
            this.post({ type: 'typing', value: false });
            this.post({ type: 'error', message: `Error: ${e}` });
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
        // Send content in chunks for typing animation
        const chunkSize = 10;
        for (let i = 0; i < content.length; i += chunkSize) {
            const chunk = content.slice(i, i + chunkSize);
            this.post({ type: 'stream', chunk, done: i + chunkSize >= content.length });
            await new Promise(r => setTimeout(r, 15)); // 15ms per chunk
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
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>LOKI AI Chat</title>
    <style>
        :root {
            --bg: var(--vscode-editor-background);
            --fg: var(--vscode-editor-foreground);
            --border: var(--vscode-widget-border, var(--vscode-panel-border));
            --input-bg: var(--vscode-input-background);
            --input-fg: var(--vscode-input-foreground);
            --input-border: var(--vscode-input-border, transparent);
            --button-bg: var(--vscode-button-background);
            --button-fg: var(--vscode-button-foreground);
            --button-hover: var(--vscode-button-hoverBackground);
            --code-bg: var(--vscode-textCodeBlock-background, rgba(0,0,0,0.2));
            --accent: var(--vscode-focusBorder);
            --user-msg-bg: var(--vscode-button-background);
            --assistant-msg-bg: var(--vscode-editor-inactiveSelectionBackground, rgba(255,255,255,0.05));
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size, 13px);
            background: var(--bg);
            color: var(--fg);
            height: 100vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        /* Header */
        .header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 8px 12px;
            border-bottom: 1px solid var(--border);
            gap: 8px;
        }

        .header-left {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .logo {
            font-weight: 600;
            font-size: 14px;
        }

        .header-btn {
            background: transparent;
            border: none;
            color: var(--fg);
            cursor: pointer;
            padding: 4px 8px;
            border-radius: 4px;
            display: flex;
            align-items: center;
            gap: 4px;
            opacity: 0.7;
        }

        .header-btn:hover {
            opacity: 1;
            background: var(--assistant-msg-bg);
        }

        .model-select {
            background: var(--input-bg);
            color: var(--input-fg);
            border: 1px solid var(--input-border);
            border-radius: 4px;
            padding: 4px 8px;
            font-size: 12px;
            cursor: pointer;
        }

        /* History Panel */
        .history-panel {
            display: none;
            position: absolute;
            top: 45px;
            left: 8px;
            right: 8px;
            background: var(--input-bg);
            border: 1px solid var(--border);
            border-radius: 8px;
            max-height: 300px;
            overflow-y: auto;
            z-index: 100;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        }

        .history-panel.show { display: block; }

        .history-item {
            padding: 10px 12px;
            border-bottom: 1px solid var(--border);
            cursor: pointer;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .history-item:hover { background: var(--assistant-msg-bg); }

        .history-item:last-child { border-bottom: none; }

        .history-title {
            font-weight: 500;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            flex: 1;
        }

        .history-date {
            font-size: 11px;
            opacity: 0.6;
            margin-left: 8px;
        }

        .history-delete {
            opacity: 0;
            padding: 4px;
            cursor: pointer;
        }

        .history-item:hover .history-delete { opacity: 0.7; }

        /* Messages */
        .messages {
            flex: 1;
            overflow-y: auto;
            padding: 12px;
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        .message {
            max-width: 95%;
            padding: 10px 14px;
            border-radius: 12px;
            line-height: 1.5;
            animation: fadeIn 0.2s ease;
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(5px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .message.user {
            align-self: flex-end;
            background: var(--user-msg-bg);
            color: var(--button-fg);
            border-bottom-right-radius: 4px;
        }

        .message.assistant {
            align-self: flex-start;
            background: var(--assistant-msg-bg);
            border-bottom-left-radius: 4px;
        }

        .message.system {
            align-self: center;
            background: transparent;
            opacity: 0.7;
            font-size: 12px;
            padding: 4px 8px;
        }

        /* Typing Indicator */
        .typing-indicator {
            display: none;
            align-self: flex-start;
            padding: 12px 16px;
        }

        .typing-indicator.show { display: flex; }

        .typing-dots {
            display: flex;
            gap: 4px;
        }

        .typing-dot {
            width: 6px;
            height: 6px;
            background: var(--fg);
            border-radius: 50%;
            animation: bounce 1.4s infinite;
            opacity: 0.5;
        }

        .typing-dot:nth-child(2) { animation-delay: 0.2s; }
        .typing-dot:nth-child(3) { animation-delay: 0.4s; }

        @keyframes bounce {
            0%, 80%, 100% { transform: translateY(0); }
            40% { transform: translateY(-6px); }
        }

        /* Code Blocks */
        .code-block {
            position: relative;
            margin: 8px 0;
            border-radius: 8px;
            overflow: hidden;
            background: var(--code-bg);
        }

        .code-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 6px 10px;
            background: rgba(0,0,0,0.2);
            font-size: 11px;
            opacity: 0.8;
        }

        .code-actions {
            display: flex;
            gap: 4px;
        }

        .code-btn {
            background: var(--button-bg);
            color: var(--button-fg);
            border: none;
            padding: 3px 8px;
            border-radius: 4px;
            font-size: 11px;
            cursor: pointer;
            opacity: 0.8;
        }

        .code-btn:hover { opacity: 1; }

        .code-content {
            padding: 10px;
            overflow-x: auto;
            font-family: var(--vscode-editor-font-family, 'Consolas', monospace);
            font-size: 12px;
            line-height: 1.4;
            white-space: pre;
        }

        /* Slash Commands Autocomplete */
        .slash-menu {
            display: none;
            position: absolute;
            bottom: 100%;
            left: 0;
            right: 0;
            background: var(--input-bg);
            border: 1px solid var(--border);
            border-radius: 8px;
            margin-bottom: 4px;
            max-height: 200px;
            overflow-y: auto;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        }

        .slash-menu.show { display: block; }

        .slash-item {
            padding: 8px 12px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .slash-item:hover, .slash-item.selected {
            background: var(--accent);
            color: var(--button-fg);
        }

        .slash-cmd {
            font-weight: 600;
            font-family: monospace;
        }

        .slash-desc {
            opacity: 0.7;
            font-size: 12px;
        }

        /* Input Area */
        .input-area {
            padding: 12px;
            border-top: 1px solid var(--border);
            position: relative;
        }

        .input-wrapper {
            display: flex;
            gap: 8px;
            background: var(--input-bg);
            border: 1px solid var(--input-border);
            border-radius: 8px;
            padding: 8px 12px;
            align-items: flex-end;
        }

        .input-wrapper:focus-within {
            border-color: var(--accent);
        }

        #chatInput {
            flex: 1;
            background: transparent;
            border: none;
            color: var(--input-fg);
            font-family: inherit;
            font-size: 13px;
            resize: none;
            min-height: 24px;
            max-height: 120px;
            line-height: 1.5;
            outline: none;
        }

        .send-btn {
            background: var(--button-bg);
            color: var(--button-fg);
            border: none;
            width: 32px;
            height: 32px;
            border-radius: 6px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .send-btn:hover { background: var(--button-hover); }

        .send-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .context-btn {
            background: transparent;
            border: none;
            color: var(--fg);
            cursor: pointer;
            padding: 6px;
            opacity: 0.6;
        }

        .context-btn:hover { opacity: 1; }

        /* Progress */
        .progress {
            font-size: 11px;
            opacity: 0.7;
            padding: 4px 0;
        }

        /* Toast */
        .toast {
            position: fixed;
            bottom: 80px;
            left: 50%;
            transform: translateX(-50%);
            background: var(--button-bg);
            color: var(--button-fg);
            padding: 8px 16px;
            border-radius: 4px;
            font-size: 12px;
            animation: fadeInOut 2s ease;
        }

        @keyframes fadeInOut {
            0% { opacity: 0; }
            20% { opacity: 1; }
            80% { opacity: 1; }
            100% { opacity: 0; }
        }

        /* Scrollbar */
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { 
            background: var(--border); 
            border-radius: 3px;
        }
        ::-webkit-scrollbar-thumb:hover { background: var(--fg); opacity: 0.3; }
    </style>
</head>
<body>
    <div class="header">
        <div class="header-left">
            <span class="logo">LOKI</span>
            <button class="header-btn" id="newChatBtn" title="New Chat">+</button>
            <button class="header-btn" id="historyBtn" title="History">☰</button>
        </div>
        <select class="model-select" id="modelSelect">
            <option value="codellama">codellama</option>
            <option value="mistral:7b">mistral:7b</option>
            <option value="llama3">llama3</option>
            <option value="qwen2.5-coder">qwen2.5-coder</option>
            <option value="deepseek-coder">deepseek-coder</option>
        </select>
    </div>

    <div class="history-panel" id="historyPanel"></div>

    <div class="messages" id="messages">
        <div class="message system">Ask me anything! Use /commands for quick actions.</div>
    </div>

    <div class="typing-indicator" id="typingIndicator">
        <div class="typing-dots">
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
        </div>
    </div>

    <div class="input-area">
        <div class="slash-menu" id="slashMenu"></div>
        <div class="input-wrapper">
            <button class="context-btn" id="contextBtn" title="Add context">+</button>
            <textarea id="chatInput" placeholder="Ask LOKI anything... (/ for commands)" rows="1"></textarea>
            <button class="send-btn" id="sendBtn" title="Send">➤</button>
        </div>
        <div class="progress" id="progress"></div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        
        const messagesEl = document.getElementById('messages');
        const inputEl = document.getElementById('chatInput');
        const sendBtn = document.getElementById('sendBtn');
        const typingEl = document.getElementById('typingIndicator');
        const progressEl = document.getElementById('progress');
        const slashMenuEl = document.getElementById('slashMenu');
        const historyPanel = document.getElementById('historyPanel');
        const historyBtn = document.getElementById('historyBtn');
        const newChatBtn = document.getElementById('newChatBtn');
        const contextBtn = document.getElementById('contextBtn');
        const modelSelect = document.getElementById('modelSelect');

        let slashCommands = {};
        let currentResponse = '';
        let slashMenuIndex = 0;

        // Auto-resize textarea
        inputEl.addEventListener('input', () => {
            inputEl.style.height = 'auto';
            inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
            
            // Show slash menu
            if (inputEl.value.startsWith('/')) {
                showSlashMenu(inputEl.value);
            } else {
                hideSlashMenu();
            }
        });

        // Send message
        function sendMessage() {
            const text = inputEl.value.trim();
            if (!text) return;
            
            vscode.postMessage({ type: 'chat', text });
            inputEl.value = '';
            inputEl.style.height = 'auto';
            hideSlashMenu();
        }

        sendBtn.addEventListener('click', sendMessage);
        
        inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                
                // If slash menu is open, select current item
                if (slashMenuEl.classList.contains('show')) {
                    const items = slashMenuEl.querySelectorAll('.slash-item');
                    if (items[slashMenuIndex]) {
                        inputEl.value = items[slashMenuIndex].dataset.cmd + ' ';
                        hideSlashMenu();
                        return;
                    }
                }
                
                sendMessage();
            }
            
            // Navigate slash menu
            if (slashMenuEl.classList.contains('show')) {
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    navigateSlashMenu(1);
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    navigateSlashMenu(-1);
                } else if (e.key === 'Escape') {
                    hideSlashMenu();
                } else if (e.key === 'Tab') {
                    e.preventDefault();
                    const items = slashMenuEl.querySelectorAll('.slash-item');
                    if (items[slashMenuIndex]) {
                        inputEl.value = items[slashMenuIndex].dataset.cmd + ' ';
                        hideSlashMenu();
                    }
                }
            }
        });

        // Slash menu functions
        function showSlashMenu(text) {
            const query = text.slice(1).toLowerCase();
            const matches = Object.entries(slashCommands).filter(([cmd]) => 
                cmd.slice(1).toLowerCase().startsWith(query)
            );
            
            if (matches.length === 0) {
                hideSlashMenu();
                return;
            }
            
            slashMenuEl.innerHTML = matches.map(([cmd, info], i) => 
                \`<div class="slash-item \${i === 0 ? 'selected' : ''}" data-cmd="\${cmd}">
                    <span class="slash-cmd">\${cmd}</span>
                    <span class="slash-desc">\${info.description}</span>
                </div>\`
            ).join('');
            
            slashMenuEl.classList.add('show');
            slashMenuIndex = 0;
            
            // Add click handlers
            slashMenuEl.querySelectorAll('.slash-item').forEach((item, i) => {
                item.addEventListener('click', () => {
                    inputEl.value = item.dataset.cmd + ' ';
                    hideSlashMenu();
                    inputEl.focus();
                });
                item.addEventListener('mouseenter', () => {
                    slashMenuIndex = i;
                    updateSlashMenuSelection();
                });
            });
        }

        function hideSlashMenu() {
            slashMenuEl.classList.remove('show');
        }

        function navigateSlashMenu(dir) {
            const items = slashMenuEl.querySelectorAll('.slash-item');
            slashMenuIndex = Math.max(0, Math.min(items.length - 1, slashMenuIndex + dir));
            updateSlashMenuSelection();
        }

        function updateSlashMenuSelection() {
            slashMenuEl.querySelectorAll('.slash-item').forEach((item, i) => {
                item.classList.toggle('selected', i === slashMenuIndex);
            });
        }

        // History
        historyBtn.addEventListener('click', () => {
            historyPanel.classList.toggle('show');
            if (historyPanel.classList.contains('show')) {
                vscode.postMessage({ type: 'getHistory' });
            }
        });

        newChatBtn.addEventListener('click', () => {
            vscode.postMessage({ type: 'newChat' });
        });

        // Context button
        contextBtn.addEventListener('click', () => {
            vscode.postMessage({ type: 'getContext' });
        });

        // Model change
        modelSelect.addEventListener('change', () => {
            vscode.postMessage({ type: 'changeModel', model: modelSelect.value });
        });

        // Add message to UI
        function addMessage(role, content) {
            const div = document.createElement('div');
            div.className = \`message \${role}\`;
            div.innerHTML = formatContent(content);
            messagesEl.appendChild(div);
            scrollToBottom();
            
            // Add code block handlers
            div.querySelectorAll('.code-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const code = btn.closest('.code-block').querySelector('.code-content').textContent;
                    if (btn.classList.contains('insert-btn')) {
                        vscode.postMessage({ type: 'insertCode', code });
                    } else if (btn.classList.contains('copy-btn')) {
                        vscode.postMessage({ type: 'copyCode', code });
                    }
                });
            });
        }

        // Format content with code blocks
        function formatContent(content) {
            // Replace code blocks with styled versions
            return content.replace(/\`\`\`(\\w*)\\n([\\s\\S]*?)\`\`\`/g, (_, lang, code) => {
                return \`<div class="code-block">
                    <div class="code-header">
                        <span>\${lang || 'code'}</span>
                        <div class="code-actions">
                            <button class="code-btn copy-btn">Copy</button>
                            <button class="code-btn insert-btn">Insert</button>
                        </div>
                    </div>
                    <pre class="code-content">\${escapeHtml(code)}</pre>
                </div>\`;
            }).replace(/\`([^\`]+)\`/g, '<code>$1</code>').replace(/\\n/g, '<br>');
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        function scrollToBottom() {
            messagesEl.scrollTop = messagesEl.scrollHeight;
        }

        // Handle streaming response
        let streamBuffer = '';
        let streamDiv = null;

        function startStream() {
            streamBuffer = '';
            streamDiv = document.createElement('div');
            streamDiv.className = 'message assistant';
            messagesEl.appendChild(streamDiv);
        }

        function appendStream(chunk) {
            if (!streamDiv) startStream();
            streamBuffer += chunk;
            streamDiv.innerHTML = formatContent(streamBuffer);
            scrollToBottom();
            
            // Add code block handlers
            streamDiv.querySelectorAll('.code-btn').forEach(btn => {
                if (!btn.hasHandler) {
                    btn.hasHandler = true;
                    btn.addEventListener('click', () => {
                        const code = btn.closest('.code-block').querySelector('.code-content').textContent;
                        if (btn.classList.contains('insert-btn')) {
                            vscode.postMessage({ type: 'insertCode', code });
                        } else if (btn.classList.contains('copy-btn')) {
                            vscode.postMessage({ type: 'copyCode', code });
                        }
                    });
                }
            });
        }

        function endStream() {
            streamDiv = null;
            streamBuffer = '';
        }

        // Show toast notification
        function showToast(message) {
            const toast = document.createElement('div');
            toast.className = 'toast';
            toast.textContent = message;
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 2000);
        }

        // Handle messages from extension
        window.addEventListener('message', (event) => {
            const msg = event.data;
            
            switch (msg.type) {
                case 'message':
                    addMessage(msg.role, msg.content);
                    break;
                    
                case 'stream':
                    appendStream(msg.chunk);
                    if (msg.done) endStream();
                    break;
                    
                case 'typing':
                    typingEl.classList.toggle('show', msg.value);
                    if (msg.value) scrollToBottom();
                    break;
                    
                case 'progress':
                    progressEl.textContent = msg.step;
                    break;
                    
                case 'done':
                    progressEl.textContent = '';
                    endStream();
                    break;
                    
                case 'error':
                    addMessage('system', '❌ ' + msg.message);
                    break;
                    
                case 'system':
                    addMessage('system', msg.content);
                    break;
                    
                case 'toast':
                    showToast(msg.message);
                    break;
                    
                case 'cleared':
                    messagesEl.innerHTML = '<div class="message system">New chat started. Ask me anything!</div>';
                    break;
                    
                case 'slashCommands':
                    slashCommands = msg.commands;
                    break;
                    
                case 'history':
                    renderHistory(msg.sessions);
                    break;
                    
                case 'sessionLoaded':
                    messagesEl.innerHTML = '';
                    msg.messages.forEach(m => addMessage(m.role, m.content));
                    historyPanel.classList.remove('show');
                    break;
                    
                case 'editorContext':
                    if (msg.selectedText) {
                        inputEl.value += \`\n\nSelected code from \${msg.fileName}:\n\\\`\\\`\\\`\${msg.language}\n\${msg.selectedText}\n\\\`\\\`\\\`\`;
                        inputEl.style.height = 'auto';
                        inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
                    } else {
                        showToast('No text selected in editor');
                    }
                    break;
            }
        });

        function renderHistory(sessions) {
            historyPanel.innerHTML = sessions.map(s => \`
                <div class="history-item" data-id="\${s.id}">
                    <span class="history-title">\${s.title}</span>
                    <span class="history-date">\${s.date}</span>
                    <span class="history-delete" data-id="\${s.id}">✕</span>
                </div>
            \`).join('') || '<div class="history-item">No history yet</div>';
            
            historyPanel.querySelectorAll('.history-item').forEach(item => {
                item.addEventListener('click', (e) => {
                    if (e.target.classList.contains('history-delete')) {
                        vscode.postMessage({ type: 'deleteSession', id: e.target.dataset.id });
                    } else if (item.dataset.id) {
                        vscode.postMessage({ type: 'loadSession', id: item.dataset.id });
                    }
                });
            });
        }

        // Request initial data
        vscode.postMessage({ type: 'getSlashCommands' });

        // Focus input on load
        inputEl.focus();
    </script>
</body>
</html>`;
    }
}
