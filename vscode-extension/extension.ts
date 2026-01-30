/**
 * extension.ts
 * 
 * LOKI - Ultimate Local AI Coding Agent (Copilot-Level)
 * Main extension entry point.
 * 
 * PRIVACY NOTICE:
 * All AI operations run locally via Ollama (localhost:11434).
 * No data is sent to external servers. No telemetry.
 * 
 * FEATURES:
 * - Chat sidebar with typing animation
 * - Slash commands (/explain, /fix, /tests, /doc, etc.)
 * - Code blocks with Insert/Copy buttons
 * - Inline ghost-text completions
 * - Model selector in status bar
 * - File decoration for AI-modified files
 * - Full VS Code theme integration
 */

import * as vscode from 'vscode';
import { LokiAgent } from './src/lokiAgent';
import { LokiChatViewProvider } from './src/chatViewProvider';
import { LokiCompletionProvider } from './src/completionProvider';
import { LokiCodeActionProvider } from './src/codeActionProvider';
import { LokiFileDecorationProvider } from './src/fileDecorationProvider';
import { StatusBarManager } from './src/statusBarManager';
import * as ollamaClient from './src/ollamaClient';

let agent: LokiAgent;
let statusBarManager: StatusBarManager;
let fileDecorationProvider: LokiFileDecorationProvider;
let completionsEnabled = true;

