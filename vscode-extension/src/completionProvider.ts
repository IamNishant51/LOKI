/**
 * completionProvider.ts - Inline Completions
 * 
 * Copilot-style behavior:
 * - Short suggestions (3-8 lines max)
 * - Contextual
 * - Silent when uncertain
 * - Debounced, cancellable
 */

import * as vscode from 'vscode';
import { LokiAgent } from './lokiAgent';
import * as ollamaClient from './ollamaClient';

export class LokiCompletionProvider implements vscode.InlineCompletionItemProvider {
    private agent: LokiAgent;
    private currentAbort: { aborted: boolean; abort: () => void } | null = null;
    private debounceTimer: NodeJS.Timeout | null = null;

    constructor(agent: LokiAgent) {
        this.agent = agent;
    }

    async provideInlineCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.InlineCompletionContext,
        token: vscode.CancellationToken
    ): Promise<vscode.InlineCompletionList | null> {
        const config = vscode.workspace.getConfiguration('loki');
        if (!config.get<boolean>('enableCompletions')) return null;

        // Cancel previous request
        if (this.currentAbort) this.currentAbort.abort();
        if (this.debounceTimer) clearTimeout(this.debounceTimer);

        const debounceMs = config.get<number>('completionDebounce') || 300;

        return new Promise((resolve) => {
            this.debounceTimer = setTimeout(async () => {
                if (token.isCancellationRequested) {
                    resolve(null);
                    return;
                }

                const completion = await this.getCompletion(document, position, token);

                if (!completion || token.isCancellationRequested) {
                    resolve(null);
                    return;
                }

                resolve(new vscode.InlineCompletionList([
                    new vscode.InlineCompletionItem(completion, new vscode.Range(position, position))
                ]));
            }, debounceMs);
        });
    }

    private async getCompletion(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<string | null> {
        // Get context window
        const startLine = Math.max(0, position.line - 15);
        const endLine = Math.min(document.lineCount - 1, position.line + 3);

        const prefix = document.getText(new vscode.Range(
            new vscode.Position(startLine, 0),
            position
        ));

        const suffix = document.getText(new vscode.Range(
            position,
            new vscode.Position(endLine, 0)
        ));

        // Weak context check: require at least some meaningful code
        const trimmedPrefix = prefix.trim();
        if (trimmedPrefix.length < 10) return null;

        // Don't complete inside comments or strings (basic check)
        const currentLine = document.lineAt(position.line).text;
        if (currentLine.trimStart().startsWith('//') || currentLine.trimStart().startsWith('#')) {
            return null;
        }

        this.currentAbort = ollamaClient.createAbortSignal();

        try {
            const config = vscode.workspace.getConfiguration('loki');
            const model = config.get<string>('completionModel') || 'codellama';

            const completion = await ollamaClient.generate({
                model,
                prompt: `<|fim_prefix|>${prefix}<|fim_suffix|>${suffix}<|fim_middle|>`,
                options: {
                    temperature: 0.1,
                    num_predict: 80, // ~8 lines max
                    stop: ['\n\n', '```', '\n\n\n']
                }
            });

            if (token.isCancellationRequested || this.currentAbort?.aborted) {
                return null;
            }

            return this.cleanCompletion(completion, prefix);
        } catch {
            return null;
        } finally {
            this.currentAbort = null;
        }
    }

    private cleanCompletion(completion: string, prefix: string): string | null {
        let cleaned = completion.trim();

        // Remove markdown artifacts
        cleaned = cleaned.replace(/```[\w]*\n?/g, '').replace(/```$/g, '');

        // Remove meta text
        cleaned = cleaned.replace(/^(completion|output|result|here|code):\s*/i, '');

        // Don't repeat existing code
        const lastLine = prefix.split('\n').pop()?.trim() || '';
        if (lastLine && cleaned.startsWith(lastLine)) {
            cleaned = cleaned.slice(lastLine.length);
        }

        // Enforce 8 line limit
        const lines = cleaned.split('\n');
        if (lines.length > 8) {
            cleaned = lines.slice(0, 8).join('\n');
        }

        // Return null if result is trivial
        if (cleaned.trim().length < 2) return null;

        return cleaned;
    }
}
