/**
 * codeActionProvider.ts
 * 
 * Provides quick fixes and refactoring actions in the editor lightbulb menu (Ctrl+.)
 */

import * as vscode from 'vscode';
import { LokiAgent } from './lokiAgent';

export class LokiCodeActionProvider implements vscode.CodeActionProvider {
    private agent: LokiAgent;

    constructor(agent: LokiAgent) {
        this.agent = agent;
    }

    provideCodeActions(
        document: vscode.TextDocument,
        range: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext,
        token: vscode.CancellationToken
    ): vscode.CodeAction[] {
        // Only show actions if there's a selection
        if (range.isEmpty) {
            return [];
        }

        const actions: vscode.CodeAction[] = [];

        // Explain Code
        const explainAction = new vscode.CodeAction(
            '💡 LOKI: Explain Code',
            vscode.CodeActionKind.QuickFix
        );
        explainAction.command = {
            command: 'loki.explainCode',
            title: 'Explain Code'
        };
        actions.push(explainAction);

        // Refactor Code
        const refactorAction = new vscode.CodeAction(
            '✨ LOKI: Refactor Code',
            vscode.CodeActionKind.Refactor
        );
        refactorAction.command = {
            command: 'loki.refactorCode',
            title: 'Refactor Code'
        };
        actions.push(refactorAction);

        // Generate Tests
        const testAction = new vscode.CodeAction(
            '🧪 LOKI: Generate Tests',
            vscode.CodeActionKind.QuickFix
        );
        testAction.command = {
            command: 'loki.generateTests',
            title: 'Generate Tests'
        };
        actions.push(testAction);

        // Fix Bugs
        const fixAction = new vscode.CodeAction(
            '🔧 LOKI: Fix Bugs',
            vscode.CodeActionKind.QuickFix
        );
        fixAction.command = {
            command: 'loki.fixCode',
            title: 'Fix Bugs'
        };
        actions.push(fixAction);

        return actions;
    }
}
