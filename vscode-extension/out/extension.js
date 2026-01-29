"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = require("vscode");
function activate(context) {
    console.log('LOKI Extension is now active!');
    let disposable = vscode.commands.registerCommand('loki.explainSelection', () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showInformationMessage('No code selected.');
            return;
        }
        const document = editor.document;
        const selection = editor.selection;
        const text = document.getText(selection);
        if (!text) {
            vscode.window.showInformationMessage('Please select some code first.');
            return;
        }
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "LOKI: Analyzing...",
            cancellable: false
        }, async (progress) => {
            // Scaffold: For now we just show output in a message box.
            // Future: Use CodeLens or Webview.
            // Note: We need absolute path to 'loki' or run 'npm run dev chat' in the workspace.
            // Assuming user has 'loki' in path or we use workspace integration.
            // For this scaffold, we'll simulate the call logic.
            // In a real extension, we'd spawn the CLI process.
            // const cmd = `loki chat "Explain this code: ${text}" --no-stream`;
            vscode.window.showInformationMessage(`LOKI Analysis request sent for: ${text.substring(0, 50)}...`);
        });
    });
    context.subscriptions.push(disposable);
}
function deactivate() { }
//# sourceMappingURL=extension.js.map