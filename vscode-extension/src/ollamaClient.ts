/**
 * ollamaClient.ts
 * 
 * Thin HTTP client for direct Ollama API access.
 * Used for streaming inline completions (lower latency than LangChain).
 * 
 * PRIVACY: Only connects to localhost. Rejects non-localhost URLs.
 * 
 * Ollama API Reference (local):
 * - POST /api/generate - Text generation with streaming
 * - POST /api/chat - Chat completion with message history
 * - GET /api/tags - List available models
 */

import * as http from 'http';
import * as vscode from 'vscode';

export interface OllamaGenerateOptions {
    model: string;
    prompt: string;
    system?: string;
    stream?: boolean;
    options?: {
        temperature?: number;
        top_p?: number;
        num_predict?: number;
        stop?: string[];
    };
    abortSignal?: AbortSignalWrapper;
}

export interface OllamaStreamChunk {
    model: string;
    response: string;
    done: boolean;
}

export interface OllamaModel {
    name: string;
    size: number;
    modified_at: string;
}

/**
 * Validates that URL is localhost only (privacy requirement)
 */
function validateLocalhost(url: string): boolean {
    try {
        const parsed = new URL(url);
        return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    } catch {
        return false;
    }
}

/**
 * Get configured Ollama URL from settings
 */
function getOllamaUrl(): string {
    const config = vscode.workspace.getConfiguration('loki');
    const url = config.get<string>('ollamaUrl') || 'http://localhost:11434';

    if (!validateLocalhost(url)) {
        throw new Error('SECURITY: Ollama URL must be localhost. Remote URLs are not allowed.');
    }

    return url;
}

/**
 * Check if Ollama server is running
 */
export async function healthCheck(): Promise<boolean> {
    return new Promise((resolve) => {
        try {
            const url = new URL(getOllamaUrl());
            const req = http.get({
                hostname: url.hostname,
                port: url.port || 11434,
                path: '/',
                timeout: 3000
            }, (res) => {
                resolve(res.statusCode === 200);
            });

            req.on('error', () => resolve(false));
            req.on('timeout', () => {
                req.destroy();
                resolve(false);
            });
        } catch {
            resolve(false);
        }
    });
}

/**
 * List available Ollama models
 */
export async function listModels(): Promise<string[]> {
    return new Promise((resolve, reject) => {
        try {
            const url = new URL(getOllamaUrl());

            const req = http.get({
                hostname: url.hostname,
                port: url.port || 11434,
                path: '/api/tags',
                timeout: 5000
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(data);
                        const models = (parsed.models || []).map((m: OllamaModel) => m.name);
                        resolve(models);
                    } catch (e) {
                        reject(new Error('Failed to parse model list'));
                    }
                });
            });

            req.on('error', (e) => reject(e));
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });
        } catch (e) {
            reject(e);
        }
    });
}

/**
 * Generate text (non-streaming) - for simple completions
 */
export async function generate(options: OllamaGenerateOptions): Promise<string> {
    return new Promise((resolve, reject) => {
        try {
            const url = new URL(getOllamaUrl());
            const postData = JSON.stringify({
                model: options.model,
                prompt: options.prompt,
                system: options.system,
                stream: false,
                options: options.options || { temperature: 0.1 }
            });

            const req = http.request({
                hostname: url.hostname,
                port: url.port || 11434,
                path: '/api/generate',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData)
                },
                timeout: 60000
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(data);
                        resolve(parsed.response || '');
                    } catch (e) {
                        reject(new Error('Failed to parse response'));
                    }
                });
            });

            req.on('error', (e) => reject(e));
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });

            if (options.abortSignal) {
                options.abortSignal.onAbort(() => {
                    req.destroy();
                    reject(new Error('Aborted'));
                });
            }

            req.write(postData);
            req.end();
        } catch (e) {
            reject(e);
        }
    });
}

/**
 * Generate text with streaming - for real-time completions
 * Returns an async generator that yields chunks
 */
export async function* generateStream(
    options: OllamaGenerateOptions,
    abortSignal?: { aborted: boolean }
): AsyncGenerator<string, void, unknown> {
    const url = new URL(getOllamaUrl());
    const postData = JSON.stringify({
        model: options.model,
        prompt: options.prompt,
        system: options.system,
        stream: true,
        options: options.options || { temperature: 0.1 }
    });

    const response = await new Promise<http.IncomingMessage>((resolve, reject) => {
        const req = http.request({
            hostname: url.hostname,
            port: url.port || 11434,
            path: '/api/generate',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        }, resolve);

        req.on('error', reject);
        req.write(postData);
        req.end();
    });

    let buffer = '';

    for await (const chunk of response) {
        if (abortSignal?.aborted) {
            response.destroy();
            return;
        }

        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
            if (!line.trim()) continue;
            try {
                const parsed: OllamaStreamChunk = JSON.parse(line);
                if (parsed.response) {
                    yield parsed.response;
                }
                if (parsed.done) {
                    return;
                }
            } catch {
                // Skip malformed chunks
            }
        }
    }
}

/**
 * Cancel helper - creates an abort signal object
 */
export interface AbortSignalWrapper {
    aborted: boolean;
    abort: () => void;
    onAbort: (cb: () => void) => void;
}

export function createAbortSignal(): AbortSignalWrapper {
    let listeners: (() => void)[] = [];
    const signal = {
        aborted: false,
        abort: () => {
            if (signal.aborted) return;
            signal.aborted = true;
            listeners.forEach(cb => cb());
            listeners = [];
        },
        onAbort: (cb: () => void) => {
            if (signal.aborted) cb();
            else listeners.push(cb);
        }
    };
    return signal;
}
