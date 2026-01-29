"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProvider = getProvider;
const ollama_1 = require("./ollama");
const groq_1 = require("./groq");
const config_1 = require("../utils/config");
function getProvider(requestedProvider) {
    const providerKey = (requestedProvider || config_1.CONFIG.DEFAULT_PROVIDER).toLowerCase();
    if (providerKey === 'groq') {
        return new groq_1.GroqProvider();
    }
    // Default to Ollama
    return new ollama_1.OllamaProvider();
}
