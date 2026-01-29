import fs from 'fs';
import path from 'path';

// @ts-ignore
import { OllamaEmbeddings } from "@langchain/community/embeddings/ollama";
// @ts-ignore
import { MemoryVectorStore } from "langchain/vectorstores/memory";
// @ts-ignore
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
// @ts-ignore
import { Document } from "@langchain/core/documents";

import { CONFIG } from '../../utils/config';

export class LocalRAG {
    private vectorStore: any = null;
    private embeddings: any;

    constructor() {
        // @ts-ignore
        this.embeddings = new OllamaEmbeddings({
            model: CONFIG.OLLAMA_EMBED_MODEL,
            baseUrl: CONFIG.OLLAMA_HOST,
        });
    }

    async indexRepo(cwd: string) {
        console.log(`[LangChain RAG] Indexing ${cwd}...`);

        const docs = this.loadDocuments(cwd);

        // @ts-ignore
        const splitter = new RecursiveCharacterTextSplitter({
            chunkSize: 1000,
            chunkOverlap: 200,
        });
        const chunks = await splitter.createDocuments(
            docs.map((d: any) => d.pageContent),
            docs.map((d: any) => d.metadata)
        );

        // @ts-ignore
        this.vectorStore = await MemoryVectorStore.fromDocuments(
            chunks,
            this.embeddings
        );

        console.log(`[LangChain RAG] Indexed ${chunks.length} chunks.`);
    }

    async query(question: string, k = 4): Promise<string> {
        if (!this.vectorStore) return "RAG not initialized. Run index first.";

        const results = await this.vectorStore.similaritySearch(question, k);
        return results.map((r: any) => `[${r.metadata.source}]: ${r.pageContent}`).join('\n\n');
    }

    private loadDocuments(dir: string, fileList: any[] = []): any[] {
        try {
            const files = fs.readdirSync(dir, { withFileTypes: true });
            const docs: { pageContent: string, metadata: any }[] = [];

            for (const file of files) {
                if (file.isDirectory()) {
                    if (['node_modules', '.git', 'dist', 'out'].includes(file.name)) continue;
                    docs.push(...this.loadDocuments(path.join(dir, file.name)));
                } else {
                    if (['.ts', '.js', '.md', '.json'].includes(path.extname(file.name))) {
                        const content = fs.readFileSync(path.join(dir, file.name), 'utf-8');
                        docs.push({
                            pageContent: content,
                            metadata: { source: path.relative(process.cwd(), path.join(dir, file.name)) }
                        });
                    }
                }
            }
            return docs;
        } catch {
            return [];
        }
    }
}
