/**
 * fileDecorationProvider.ts - Mark AI-Modified Files
 * 
 * Decorates files in the Explorer that have been modified by LOKI
 * with a badge/icon so users can see at a glance which files the AI touched.
 */

import * as vscode from 'vscode';

export class LokiFileDecorationProvider implements vscode.FileDecorationProvider {
    private modifiedFiles: Set<string> = new Set();
    private _onDidChangeFileDecorations = new vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>();
    readonly onDidChangeFileDecorations = this._onDidChangeFileDecorations.event;

    /**
     * Mark a file as modified by LOKI
     */
    markModified(filePath: string) {
        this.modifiedFiles.add(filePath);
        this._onDidChangeFileDecorations.fire(vscode.Uri.file(filePath));
    }

    /**
     * Mark multiple files as modified
     */
    markMultipleModified(filePaths: string[]) {
        filePaths.forEach(f => this.modifiedFiles.add(f));
        this._onDidChangeFileDecorations.fire(filePaths.map(f => vscode.Uri.file(f)));
    }

    /**
     * Clear all modifications
     */
    clearAll() {
        const uris = Array.from(this.modifiedFiles).map(f => vscode.Uri.file(f));
        this.modifiedFiles.clear();
        this._onDidChangeFileDecorations.fire(uris);
    }

    /**
     * Clear a specific file's modification mark
     */
    clearFile(filePath: string) {
        if (this.modifiedFiles.has(filePath)) {
            this.modifiedFiles.delete(filePath);
            this._onDidChangeFileDecorations.fire(vscode.Uri.file(filePath));
        }
    }

    /**
     * Check if a file is marked as modified
     */
    isModified(filePath: string): boolean {
        return this.modifiedFiles.has(filePath);
    }

    /**
     * Get all modified files
     */
    getModifiedFiles(): string[] {
        return Array.from(this.modifiedFiles);
    }

    /**
     * Provide decoration for files
     */
    provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
        if (this.modifiedFiles.has(uri.fsPath)) {
            return {
                badge: '✨',
                tooltip: 'Modified by LOKI AI',
                color: new vscode.ThemeColor('charts.purple')
            };
        }
        return undefined;
    }

    dispose() {
        this._onDidChangeFileDecorations.dispose();
    }
}
