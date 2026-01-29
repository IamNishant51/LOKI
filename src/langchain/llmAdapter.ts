import { SimpleChatModel } from '@langchain/core/language_models/chat_models';
import { BaseMessage, AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import { LLMProvider } from '../llm/types';
import { getProvider } from '../llm/providerFactory';
import { CONFIG } from '../utils/config';

export class LokiChatModel extends SimpleChatModel {
    private providerName: string;
    private provider: LLMProvider;

    constructor(fields?: { providerName?: string }) {
        super({});
        this.providerName = fields?.providerName || CONFIG.DEFAULT_PROVIDER;
        this.provider = getProvider(this.providerName);
    }

    _llmType(): string {
        return 'loki_chat_model';
    }

    async _call(
        messages: BaseMessage[],
        options: any,
        runManager?: CallbackManagerForLLMRun
    ): Promise<string> {
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
    private messagesToPrompt(messages: BaseMessage[]): string {
        return messages.map(m => {
            if (m._getType() === 'system') return `System: ${m.content}\n`;
            if (m._getType() === 'human') return `User: ${m.content}\n`;
            if (m._getType() === 'ai') return `Assistant: ${m.content}\n`;
            return `${m.content}\n`;
        }).join('\n') + "\nAssistant:";
    }
}
