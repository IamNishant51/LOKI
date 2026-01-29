"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.storeSemanticMemory = storeSemanticMemory;
exports.retrieveRelevantMemory = retrieveRelevantMemory;
const fs_1 = __importDefault(require("fs"));
const axios_1 = __importDefault(require("axios"));
const config_1 = require("../utils/config");
// Simple cosine similarity
function cosineSimilarity(vecA, vecB) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
async function getEmbedding(text) {
    try {
        const response = await axios_1.default.post(`${config_1.CONFIG.OLLAMA_HOST}/api/embeddings`, {
            model: config_1.CONFIG.OLLAMA_EMBED_MODEL,
            prompt: text,
        });
        return response.data.embedding;
    }
    catch (e) {
        // console.error("Error getting embedding:", e);
        return [];
    }
}
function ensureDir() {
    if (!fs_1.default.existsSync(config_1.CONFIG.SEMANTIC_MEMORY_DIR)) {
        fs_1.default.mkdirSync(config_1.CONFIG.SEMANTIC_MEMORY_DIR, { recursive: true });
    }
}
function loadIndex() {
    try {
        ensureDir();
        if (!fs_1.default.existsSync(config_1.CONFIG.SEMANTIC_INDEX_FILE))
            return [];
        return JSON.parse(fs_1.default.readFileSync(config_1.CONFIG.SEMANTIC_INDEX_FILE, 'utf-8'));
    }
    catch {
        return [];
    }
}
function saveIndex(index) {
    ensureDir();
    fs_1.default.writeFileSync(config_1.CONFIG.SEMANTIC_INDEX_FILE, JSON.stringify(index, null, 2));
}
async function storeSemanticMemory(content, source = 'chat') {
    if (!content || content.length < 10)
        return; // Ignore noise
    // Check if Ollama is embedding-capable
    const embedding = await getEmbedding(content);
    if (!embedding || embedding.length === 0)
        return;
    const index = loadIndex();
    const entry = {
        id: Math.random().toString(36).substring(7),
        content,
        embedding,
        metadata: {
            source,
            timestamp: new Date().toISOString()
        }
    };
    index.push(entry);
    saveIndex(index);
}
async function retrieveRelevantMemory(query, topK = 5) {
    const queryEmbedding = await getEmbedding(query);
    if (!queryEmbedding || queryEmbedding.length === 0)
        return [];
    const index = loadIndex();
    const scored = index.map(entry => ({
        entry,
        score: cosineSimilarity(queryEmbedding, entry.embedding)
    }));
    // Filter and sort
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK).map(s => `[Memory: ${s.entry.metadata.timestamp}] ${s.entry.content}`);
}
