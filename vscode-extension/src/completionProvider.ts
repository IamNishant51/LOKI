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
import { ContextManager } from './contextManager';
import * as ollamaClient from './ollamaClient';

export class LokiCompletionProvider implements vscode.InlineCompletionItemProvider {
    private agent: LokiAgent;
    private contextManager: ContextManager;
    private currentAbort: ollamaClient.AbortSignalWrapper | null = null;
    private debounceTimer: NodeJS.Timeout | null = null;
    private pendingResolve: ((value: vscode.InlineCompletionList | null) => void) | null = null;

    constructor(agent: LokiAgent) {
        this.agent = agent;
        this.contextManager = new ContextManager();
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
        if (this.currentAbort) {
            this.currentAbort.abort();
            this.currentAbort = null;
        }

        // Resolve previous pending promise to prevent memory leaks/hanging
        if (this.pendingResolve) {
            this.pendingResolve(null);
            this.pendingResolve = null;
        }
        if (this.debounceTimer) clearTimeout(this.debounceTimer);

        const debounceMs = config.get<number>('completionDebounce') || 300;

        return new Promise((resolve) => {
            this.pendingResolve = resolve;
            this.debounceTimer = setTimeout(async () => {
                this.pendingResolve = null; // Clear ref as we are executing
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
        // 1. Get rich, workspace-aware context
        const { prefix, suffix, supportingContext } = this.contextManager.getRichContext(document, position);

        // Weak context check: require at least some meaningful code
        const trimmedPrefix = prefix.trim();
        if (trimmedPrefix.length < 10 && supportingContext.length < 10) return null;

        // Don't complete inside comments or strings (basic check)
        const currentLine = document.lineAt(position.line).text;
        if (currentLine.trimStart().startsWith('//') || currentLine.trimStart().startsWith('#')) {
            return null;
        }

        this.currentAbort = ollamaClient.createAbortSignal();

        try {
            const config = vscode.workspace.getConfiguration('loki');
            const model = config.get<string>('completionModel') || 'codellama';

            // 2. Construct a more sophisticated prompt with a system message
            const systemPrompt = `You are an expert code completion AI. Your purpose is to provide the next logical chunk of code.
You will be given the code before the cursor (prefix), the code after the cursor (suffix), and some additional context from other open files.
Complete the code in the <|fim_middle|> block. Do not repeat the prefix or suffix. Keep your response concise, relevant, and high-quality.

Here is some additional context from other open files:${supportingContext ? supportingContext : " None."}`;

            const completion = await ollamaClient.generate({
                model,
                prompt: `<|fim_prefix|>${prefix}<|fim_suffix|>${suffix}<|fim_middle|>`, // Fill-in-the-middle format
                system: systemPrompt,
                abortSignal: this.currentAbort,
                options: {
                    temperature: 0.1,
                    num_predict: 80, // ~8 lines max
                    stop: ['\n\n', '```', '\n\n\n', '<|file_separator|>']
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
