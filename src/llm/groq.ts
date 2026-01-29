import axios from 'axios';
import { CONFIG } from '../utils/config';
import { LLMProvider } from './types';

export class GroqProvider implements LLMProvider {
    async generate(prompt: string): Promise<string> {
        if (!CONFIG.GROQ_API_KEY) {
            throw new Error('GROQ_API_KEY is not set. Please set it in your environment to use Groq.');
        }

        try {
            const response = await axios.post(
                CONFIG.GROQ_API_URL,
                {
                    model: CONFIG.GROQ_MODEL,
                    messages: [
                        { role: 'user', content: prompt } // Groq expects chat format
                    ]
                },
                {
                    headers: {
                        'Authorization': `Bearer ${CONFIG.GROQ_API_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: CONFIG.TIMEOUT
                }
            );

            return response.data.choices[0].message.content;
        } catch (error: any) {
            if (axios.isAxiosError(error)) {
                throw new Error(`Groq API error: ${error.response?.data?.error?.message || error.message}`);
            }
            throw error;
        }
    }

    async checkHealth(): Promise<boolean> {
        if (!CONFIG.GROQ_API_KEY) return false;
        // We can't easily ping without cost or auth, so we assume strictly key presence + superficial check
        return true;
    }

    getName(): string {
        return `Groq Cloud (${CONFIG.GROQ_MODEL})`;
    }
}
