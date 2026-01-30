/**
 * contextManager.ts - Workspace-Aware Context Provider
 * 
 * Provides rich context for code completion by analyzing:
 * - Current file prefix/suffix
 * - Open documents
 * - Related files in workspace
 */

import * as vscode from 'vscode';

export interface RichContext {
    prefix: string;
    suffix: string;
    supportingContext: string;
}

export class ContextManager {
    private readonly maxContextLength = 2000;
    private readonly maxSupportingContext = 1000;

    /**
     * Get rich context including current position and related files
     */
    getRichContext(document: vscode.TextDocument, position: vscode.Position): RichContext {
        // Get prefix (code before cursor)
        const startLine = Math.max(0, position.line - 20);
        const prefix = document.getText(new vscode.Range(
            new vscode.Position(startLine, 0),
            position
        )).slice(-this.maxContextLength);

        // Get suffix (code after cursor)
        const endLine = Math.min(document.lineCount - 1, position.line + 5);
        const suffix = document.getText(new vscode.Range(
            position,
            new vscode.Position(endLine, document.lineAt(endLine).text.length)
        )).slice(0, 500);

        // Get supporting context from other open files
        const supportingContext = this.getSupportingContext(document);

        return { prefix, suffix, supportingContext };
    }

    /**
     * Get context from other open documents
     */
    private getSupportingContext(currentDocument: vscode.TextDocument): string {
        const contexts: string[] = [];
        let totalLength = 0;

        // Get other visible editors (tabs)
        const visibleEditors = vscode.window.visibleTextEditors;

        for (const editor of visibleEditors) {
            if (editor.document.uri.toString() === currentDocument.uri.toString()) {
                continue; // Skip current file
            }

            const doc = editor.document;

            // Skip non-code files
            if (doc.languageId === 'plaintext' || doc.languageId === 'markdown') {
                continue;
            }

            // Get file header (imports, class definitions)
            const headerLines = Math.min(30, doc.lineCount);
            const header = doc.getText(new vscode.Range(
                new vscode.Position(0, 0),
                new vscode.Position(headerLines, 0)
            ));

            const entry = `\n--- ${doc.fileName.split('/').pop()} ---\n${header.trim()}`;

            if (totalLength + entry.length > this.maxSupportingContext) {
                break;
            }

            contexts.push(entry);
            totalLength += entry.length;
        }

        return contexts.join('\n');
    }

    /**
     * Get imports and type definitions from the current file
     */
    getFileImports(document: vscode.TextDocument): string[] {
        const imports: string[] = [];
        const text = document.getText();

        // Match import statements
        const importRegex = /^import\s+.*$/gm;
        let match;

        while ((match = importRegex.exec(text)) !== null) {
            imports.push(match[0]);
        }

        return imports;
    }

    /**
     * Get current function/class context
     */
    getCurrentScope(document: vscode.TextDocument, position: vscode.Position): string {
        const text = document.getText(new vscode.Range(
            new vscode.Position(0, 0),
            position
        ));

        // Find the last function or class declaration
        const lines = text.split('\n');
        let scope = '';
        let braceDepth = 0;

        for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i];
            braceDepth += (line.match(/\}/g) || []).length;
            braceDepth -= (line.match(/\{/g) || []).length;

            // Look for function or class definitions
            const funcMatch = line.match(/(?:function|class|interface|type)\s+(\w+)/);
            if (funcMatch && braceDepth <= 0) {
                scope = funcMatch[0];
                break;
            }

            const arrowMatch = line.match(/(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(/);
            if (arrowMatch && braceDepth <= 0) {
                scope = arrowMatch[0];
                break;
            }
        }

        return scope;
    }
}
