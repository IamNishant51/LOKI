"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OllamaProvider = void 0;
const axios_1 = __importDefault(require("axios"));
const config_1 = require("../utils/config");
class OllamaProvider {
    async generate(prompt, context, signal) {
        const url = `${config_1.CONFIG.OLLAMA_HOST}/api/generate`;
        try {
            const response = await axios_1.default.post(url, {
                model: config_1.CONFIG.OLLAMA_MODEL,
                prompt: prompt,
                stream: false,
            }, {
                timeout: config_1.CONFIG.TIMEOUT,
                signal: signal
            });
            if (response.data && response.data.response) {
                return response.data.response;
            }
            throw new Error('Invalid response format from Ollama');
        }
        catch (error) {
            this.handleError(error);
            return '';
        }
    }
    async streamGenerate(prompt, onToken, signal) {
        const url = `${config_1.CONFIG.OLLAMA_HOST}/api/generate`;
        try {
            const response = await axios_1.default.post(url, {
                model: config_1.CONFIG.OLLAMA_MODEL,
                prompt: prompt,
                stream: true
            }, {
                responseType: 'stream',
                timeout: config_1.CONFIG.TIMEOUT,
                signal: signal
            });
            return new Promise((resolve, reject) => {
                let fullText = '';
                const stream = response.data;
                stream.on('data', (chunk) => {
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
                        }
                        catch (e) {
                            // ignore
                        }
                    }
                });
                stream.on('end', () => {
                    resolve(fullText);
                });
                stream.on('error', (err) => {
                    // If aborted, axios destroys stream with error
                    if (signal?.aborted) {
                        reject(new Error('Aborted'));
                    }
                    else {
                        reject(err);
                    }
                });
            });
        }
        catch (error) {
            // Axios throws CanceledError if aborted
            if (axios_1.default.isCancel(error)) {
                throw new Error('Request cancelled by user');
            }
            this.handleError(error);
            return '';
        }
    }
    async checkHealth() {
        try {
            await axios_1.default.get(config_1.CONFIG.OLLAMA_HOST, { timeout: 2000 });
            return true;
        }
        catch {
            return false;
        }
    }
    getName() {
        return `Ollama (${config_1.CONFIG.OLLAMA_MODEL})`;
    }
    handleError(error) {
        if (axios_1.default.isCancel(error)) {
            throw error;
        }
        if (axios_1.default.isAxiosError(error)) {
            if (error.code === 'ECONNREFUSED') {
                throw new Error(`Could not connect to Ollama at ${config_1.CONFIG.OLLAMA_HOST}. Is it running?`);
            }
            throw new Error(`Ollama API error: ${error.message}`);
        }
        throw error;
    }
}
exports.OllamaProvider = OllamaProvider;