export async function activate(context: vscode.ExtensionContext) {
    console.log('[LOKI] Activating extension...');

    // Initialize agent
    agent = new LokiAgent();

    // Initialize status bar
    statusBarManager = new StatusBarManager();
    context.subscriptions.push({ dispose: () => statusBarManager.dispose() });

    // Initialize file decoration provider
    fileDecorationProvider = new LokiFileDecorationProvider();
    context.subscriptions.push(
        vscode.window.registerFileDecorationProvider(fileDecorationProvider)
    );

    // Check Ollama health on startup
    statusBarManager.startProcessing();
    const isHealthy = await ollamaClient.healthCheck();
    statusBarManager.stopProcessing();

    if (isHealthy) {
        statusBarManager.showMessage('Connected!', 2000);
    } else {
        statusBarManager.showMessage('Ollama offline', 3000);
        vscode.window.showWarningMessage(
            'LOKI: Ollama is not running. Start it with `ollama serve` to enable AI features.',
            'Retry'
        ).then(choice => {
            if (choice === 'Retry') {
                vscode.commands.executeCommand('loki.healthCheck');
            }
        });
    }

    // ===== REGISTER CHAT VIEW PROVIDER =====
    const chatProvider = new LokiChatViewProvider(context.extensionUri, agent, context);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            LokiChatViewProvider.viewType,
            chatProvider,
            { webviewOptions: { retainContextWhenHidden: true } }
        )
    );
    console.log('[LOKI] Chat sidebar registered');

    // ===== REGISTER INLINE COMPLETION PROVIDER =====
    const config = vscode.workspace.getConfiguration('loki');
    completionsEnabled = config.get<boolean>('enableCompletions') ?? true;

    if (completionsEnabled) {
        const completionProvider = new LokiCompletionProvider(agent);
        context.subscriptions.push(
            vscode.languages.registerInlineCompletionItemProvider(
                { pattern: '**' },
                completionProvider
            )
        );
        console.log('[LOKI] Inline completion provider registered');
    }

    // ===== REGISTER CODE ACTION PROVIDER =====
    const codeActionProvider = new LokiCodeActionProvider(agent);
    context.subscriptions.push(
        vscode.languages.registerCodeActionsProvider(
            { pattern: '**' },
            codeActionProvider,
            {
                providedCodeActionKinds: [
                    vscode.CodeActionKind.QuickFix,
                    vscode.CodeActionKind.Refactor
                ]
            }
        )
    );
    console.log('[LOKI] Code action provider registered');

    // ===== REGISTER COMMANDS =====

    // Health check
    context.subscriptions.push(
        vscode.commands.registerCommand('loki.healthCheck', async () => {
            statusBarManager.startProcessing();
            const healthy = await ollamaClient.healthCheck();
            statusBarManager.stopProcessing();

            if (healthy) {
                statusBarManager.showMessage('Connected!', 2000);
                vscode.window.showInformationMessage('✅ Ollama is running and connected!');
            } else {
                statusBarManager.showMessage('Offline', 2000);
                vscode.window.showErrorMessage('❌ Ollama is not running. Start with: ollama serve');
            }
        })
    );

    // Open chat sidebar
    context.subscriptions.push(
        vscode.commands.registerCommand('loki.openChat', () => {
            vscode.commands.executeCommand('loki.chatView.focus');
        })
    );

    // Select model
    context.subscriptions.push(
        vscode.commands.registerCommand('loki.selectModel', async () => {
            await statusBarManager.showModelPicker();
        })
    );

    // Toggle completions
    context.subscriptions.push(
        vscode.commands.registerCommand('loki.toggleCompletions', () => {
            completionsEnabled = !completionsEnabled;
            vscode.window.showInformationMessage(
                `LOKI: Inline completions ${completionsEnabled ? 'enabled' : 'disabled'}`
            );
        })
    );

    // Refresh file decorations
    context.subscriptions.push(
        vscode.commands.registerCommand('loki.refreshDecorations', () => {
            // Update decorations from chat provider
            const modifiedFiles = chatProvider.getModifiedFiles();
            modifiedFiles.forEach(f => fileDecorationProvider.markModified(f));
        })
    );

    // Clear file decorations
    context.subscriptions.push(
        vscode.commands.registerCommand('loki.clearDecorations', () => {
            fileDecorationProvider.clearAll();
            vscode.window.showInformationMessage('LOKI: Cleared file modification markers');
        })
    );

    // Explain code
    context.subscriptions.push(
        vscode.commands.registerCommand('loki.explainCode', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.selection.isEmpty) {
                vscode.window.showInformationMessage('Select code to explain');
                return;
            }

            const code = editor.document.getText(editor.selection);
            const language = editor.document.languageId;

            statusBarManager.startProcessing();
            try {
                const explanation = await agent.explainCode(code, language);
                vscode.commands.executeCommand('loki.chatView.focus');
                // The explanation will be shown in chat
            } catch (e) {
                vscode.window.showErrorMessage(`LOKI Error: ${e}`);
            } finally {
                statusBarManager.stopProcessing();
            }
        })
    );

    // Refactor code
    context.subscriptions.push(
        vscode.commands.registerCommand('loki.refactorCode', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.selection.isEmpty) {
                vscode.window.showInformationMessage('Select code to refactor');
                return;
            }

            const code = editor.document.getText(editor.selection);
            const language = editor.document.languageId;

            statusBarManager.startProcessing();
            try {
                const refactored = await agent.refactorCode(code, language);

                // Show diff preview before applying
                const response = await vscode.window.showInformationMessage(
                    'LOKI: Refactored code ready. What would you like to do?',
                    'Replace Selection',
                    'Show in Chat',
                    'Cancel'
                );

                if (response === 'Replace Selection') {
                    await editor.edit(editBuilder => {
                        editBuilder.replace(editor.selection, refactored);
                    });
                    fileDecorationProvider.markModified(editor.document.fileName);
                } else if (response === 'Show in Chat') {
                    vscode.commands.executeCommand('loki.chatView.focus');
                }
            } catch (e) {
                vscode.window.showErrorMessage(`LOKI Error: ${e}`);
            } finally {
                statusBarManager.stopProcessing();
            }
        })
    );

    // Generate tests
    context.subscriptions.push(
        vscode.commands.registerCommand('loki.generateTests', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.selection.isEmpty) {
                vscode.window.showInformationMessage('Select code to generate tests for');
                return;
            }

            const code = editor.document.getText(editor.selection);
            const language = editor.document.languageId;

            statusBarManager.startProcessing();
            try {
                const tests = await agent.generateTests(code, language);

                // Offer to create new test file
                const response = await vscode.window.showInformationMessage(
                    'LOKI: Tests generated! What would you like to do?',
                    'Create Test File',
                    'Show in Chat',
                    'Copy'
                );

                if (response === 'Create Test File') {
                    const fileName = editor.document.fileName;
                    const testFileName = fileName.replace(/\.(\w+)$/, '.test.$1');
                    await agent.createFile(testFileName, tests);
                    fileDecorationProvider.markModified(testFileName);
                } else if (response === 'Copy') {
                    await vscode.env.clipboard.writeText(tests);
                    vscode.window.showInformationMessage('Tests copied to clipboard');
                } else if (response === 'Show in Chat') {
                    vscode.commands.executeCommand('loki.chatView.focus');
                }
            } catch (e) {
                vscode.window.showErrorMessage(`LOKI Error: ${e}`);
            } finally {
                statusBarManager.stopProcessing();
            }
        })
    );

    // Fix code
    context.subscriptions.push(
        vscode.commands.registerCommand('loki.fixCode', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.selection.isEmpty) {
                vscode.window.showInformationMessage('Select code to fix');
                return;
            }

            const code = editor.document.getText(editor.selection);
            const language = editor.document.languageId;

            statusBarManager.startProcessing();
            try {
                const result = await agent.fixBugs(code, language);

                const response = await vscode.window.showInformationMessage(
                    `LOKI found: ${result.analysis}`,
                    'Apply Fix',
                    'Show in Chat',
                    'Cancel'
                );

                if (response === 'Apply Fix') {
                    await editor.edit(editBuilder => {
                        editBuilder.replace(editor.selection, result.fixed);
                    });
                    fileDecorationProvider.markModified(editor.document.fileName);
                } else if (response === 'Show in Chat') {
                    vscode.commands.executeCommand('loki.chatView.focus');
                }
            } catch (e) {
                vscode.window.showErrorMessage(`LOKI Error: ${e}`);
            } finally {
                statusBarManager.stopProcessing();
            }
        })
    );

    // Quick action - Add documentation
    context.subscriptions.push(
        vscode.commands.registerCommand('loki.addDocs', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.selection.isEmpty) {
                vscode.window.showInformationMessage('Select code to document');
                return;
            }

            const code = editor.document.getText(editor.selection);
            const language = editor.document.languageId;

            statusBarManager.startProcessing();
            try {
                const documented = await agent.refactorCode(
                    `Add detailed documentation comments (JSDoc/docstrings) to this code:\n\`\`\`${language}\n${code}\n\`\`\``,
                    language
                );

                await editor.edit(editBuilder => {
                    editBuilder.replace(editor.selection, documented);
                });
                fileDecorationProvider.markModified(editor.document.fileName);
                vscode.window.showInformationMessage('Documentation added!');
            } catch (e) {
                vscode.window.showErrorMessage(`LOKI Error: ${e}`);
            } finally {
                statusBarManager.stopProcessing();
            }
        })
    );

    // Listen for config changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('loki.model') || e.affectsConfiguration('loki.ollamaUrl')) {
                agent.reloadModel();
                vscode.window.showInformationMessage('LOKI: Model configuration updated');
            }
        })
    );

    console.log('[LOKI] Extension activated successfully');
}

export function deactivate() {
    console.log('[LOKI] Extension deactivated');
}