import { LLMProvider } from './types';
import { OllamaProvider } from './ollama';
import { GroqProvider } from './groq';
import { CONFIG } from '../utils/config';

export function getProvider(requestedProvider?: string): LLMProvider {
    const providerKey = (requestedProvider || CONFIG.DEFAULT_PROVIDER).toLowerCase();

    if (providerKey === 'groq') {
        return new GroqProvider();
    }

    // Default to Ollama
    return new OllamaProvider();
}
