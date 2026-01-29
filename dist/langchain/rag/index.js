"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalRAG = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
// @ts-ignore
const ollama_1 = require("@langchain/community/embeddings/ollama");
// @ts-ignore
const memory_1 = require("langchain/vectorstores/memory");
// @ts-ignore
const text_splitter_1 = require("langchain/text_splitter");
const config_1 = require("../../utils/config");
class LocalRAG {
    constructor() {
        this.vectorStore = null;
        // @ts-ignore
        this.embeddings = new ollama_1.OllamaEmbeddings({
            model: config_1.CONFIG.OLLAMA_EMBED_MODEL,
            baseUrl: config_1.CONFIG.OLLAMA_HOST,
        });
    }
    async indexRepo(cwd) {
        console.log(`[LangChain RAG] Indexing ${cwd}...`);
        const docs = this.loadDocuments(cwd);
        // @ts-ignore
        const splitter = new text_splitter_1.RecursiveCharacterTextSplitter({
            chunkSize: 1000,
            chunkOverlap: 200,
        });
        const chunks = await splitter.createDocuments(docs.map((d) => d.pageContent), docs.map((d) => d.metadata));
        // @ts-ignore
        this.vectorStore = await memory_1.MemoryVectorStore.fromDocuments(chunks, this.embeddings);
        console.log(`[LangChain RAG] Indexed ${chunks.length} chunks.`);
    }
    async query(question, k = 4) {
        if (!this.vectorStore)
            return "RAG not initialized. Run index first.";
        const results = await this.vectorStore.similaritySearch(question, k);
        return results.map((r) => `[${r.metadata.source}]: ${r.pageContent}`).join('\n\n');
    }
    loadDocuments(dir, fileList = []) {
        try {
            const files = fs_1.default.readdirSync(dir, { withFileTypes: true });
            const docs = [];
            for (const file of files) {
                if (file.isDirectory()) {
                    if (['node_modules', '.git', 'dist', 'out'].includes(file.name))
                        continue;
                    docs.push(...this.loadDocuments(path_1.default.join(dir, file.name)));
                }
                else {
                    if (['.ts', '.js', '.md', '.json'].includes(path_1.default.extname(file.name))) {
                        const content = fs_1.default.readFileSync(path_1.default.join(dir, file.name), 'utf-8');
                        docs.push({
                            pageContent: content,
                            metadata: { source: path_1.default.relative(process.cwd(), path_1.default.join(dir, file.name)) }
                        });
                    }
                }
            }
            return docs;
        }
        catch {
            return [];
        }
    }
}
exports.LocalRAG = LocalRAG;
