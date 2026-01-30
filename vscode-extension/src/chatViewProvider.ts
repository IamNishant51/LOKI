/**
 * chatViewProvider.ts - LOKI Chat Sidebar (Copilot-Killer Edition)
 * 
 * Features:
 * - Chat history with persistence
 * - Professional UI/UX
 * - Better markdown rendering
 * - Smooth animations
 * - Context menu for history
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
}

interface ChatSession {
    id: string;
    title: string;
    messages: ChatMessage[];
    createdAt: number;
    updatedAt: number;
}

export class LokiChatViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'loki.chatView';
    private _view?: vscode.WebviewView;
    private currentSession: ChatSession | null = null;
    private sessions: ChatSession[] = [];
    private historyFile: string;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly agent: LokiAgent,
        private readonly context: vscode.ExtensionContext
    ) {
        // Use global storage for history (persists across workspaces)
        const globalStoragePath = context.globalStorageUri.fsPath;
        if (!fs.existsSync(globalStoragePath)) {
            fs.mkdirSync(globalStoragePath, { recursive: true });
        }
        this.historyFile = path.join(globalStoragePath, 'chat-history.json');
        this.loadHistory();
    }

    resolveWebviewView(webviewView: vscode.WebviewView) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this.getHtml();

        webviewView.webview.onDidReceiveMessage(async (msg) => {
            switch (msg.type) {
                case 'send':
                    await this.handleUserMessage(msg.text);
                    break;
                case 'newChat':
                    this.createNewSession();
                    break;
                case 'loadSession':
                    this.loadSession(msg.sessionId);
                    break;
                case 'deleteSession':
                    this.deleteSession(msg.sessionId);
                    break;
                case 'refreshModels':
                    await this.loadModels();
                    break;
                case 'changeModel':
                    await this.changeModel(msg.model);
                    break;
                case 'requestHistory':
                    this.sendHistory();
                    break;
                case 'pickImage':
                    await this.pickImage();
                    break;
            }
        });

        this.loadModels();
        this.createNewSession();
    }

    private createNewSession() {
        this.currentSession = {
            id: Date.now().toString(),
            title: 'New Chat',
            messages: [],
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        this.post({ type: 'clearChat' });
        this.sendHistory();
    }

    private loadSession(sessionId: string) {
        const session = this.sessions.find(s => s.id === sessionId);
        if (session) {
            this.currentSession = session;
            this.post({ type: 'loadSession', messages: session.messages });
        }
    }

    private deleteSession(sessionId: string) {
        this.sessions = this.sessions.filter(s => s.id !== sessionId);
        this.saveHistory();
        this.sendHistory();
    }

    private sendHistory() {
        this.post({
            type: 'history',
            sessions: this.sessions.map(s => ({
                id: s.id,
                title: s.title,
                preview: s.messages[0]?.content?.substring(0, 50) || 'Empty chat',
                timestamp: s.updatedAt
            }))
        });
    }

    private loadHistory() {
        try {
            if (fs.existsSync(this.historyFile)) {
                const data = fs.readFileSync(this.historyFile, 'utf-8');
                this.sessions = JSON.parse(data);
            }
        } catch (error) {
            console.error('Failed to load chat history:', error);
            this.sessions = [];
        }
    }

    private saveHistory() {
        try {
            const dir = path.dirname(this.historyFile);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(this.historyFile, JSON.stringify(this.sessions, null, 2));
        } catch (error) {
            console.error('Failed to save chat history:', error);
        }
    }

    private addMessageToSession(role: 'user' | 'assistant' | 'system', content: string) {
        if (!this.currentSession) return;

        const message: ChatMessage = {
            role,
            content,
            timestamp: Date.now()
        };

        this.currentSession.messages.push(message);
        this.currentSession.updatedAt = Date.now();

        // Auto-title from first user message
        if (role === 'user' && this.currentSession.messages.length === 1) {
            this.currentSession.title = content.substring(0, 40) + (content.length > 40 ? '...' : '');
        }

        // Save to sessions list
        const existingIndex = this.sessions.findIndex(s => s.id === this.currentSession!.id);
        if (existingIndex >= 0) {
            this.sessions[existingIndex] = this.currentSession;
        } else {
            this.sessions.unshift(this.currentSession);
        }

        // Keep only last 50 sessions
        this.sessions = this.sessions.slice(0, 50);
        this.saveHistory();
        this.sendHistory();
    }

    public addBotMessage(content: string) {
        if (!this._view) return;
        this._view.webview.postMessage({ type: 'stream', content });
        this._view.webview.postMessage({ type: 'done' });
    }

    private async handleUserMessage(text: string) {
        if (!this._view) return;

        // Add to session history
        this.addMessageToSession('user', text);

        // Post user message to UI
        this._view.webview.postMessage({ type: 'message', role: 'user', content: text });

        // Process via agent with callbacks
        await this.agent.processMessage(text, {
            onThinking: () => this.post({ type: 'thinking', value: true }),

            onResponse: async (text: string) => {
                this.addMessageToSession('assistant', text);
                this.post({ type: 'thinking', value: false });
                await this.streamResponse(text);
                this.post({ type: 'done' });
            },

            onEditing: (file: string) => {
                this.post({ type: 'thinking', value: false });
                this.post({ type: 'system', content: `Editing ${file}...` });
            },

            onSummary: (summary: string[], files: string[]) => {
                const summaryText = summary.join('\n');
                this.addMessageToSession('assistant', summaryText);
                this.post({ type: 'summary', summary, files });
                this.post({ type: 'done' });
            },

            onAsk: (question: string) => {
                this.addMessageToSession('assistant', question);
                this.post({ type: 'thinking', value: false });
                this.post({ type: 'message', role: 'assistant', content: question });
            },

            onProgress: (step: string) => {
                this.post({ type: 'progress', step });
            }
        });
    }

    private async streamResponse(content: string) {
        const chunks = content.match(/.{1,15}/g) || [content];
        let accumulated = '';

        for (const chunk of chunks) {
            accumulated += chunk;
            this.post({ type: 'stream', content: accumulated });
            await new Promise(r => setTimeout(r, 10));
        }
    }

    private post(msg: any) {
        this._view?.webview.postMessage(msg);
    }

    private async pickImage() {
        const options: vscode.OpenDialogOptions = {
            canSelectMany: false,
            openLabel: 'Select Image',
            filters: {
                'Images': ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg']
            }
        };

        const fileUri = await vscode.window.showOpenDialog(options);
        if (fileUri && fileUri[0]) {
            const filePath = fileUri[0].fsPath;
            const fileName = path.basename(filePath);

            // Send image info back to webview
            this.post({
                type: 'imageSelected',
                path: filePath,
                name: fileName
            });
        }
    }

    private async loadModels() {
        try {
            const models = await ollamaClient.listModels();
            const config = vscode.workspace.getConfiguration('loki');
            this.post({ type: 'models', list: models, current: config.get('model') || 'codellama' });
        } catch {
            this.post({ type: 'models', list: ['codellama'], current: 'codellama' });
        }
    }

    private async changeModel(model: string) {
        await vscode.workspace.getConfiguration('loki').update('model', model, vscode.ConfigurationTarget.Global);
        this.agent.reloadModel();
    }

    private getHtml() {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>LOKI</title>
    <style>
        :root {
            --font: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif);
            --font-mono: var(--vscode-editor-font-family, "SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Consolas, monospace);
            --fs-sm: 11px;
            --fs-base: 13px;
            --fs-md: 14px;
            --bg: var(--vscode-sideBar-background);
            --fg: var(--vscode-foreground);
            --fg-muted: var(--vscode-descriptionForeground);
            --border: var(--vscode-widget-border, rgba(255,255,255,0.1));
            --input-bg: var(--vscode-input-background);
            --input-border: var(--vscode-input-border, var(--border));
            --btn-bg: var(--vscode-button-background);
            --btn-fg: var(--vscode-button-foreground);
            --btn-hover: var(--vscode-button-hoverBackground);
            --code-bg: var(--vscode-textBlockQuote-background);
            --ai-msg-bg: transparent;
            --user-msg-bg: var(--vscode-editor-inactiveSelectionBackground, rgba(128,128,128,0.1));
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            font-family: var(--font);
            font-size: var(--fs-base);
            background: var(--bg);
            color: var(--fg);
            height: 100vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        /* === HEADER === */
        .header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 8px 12px;
            border-bottom: 1px solid var(--border);
            background: var(--vscode-sideBarSectionHeader-background, var(--bg));
            gap: 8px;
        }

        .header-left {
            display: flex;
            align-items: center;
            gap: 8px;
            flex: 1;
        }

        .logo {
            font-weight: 700;
            font-size: 12px;
            opacity: 0.9;
            letter-spacing: 0.5px;
        }

        .icon-btn {
            background: transparent;
            border: none;
            color: var(--fg);
            cursor: pointer;
            padding: 4px 6px;
            border-radius: 4px;
            font-size: var(--fs-sm);
            opacity: 0.8;
            transition: all 0.15s;
        }
        .icon-btn:hover { background: var(--vscode-toolbar-hoverBackground); opacity: 1; }

        .history-dropdown {
            position: relative;
        }

        .history-menu {
            display: none;
            position: absolute;
            top: 100%;
            left: 0;
            margin-top: 4px;
            background: var(--vscode-menu-background, #252526);
            border: 1px solid var(--vscode-menu-border, #454545);
            border-radius: 6px;
            box-shadow: 0 4px 16px rgba(0,0,0,0.3);
            min-width: 280px;
            max-width: 320px;
            max-height: 400px;
            overflow-y: auto;
            z-index: 1000;
            padding: 4px 0;
        }
        .history-menu.show { display: block; }

        .history-item {
            padding: 8px 12px;
            cursor: pointer;
            border-bottom: 1px solid var(--border);
            transition: background 0.1s;
        }
        .history-item:hover { background: var(--vscode-list-hoverBackground); }
        .history-item:last-child { border-bottom: none; }

        .history-title {
            font-size: var(--fs-sm);
            font-weight: 500;
            margin-bottom: 2px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .history-preview {
            font-size: 11px;
            opacity: 0.6;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .model-select {
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            border: none;
            border-radius: 12px;
            padding: 2px 8px;
            font-size: 10px;
            height: 20px;
            cursor: pointer;
            outline: none;
        }

        /* === MESSAGES === */
        #messages {
            flex: 1;
            overflow-y: auto;
            padding: 16px;
            display: flex;
            flex-direction: column;
            gap: 20px;
        }

        .message {
            display: flex;
            flex-direction: column;
            gap: 6px;
            animation: slideIn 0.2s ease-out;
            line-height: 1.6;
        }

        @keyframes slideIn {
            from { opacity: 0; transform: translateY(8px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .message.user {
            align-self: flex-end;
            background: var(--user-msg-bg);
            padding: 10px 14px;
            border-radius: 14px;
            max-width: 85%;
        }

        .message.assistant {
            align-self: flex-start;
            max-width: 100%;
        }

        .ai-header {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: var(--fs-sm);
            font-weight: 600;
            color: var(--fg-muted);
            margin-bottom: 4px;
        }

        .ai-icon {
            width: 16px;
            height: 16px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border-radius: 4px;
            display: grid;
            place-items: center;
            color: white;
            font-size: 10px;
            font-weight: 700;
        }

        /* Thinking Block */
        details.thought-process {
            border-left: 2px solid var(--vscode-textLink-activeForeground, #0078d4);
            padding-left: 12px;
            margin-bottom: 10px;
            color: var(--fg-muted);
            font-size: var(--fs-sm);
        }

        summary {
            cursor: pointer;
            outline: none;
            user-select: none;
            list-style: none;
            font-weight: 500;
            padding: 4px 0;
            transition: color 0.15s;
        }
        summary:hover { color: var(--fg); }
        summary::-webkit-details-marker { display: none; }

        .thought-content {
            margin-top: 8px;
            font-family: var(--font-mono);
            font-size: 11px;
            opacity: 0.85;
            line-height: 1.5;
        }

        .log-line {
            margin-bottom: 4px;
            padding-left: 8px;
            border-left: 1px solid var(--vscode-textLink-activeForeground);
        }

        /* Content Formatting */
        .content {
            font-size: var(--fs-base);
            line-height: 1.7;
        }

        .content p {
            margin: 8px 0;
        }

        .content p:first-child { margin-top: 0; }
        .content p:last-child { margin-bottom: 0; }

        .content ul, .content ol {
            margin: 8px 0;
            padding-left: 24px;
        }

        .content li {
            margin: 4px 0;
        }

        .content h1, .content h2, .content h3 {
            font-weight: 600;
            margin: 16px 0 8px;
        }

        .content h1 { font-size: 18px; }
        .content h2 { font-size: 16px; }
        .content h3 { font-size: 14px; }

        .content strong { font-weight: 600; }
        .content em { font-style: italic; }

        .content code {
            background: var(--code-bg);
            padding: 2px 6px;
            border-radius: 3px;
            font-family: var(--font-mono);
            font-size: 12px;
        }

        .content pre {
            background: var(--code-bg);
            border: 1px solid var(--border);
            border-radius: 6px;
            padding: 14px;
            margin: 12px 0;
            overflow-x: auto;
            position: relative;
            font-family: var(--font-mono);
            font-size: 12px;
            line-height: 1.5;
        }

        .content pre code {
            background: none;
            padding: 0;
            border-radius: 0;
        }

        .copy-btn {
            position: absolute;
            top: 8px;
            right: 8px;
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            border-radius: 4px;
            padding: 4px 8px;
            font-size: 10px;
            cursor: pointer;
            opacity: 0;
            transition: opacity 0.15s, background 0.15s;
        }
        .content pre:hover .copy-btn { opacity: 1; }
        .copy-btn:hover { background: var(--vscode-button-secondaryHoverBackground); }

        /* === INPUT === */
        .input-container {
            padding: 12px;
            background: var(--bg);
            border-top: 1px solid var(--border);
        }

        .input-box {
            background: var(--input-bg);
            border: 1px solid var(--input-border);
            border-radius: 12px;
            padding: 10px 12px;
            display: flex;
            flex-direction: column;
            gap: 8px;
            transition: border-color 0.15s, box-shadow 0.15s;
        }

        .input-box:focus-within {
            border-color: var(--vscode-focusBorder);
            box-shadow: 0 0 0 1px var(--vscode-focusBorder);
        }

        textarea {
            background: transparent;
            border: none;
            color: var(--fg);
            font-family: var(--font);
            font-size: var(--fs-base);
            resize: none;
            outline: none;
            min-height: 22px;
            max-height: 200px;
            width: 100%;
            line-height: 1.5;
        }

        .input-footer {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding-top: 4px;
        }

        .left-controls {
            display: flex;
            align-items: center;
            gap: 8px;
            position: relative;
        }

        .send-btn {
            width: 28px;
            height: 28px;
            border-radius: 6px;
            border: none;
            background: var(--btn-bg);
            color: var(--btn-fg);
            cursor: pointer;
            display: grid;
            place-items: center;
            transition: all 0.15s;
        }
        .send-btn:hover { background: var(--btn-hover); }
        .send-btn.stop { background: var(--vscode-errorForeground); }

        /* Context Menu */
        .context-menu {
            position: absolute;
            bottom: 32px;
            left: 0;
            background: var(--vscode-menu-background, #252526);
            color: var(--vscode-menu-foreground);
            border: 1px solid var(--vscode-menu-border, #454545);
            border-radius: 6px;
            width: 160px;
            display: none;
            flex-direction: column;
            box-shadow: 0 4px 12px rgba(0,0,0,0.25);
            z-index: 1000;
            padding: 4px 0;
        }
        .context-menu.show { display: flex; }

        .menu-header {
            padding: 8px 12px 4px;
            font-size: 10px;
            font-weight: 600;
            opacity: 0.6;
            text-transform: uppercase;
        }

        .menu-item {
            padding: 8px 12px;
            font-size: 12px;
            display: flex;
            align-items: center;
            gap: 8px;
            cursor: pointer;
            transition: background 0.1s;
        }
        .menu-item:hover { background: var(--vscode-list-hoverBackground); }
        .menu-item svg { width: 14px; height: 14px; opacity: 0.8; }

        /* Image Attachments */
        .image-preview {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 11px;
            margin: 4px 4px 4px 0;
        }
        .image-preview svg { width: 12px; height: 12px; }
    </style>
</head>
<body>
    <!-- Header -->
    <div class="header">
        <div class="header-left">
            <span class="logo">LOKI</span>
            <button id="newChatBtn" class="icon-btn" title="New Chat">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 0a1 1 0 011 1v6h6a1 1 0 110 2H9v6a1 1 0 11-2 0V9H1a1 1 0 010-2h6V1a1 1 0 011-1z"/>
                </svg>
            </button>
            <div class="history-dropdown">
                <button id="historyBtn" class="icon-btn" title="Chat History">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M8 3a5 5 0 015 5h1.5l-2 2.5L10.5 8H12a4 4 0 10-1.17 2.83l.71.71A5 5 0 118 3z"/>
                    </svg>
                </button>
                <div id="historyMenu" class="history-menu"></div>
            </div>
        </div>
        <select id="modelSelect" class="model-select">
            <option>Loading...</option>
        </select>
    </div>

    <!-- Messages -->
    <div id="messages"></div>

    <!-- Input -->
    <div class="input-container">
        <div class="input-box">
            <textarea id="input" rows="1" placeholder="Ask LOKI anything..."></textarea>
            
            <div class="input-footer">
                <div class="left-controls">
                    <button id="plusBtn" class="icon-btn" title="Add Context">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M8 0a1 1 0 011 1v6h6a1 1 0 110 2H9v6a1 1 0 11-2 0V9H1a1 1 0 010-2h6V1a1 1 0 011-1z"/>
                        </svg>
                    </button>
                    
                    <div id="contextMenu" class="context-menu">
                        <div class="menu-header">Add context</div>
                        <div class="menu-item" onclick="insertContext('media')">
                            <svg viewBox="0 0 16 16" fill="currentColor"><path d="M6 5.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z"/><path d="M2 1a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V3a2 2 0 00-2-2H2zm12 1a1 1 0 011 1v6.5l-3.78-1.95a.5.5 0 00-.58.09l-3.71 3.71-2.66-1.77a.5.5 0 00-.63.06L2 12V3a1 1 0 011-1h12z"/></svg>
                            Media
                        </div>
                        <div class="menu-item" onclick="insertContext('mentions')">
                            <svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 3.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7zm0 6a2.5 2.5 0 110-5 2.5 2.5 0 010 5z"/><path d="M8 15A7 7 0 118 1a7 7 0 010 14zm0 1A8 8 0 108 0a8 8 0 000 16z"/></svg>
                            Mentions
                        </div>
                        <div class="menu-item" onclick="insertContext('workflow')">
                            <svg viewBox="0 0 16 16" fill="currentColor"><path d="M11 2a1 1 0 011-1h2a1 1 0 011 1v12h.5a.5.5 0 000-1H16v-1a1 1 0 011-1V1a1 1 0 00-1-1H3a1 1 0 00-1 1v2.5a.5.5 0 01-1 0V2H.5a.5.5 0 000 1H1v12a1 1 0 001 1h2a1 1 0 001-1V2a1 1 0 011-1h5z"/></svg>
                            Workflows
                        </div>
                    </div>
                </div>

                <button id="sendBtn" class="send-btn" title="Send">
                    <div id="sendIcon">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M15.854.146a.5.5 0 01.11.54l-5.82 14.547a.75.75 0 01-1.329.124l-3.178-4.995L.643 7.184a.75.75 0 01.124-1.33L15.314.037a.5.5 0 01.54.11zM6.636 10.07l2.761 4.338L14.13 2.576 6.636 10.07zm6.787-8.201L1.591 6.602l4.339 2.76 7.494-7.493z"/>
                        </svg>
                    </div>
                    <div id="stopIcon" style="width: 8px; height: 8px; background: white; border-radius: 1px; display: none;"></div>
                </button>
            </div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const messages = document.getElementById('messages');
        const input = document.getElementById('input');
        const sendBtn = document.getElementById('sendBtn');
        const sendIcon = document.getElementById('sendIcon');
        const stopIcon = document.getElementById('stopIcon');
        const modelSelect = document.getElementById('modelSelect');
        const plusBtn = document.getElementById('plusBtn');
        const contextMenu = document.getElementById('contextMenu');
        const newChatBtn = document.getElementById('newChatBtn');
        const historyBtn = document.getElementById('historyBtn');
        const historyMenu = document.getElementById('historyMenu');
        
        let isGenerating = false;
        let currentThinking = null;
        let thinkingTimer = null;
        let startTime = 0;
        let currentAiMsg = null;

        // Init
        input.focus();
        vscode.postMessage({ type: 'refreshModels' });
        vscode.postMessage({ type: 'requestHistory' });

        // New Chat
        newChatBtn.addEventListener('click', () => {
            vscode.postMessage({ type: 'newChat' });
        });

        // History
        historyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            historyMenu.classList.toggle('show');
        });

        document.addEventListener('click', (e) => {
            if (!historyMenu.contains(e.target) && e.target !== historyBtn) {
                historyMenu.classList.remove('show');
            }
            if (!contextMenu.contains(e.target) && e.target !== plusBtn) {
                contextMenu.classList.remove('show');
            }
        });

        // Context Menu
        if (plusBtn && contextMenu) {
            plusBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                contextMenu.classList.toggle('show');
            });
        }

        window.insertContext = (type) => {
            if (contextMenu) contextMenu.classList.remove('show');
            let textToInsert = '';
            
            if (type === 'mentions') textToInsert = '@';
            else if (type === 'workflow') textToInsert = '/';
            else if (type === 'media') {
                // Open file picker
                vscode.postMessage({ type: 'pickImage' });
                return;
            }

            const start = input.selectionStart;
            const end = input.selectionEnd;
            const text = input.value;
            input.value = text.substring(0, start) + textToInsert + text.substring(end);
            input.selectionStart = input.selectionEnd = start + textToInsert.length;
            input.focus();
        };

        // Model Selection
        modelSelect.addEventListener('change', () => {
            vscode.postMessage({ type: 'changeModel', model: modelSelect.value });
        });

        // Input
        input.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 200) + 'px';
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (!isGenerating) send();
            }
        });

        sendBtn.addEventListener('click', () => {
            if (isGenerating) {
                setGenerating(false);
                vscode.postMessage({ type: 'cancel' });
            } else {
                send();
            }
        });

        function send() {
            const text = input.value.trim();
            if (!text) return;

            addMessage('user', text);
            vscode.postMessage({ type: 'send', text });
            
            input.value = '';
            input.style.height = 'auto';
            setGenerating(true);
        }

        function setGenerating(generating) {
            isGenerating = generating;
            if (generating) {
                sendBtn.classList.add('stop');
                sendIcon.style.display = 'none';
                stopIcon.style.display = 'block';
            } else {
                sendBtn.classList.remove('stop');
                sendIcon.style.display = 'block';
                stopIcon.style.display = 'none';
                if (currentThinking) stopThinking();
            }
        }

        // Messages
        function addMessage(role, content) {
            const div = document.createElement('div');
            div.className = \`message \${role}\`;

            if (role === 'assistant') {
                const header = document.createElement('div');
                header.className = 'ai-header';
                header.innerHTML = '<div class="ai-icon">L</div> LOKI';
                div.appendChild(header);
            }

            const body = document.createElement('div');
            body.className = 'content';
            body.innerHTML = role === 'user' ? escapeHtml(content) : parseMarkdown(content);
            
            div.appendChild(body);
            messages.appendChild(div);
            scrollToBottom();
            return body;
        }

        // Thinking
        function startThinking() {
            if (currentThinking) return;

            const div = document.createElement('div');
            div.className = 'message assistant';
            div.innerHTML = '<div class="ai-header"><div class="ai-icon">L</div> LOKI</div>';
            
            const details = document.createElement('details');
            details.className = 'thought-process';
            details.open = true;
            
            const summary = document.createElement('summary');
            summary.textContent = 'Thinking...';
            
            const content = document.createElement('div');
            content.className = 'thought-content';
            
            details.appendChild(summary);
            details.appendChild(content);
            div.appendChild(details);
            
            messages.appendChild(div);
            scrollToBottom();

            currentThinking = { container: div, details, summary, content, responseDiv: null };
            startTime = Date.now();
            
            thinkingTimer = setInterval(() => {
                const seconds = Math.floor((Date.now() - startTime) / 1000);
                summary.textContent = \`Thinking for \${seconds}s...\`;
            }, 1000);
        }

        function updateThinking(text) {
            if (!currentThinking) startThinking();
            
            const line = document.createElement('div');
            line.className = 'log-line';
            line.textContent = text;
            currentThinking.content.appendChild(line);
            
            if (currentThinking.details.open) scrollToBottom();
        }

        function stopThinking() {
            if (!currentThinking) return;
            clearInterval(thinkingTimer);
            const seconds = Math.floor((Date.now() - startTime) / 1000);
            currentThinking.summary.textContent = \`Thought for \${seconds}s\`;
            currentThinking.details.open = false;
        }

        // Formatting
        function scrollToBottom() {
            messages.scrollTop = messages.scrollHeight;
        }

        function escapeHtml(text) {
            const temp = document.createElement('div');
            temp.textContent = text;
            return temp.innerHTML.replace(/\\n/g, '<br>');
        }

        function parseMarkdown(text) {
            return text
                .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                // Code blocks
                .replace(/\`\`\`(\\w+)?\\n([\\s\\S]*?)\`\`\`/g, (_, lang, code) => 
                    \`<pre><button class="copy-btn" onclick="copyCode(this)">Copy</button><code>\${code.replace(/&lt;/g, '<').replace(/&gt;/g, '>')}</code></pre>\`)
                // Inline code
                .replace(/\`([^\`]+)\`/g, '<code>$1</code>')
                // Bold
                .replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>')
                // Italic
                .replace(/\\*(.+?)\\*/g, '<em>$1</em>')
                // Headers
                .replace(/^### (.+)$/gm, '<h3>$1</h3>')
                .replace(/^## (.+)$/gm, '<h2>$1</h2>')
                .replace(/^# (.+)$/gm, '<h1>$1</h1>')
                // Lists
                .replace(/^\\d+\\. (.+)$/gm, '<li>$1</li>')
                .replace(/^- (.+)$/gm, '<li>$1</li>')
                .replace(/(<li>.*<\\/li>)/s, '<ul>$1</ul>')
                // Line breaks
                .replace(/\\n\\n/g, '</p><p>')
                .replace(/^(.+)$/gm, '<p>$1</p>')
                .replace(/<p><h/g, '<h')
                .replace(/<\\/h\\d><\\/p>/g, (match) => match.replace(/<\\/p>/g, ''))
                .replace(/<p><ul>/g, '<ul>').replace(/<\\/ul><\\/p>/g, '</ul>');
        }

        window.copyCode = (btn) => {
            const code = btn.nextElementSibling.textContent;
            navigator.clipboard.writeText(code);
            btn.textContent = 'Copied!';
            setTimeout(() => btn.textContent = 'Copy', 2000);
        };

        // Incoming Messages
        window.addEventListener('message', event => {
            const m = event.data;
            switch (m.type) {
                case 'models':
                    if (m.list) {
                        modelSelect.innerHTML = m.list.map(x => 
                            \`<option value="\${x.name || x}" \${(x.name || x) === m.current ? 'selected' : ''}>\${x.name || x}</option>\`
                        ).join('');
                    }
                    if (m.current) modelSelect.value = m.current;
                    break;

                case 'history':
                    historyMenu.innerHTML = '';
                    if (m.sessions && m.sessions.length > 0) {
                        m.sessions.forEach(session => {
                            const item = document.createElement('div');
                            item.className = 'history-item';
                            item.innerHTML = \`
                                <div class="history-title">\${session.title}</div>
                                <div class="history-preview">\${session.preview}</div>
                            \`;
                            item.addEventListener('click', () => {
                                vscode.postMessage({ type: 'loadSession', sessionId: session.id });
                                historyMenu.classList.remove('show');
                            });
                            historyMenu.appendChild(item);
                        });
                    } else {
                        historyMenu.innerHTML = '<div class="history-item" style="opacity:0.5; cursor: default;">No history yet</div>';
                    }
                    break;

                case 'clearChat':
                    messages.innerHTML = '';
                    break;

                case 'loadSession':
                    messages.innerHTML = '';
                    if (m.messages) {
                        m.messages.forEach(msg => {
                            addMessage(msg.role, msg.content);
                        });
                    }
                    break;

                case 'thinking':
                    if (m.value) startThinking();
                    break;

                case 'progress':
                case 'system':
                    updateThinking(m.step || m.content);
                    break;

                case 'stream':
                    stopThinking();
                    if (currentThinking && currentThinking.container) {
                        if (!currentThinking.responseDiv) {
                            currentThinking.responseDiv = document.createElement('div');
                            currentThinking.responseDiv.className = 'content';
                            currentThinking.container.appendChild(currentThinking.responseDiv);
                        }
                        currentThinking.responseDiv.innerHTML = parseMarkdown(m.content);
                    } else {
                        if (!currentAiMsg) currentAiMsg = addMessage('assistant', '');
                        currentAiMsg.innerHTML = parseMarkdown(m.content);
                    }
                    scrollToBottom();
                    break;

                case 'done':
                    setGenerating(false);
                    currentAiMsg = null;
                    if (currentThinking) currentThinking = null;
                    break;

                case 'imageSelected':
                    if (m.name && m.path) {
                        // Add image reference to input
                        const imageText = \`[Image: \${m.name}] \`;
                        input.value += imageText;
                        input.focus();
                    }
                    break;
            }
        });
    </script>
</body>
</html>`;
    }
}
