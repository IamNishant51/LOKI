"use strict";
/**
 * extension.ts
 *
 * LOKI - Ultimate Local AI Coding Agent
 * Main extension entry point.
 *
 * PRIVACY NOTICE:
 * All AI operations run locally via Ollama (localhost:11434).
 * No data is sent to external servers. No telemetry.
 *
 * PERMISSIONS RATIONALE:
 * - workspace: Read/write files for autonomous operations (backups created)
 * - webview: Chat sidebar UI
 * - commands: User-triggered actions
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const lokiAgent_1 = require("./src/lokiAgent");
const chatViewProvider_1 = require("./src/chatViewProvider");
const completionProvider_1 = require("./src/completionProvider");
const codeActionProvider_1 = require("./src/codeActionProvider");
const ollamaClient = __importStar(require("./src/ollamaClient"));
let agent;
let statusBarItem;
let completionsEnabled = true;
async function activate(context) {
    console.log('[LOKI] Activating extension...');
    // Initialize lightweight agent
    agent = new lokiAgent_1.LokiAgent();
    // Status bar
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.text = '$(loading~spin) LOKI';
    statusBarItem.tooltip = 'LOKI AI - Checking Ollama...';
    statusBarItem.command = 'loki.healthCheck';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);
    // Check Ollama health on startup
    const isHealthy = await ollamaClient.healthCheck();
    if (isHealthy) {
        statusBarItem.text = '$(zap) LOKI';
        statusBarItem.tooltip = 'LOKI AI - Ready (Ollama connected)';
    }
    else {
        statusBarItem.text = '$(warning) LOKI';
        statusBarItem.tooltip = 'LOKI AI - Ollama not running! Start with: ollama serve';
        vscode.window.showWarningMessage('LOKI: Ollama is not running. Start it with `ollama serve` to enable AI features.', 'Retry').then(choice => {
            if (choice === 'Retry') {
                vscode.commands.executeCommand('loki.healthCheck');
            }
        });
    }
    // ===== REGISTER CHAT VIEW PROVIDER =====
    const chatProvider = new chatViewProvider_1.LokiChatViewProvider(context.extensionUri, agent, context);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(chatViewProvider_1.LokiChatViewProvider.viewType, chatProvider, { webviewOptions: { retainContextWhenHidden: true } }));
    console.log('[LOKI] Chat sidebar registered');
    // ===== REGISTER INLINE COMPLETION PROVIDER =====
    const config = vscode.workspace.getConfiguration('loki');
    completionsEnabled = config.get('enableCompletions') ?? true;
    if (completionsEnabled) {
        const completionProvider = new completionProvider_1.LokiCompletionProvider(agent);
        context.subscriptions.push(vscode.languages.registerInlineCompletionItemProvider({ pattern: '**' }, completionProvider));
        console.log('[LOKI] Inline completion provider registered');
    }
    // ===== REGISTER CODE ACTION PROVIDER =====
    const codeActionProvider = new codeActionProvider_1.LokiCodeActionProvider(agent);
    context.subscriptions.push(vscode.languages.registerCodeActionsProvider({ pattern: '**' }, codeActionProvider, {
        providedCodeActionKinds: [
            vscode.CodeActionKind.QuickFix,
            vscode.CodeActionKind.Refactor
        ]
    }));
    console.log('[LOKI] Code action provider registered');
    // ===== REGISTER COMMANDS =====
    // Health check
    context.subscriptions.push(vscode.commands.registerCommand('loki.healthCheck', async () => {
        statusBarItem.text = '$(loading~spin) LOKI';
        const healthy = await ollamaClient.healthCheck();
        if (healthy) {
            statusBarItem.text = '$(zap) LOKI';
            statusBarItem.tooltip = 'LOKI AI - Ready';
            vscode.window.showInformationMessage('✅ Ollama is running and connected!');
        }
        else {
            statusBarItem.text = '$(warning) LOKI';
            statusBarItem.tooltip = 'LOKI AI - Ollama offline';
            vscode.window.showErrorMessage('❌ Ollama is not running. Start with: ollama serve');
        }
    }));
    // Open chat sidebar
    context.subscriptions.push(vscode.commands.registerCommand('loki.openChat', () => {
        vscode.commands.executeCommand('loki.chatView.focus');
    }));
    // Toggle completions
    context.subscriptions.push(vscode.commands.registerCommand('loki.toggleCompletions', () => {
        completionsEnabled = !completionsEnabled;
        vscode.window.showInformationMessage(`LOKI: Inline completions ${completionsEnabled ? 'enabled' : 'disabled'}`);
    }));
    // Explain code
    context.subscriptions.push(vscode.commands.registerCommand('loki.explainCode', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.selection.isEmpty) {
            vscode.window.showInformationMessage('Select code to explain');
            return;
        }
        const code = editor.document.getText(editor.selection);
        const language = editor.document.languageId;
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'LOKI: Explaining code...',
            cancellable: false
        }, async () => {
            try {
                const explanation = await agent.explainCode(code, language);
                chatProvider.addBotMessage(`📚 **Explanation:**\n\n${explanation}`);
                vscode.commands.executeCommand('loki.chatView.focus');
            }
            catch (e) {
                vscode.window.showErrorMessage(`LOKI Error: ${e}`);
            }
        });
    }));
    // Refactor code
    context.subscriptions.push(vscode.commands.registerCommand('loki.refactorCode', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.selection.isEmpty) {
            vscode.window.showInformationMessage('Select code to refactor');
            return;
        }
        const code = editor.document.getText(editor.selection);
        const language = editor.document.languageId;
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'LOKI: Refactoring code...',
            cancellable: false
        }, async () => {
            try {
                const refactored = await agent.refactorCode(code, language);
                chatProvider.addBotMessage(`✨ **Refactored:**\n\n\`\`\`${language}\n${refactored}\n\`\`\``);
                vscode.commands.executeCommand('loki.chatView.focus');
            }
            catch (e) {
                vscode.window.showErrorMessage(`LOKI Error: ${e}`);
            }
        });
    }));
    // Generate tests
    context.subscriptions.push(vscode.commands.registerCommand('loki.generateTests', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.selection.isEmpty) {
            vscode.window.showInformationMessage('Select code to generate tests for');
            return;
        }
        const code = editor.document.getText(editor.selection);
        const language = editor.document.languageId;
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'LOKI: Generating tests...',
            cancellable: false
        }, async () => {
            try {
                const tests = await agent.generateTests(code, language);
                chatProvider.addBotMessage(`🧪 **Tests:**\n\n${tests}`);
                vscode.commands.executeCommand('loki.chatView.focus');
            }
            catch (e) {
                vscode.window.showErrorMessage(`LOKI Error: ${e}`);
            }
        });
    }));
    // Fix code
    context.subscriptions.push(vscode.commands.registerCommand('loki.fixCode', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.selection.isEmpty) {
            vscode.window.showInformationMessage('Select code to fix');
            return;
        }
        const code = editor.document.getText(editor.selection);
        const language = editor.document.languageId;
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'LOKI: Fixing bugs...',
            cancellable: false
        }, async () => {
            try {
                const result = await agent.fixBugs(code, language);
                chatProvider.addBotMessage(`🔧 **Analysis:**\n${result.analysis}\n\n**Fixed Code:**\n\`\`\`${language}\n${result.fixed}\n\`\`\``);
                vscode.commands.executeCommand('loki.chatView.focus');
            }
            catch (e) {
                vscode.window.showErrorMessage(`LOKI Error: ${e}`);
            }
        });
    }));
    // Listen for config changes
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('loki.model') || e.affectsConfiguration('loki.ollamaUrl')) {
            agent.reloadModel();
            vscode.window.showInformationMessage('LOKI: Model configuration updated');
        }
    }));
    console.log('[LOKI] Extension activated successfully');
    vscode.window.showInformationMessage('🚀 LOKI AI is ready!');
}
function deactivate() {
    console.log('[LOKI] Extension deactivated');
}
//# sourceMappingURL=extension.js.map