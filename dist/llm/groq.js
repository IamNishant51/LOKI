"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GroqProvider = void 0;
const axios_1 = __importDefault(require("axios"));
const config_1 = require("../utils/config");
class GroqProvider {
    async generate(prompt) {
        if (!config_1.CONFIG.GROQ_API_KEY) {
            throw new Error('GROQ_API_KEY is not set. Please set it in your environment to use Groq.');
        }
        try {
            const response = await axios_1.default.post(config_1.CONFIG.GROQ_API_URL, {
                model: config_1.CONFIG.GROQ_MODEL,
                messages: [
                    { role: 'user', content: prompt } // Groq expects chat format
                ]
            }, {
                headers: {
                    'Authorization': `Bearer ${config_1.CONFIG.GROQ_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: config_1.CONFIG.TIMEOUT
            });
            return response.data.choices[0].message.content;
        }
        catch (error) {
            if (axios_1.default.isAxiosError(error)) {
                throw new Error(`Groq API error: ${error.response?.data?.error?.message || error.message}`);
            }
            throw error;
        }
    }
    async checkHealth() {
        if (!config_1.CONFIG.GROQ_API_KEY)
            return false;
        // We can't easily ping without cost or auth, so we assume strictly key presence + superficial check
        return true;
    }
    getName() {
        return `Groq Cloud (${config_1.CONFIG.GROQ_MODEL})`;
    }
}
exports.GroqProvider = GroqProvider;
