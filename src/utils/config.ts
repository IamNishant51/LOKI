import dotenv from 'dotenv';
import path from 'path';
import os from 'os';

// Load environment variables
dotenv.config();

const HOME_DIR = os.homedir();
const CONFIG_DIR = path.join(HOME_DIR, '.loki');

export const CONFIG = {
    // App Info
    APP_NAME: 'Loki',
    VERSION: '1.2.0',
    CONFIG_DIR,
    MEMORY_FILE: path.join(CONFIG_DIR, 'memory.json'),
    SEMANTIC_MEMORY_DIR: path.join(CONFIG_DIR, 'semantic-memory'),
    SEMANTIC_INDEX_FILE: path.join(CONFIG_DIR, 'semantic-memory', 'index.json'),

    // LLM Defaults
    DEFAULT_PROVIDER: 'ollama',

    // Ollama
    OLLAMA_HOST: process.env.OLLAMA_HOST || 'http://localhost:11434',
    OLLAMA_MODEL: process.env.OLLAMA_MODEL || 'mistral:7b',
    OLLAMA_EMBED_MODEL: process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text',

    // Groq
    GROQ_API_KEY: process.env.GROQ_API_KEY,
    GROQ_MODEL: 'llama-3.1-8b-instant',
    GROQ_API_URL: 'https://api.groq.com/openai/v1/chat/completions',

    // Limits
    MAX_MEMORY_ITEMS: 20,
    MAX_SEMANTIC_RESULTS: 5,
    MAX_CONTEXT_CHARS: 6000,
    TIMEOUT: 60000,

    // Feature Flags (Optional Engines)
    USE_LANGCHAIN: process.env.USE_LANGCHAIN === 'true',
    USE_LANGGRAPH: process.env.USE_LANGGRAPH === 'true',

    // WhatsApp
    WHATSAPP_TOKEN: process.env.WHATSAPP_TOKEN,
    WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID,
    WHATSAPP_VERIFY_TOKEN: process.env.WHATSAPP_VERIFY_TOKEN || 'loki_secure_verify',
    WHATSAPP_PORT: parseInt(process.env.WHATSAPP_PORT || '3000'),
};
