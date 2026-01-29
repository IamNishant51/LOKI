export interface LLMProvider {
    /**
     * Generates a response from the LLM.
     */
    generate(prompt: string, context?: string, signal?: AbortSignal): Promise<string>;

    /**
     * Generates a streaming response.
     * @param onToken Callback for each token received
     */
    streamGenerate?(prompt: string, onToken: (token: string) => void, signal?: AbortSignal): Promise<string>;

    /**
     * Returns the name of the provider.
     */
    getName(): string;

    /**
     * Checks if the provider is healthy/ready.
     */
    checkHealth(): Promise<boolean>;
}
