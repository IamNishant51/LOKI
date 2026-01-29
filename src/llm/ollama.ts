import axios from 'axios';
import { CONFIG } from '../utils/config';
import { LLMProvider } from './types';

export class OllamaProvider implements LLMProvider {
    async generate(prompt: string, context?: string, signal?: AbortSignal): Promise<string> {
        const url = `${CONFIG.OLLAMA_HOST}/api/generate`;

        try {
            const response = await axios.post(url, {
                model: CONFIG.OLLAMA_MODEL,
                prompt: prompt,
                stream: false,
            }, {
                timeout: CONFIG.TIMEOUT,
                signal: signal
            });

            if (response.data && response.data.response) {
                return response.data.response;
            }
            throw new Error('Invalid response format from Ollama');
        } catch (error: any) {
            this.handleError(error);
            return '';
        }
    }

    async streamGenerate(prompt: string, onToken: (token: string) => void, signal?: AbortSignal): Promise<string> {
        const url = `${CONFIG.OLLAMA_HOST}/api/generate`;

        try {
            const response = await axios.post(url, {
                model: CONFIG.OLLAMA_MODEL,
                prompt: prompt,
                stream: true
            }, {
                responseType: 'stream',
                timeout: CONFIG.TIMEOUT,
                signal: signal
            });

            return new Promise((resolve, reject) => {
                let fullText = '';

                const stream = response.data;

                stream.on('data', (chunk: Buffer) => {
                    const lines = chunk.toString().split('\n').filter(Boolean);
                    for (const line of lines) {
                        try {
                            const json = JSON.parse(line);
                            if (json.response) {
                                onToken(json.response);
                                fullText += json.response;
                            }
                            if (json.done) {
                                resolve(fullText);
                            }
                        } catch (e) {
                            // ignore
                        }
                    }
                });

                stream.on('end', () => {
                    resolve(fullText);
                });

                stream.on('error', (err: any) => {
                    // If aborted, axios destroys stream with error
                    if (signal?.aborted) {
                        reject(new Error('Aborted'));
                    } else {
                        reject(err);
                    }
                });
            });

        } catch (error: any) {
            // Axios throws CanceledError if aborted
            if (axios.isCancel(error)) {
                throw new Error('Request cancelled by user');
            }
            this.handleError(error);
            return '';
        }
    }

    async checkHealth(): Promise<boolean> {
        try {
            await axios.get(CONFIG.OLLAMA_HOST, { timeout: 2000 });
            return true;
        } catch {
            return false;
        }
    }

    getName(): string {
        return `Ollama (${CONFIG.OLLAMA_MODEL})`;
    }

    private handleError(error: any): void {
        if (axios.isCancel(error)) {
            throw error;
        }
        if (axios.isAxiosError(error)) {
            if (error.code === 'ECONNREFUSED') {
                throw new Error(`Could not connect to Ollama at ${CONFIG.OLLAMA_HOST}. Is it running?`);
            }
            throw new Error(`Ollama API error: ${error.message}`);
        }
        throw error;
    }
}
