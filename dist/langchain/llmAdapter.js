"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LokiChatModel = void 0;
const chat_models_1 = require("@langchain/core/language_models/chat_models");
const providerFactory_1 = require("../llm/providerFactory");
const config_1 = require("../utils/config");
class LokiChatModel extends chat_models_1.SimpleChatModel {
    constructor(fields) {
        super({});
        this.providerName = fields?.providerName || config_1.CONFIG.DEFAULT_PROVIDER;
        this.provider = (0, providerFactory_1.getProvider)(this.providerName);
    }
    _llmType() {
        return 'loki_chat_model';
    }
    async _call(messages, options, runManager) {
        const prompt = this.messagesToPrompt(messages);
        if (this.provider.streamGenerate) {
            // If provider supports streaming, we should probably prefer _stream 
            // but SimpleChatModel logic separates them.
            // However, if we are just calling generates, we can assume non-stream here 
            // or we can consume the stream and concatenate.
            // Let's just use generate for _call.
        }
        // We pass an abort signal if runManager has one? 
        // runManager doesn't expose signal directly usually, but it's in options usually.
        // For MVP, simple call.
        return await this.provider.generate(prompt);
    }
    // Helper to convert LangChain messages to a single string prompt
    // Since our providers currently expect a string string (Mistral style usually).
    messagesToPrompt(messages) {
        return messages.map(m => {
            if (m._getType() === 'system')
                return `System: ${m.content}\n`;
            if (m._getType() === 'human')
                return `User: ${m.content}\n`;
            if (m._getType() === 'ai')
                return `Assistant: ${m.content}\n`;
            return `${m.content}\n`;
        }).join('\n') + "\nAssistant:";
    }
}
exports.LokiChatModel = LokiChatModel;
