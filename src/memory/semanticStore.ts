import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { CONFIG } from '../utils/config';

export interface SemanticMemoryEntry {
    id: string;
    content: string;
    embedding: number[];
    metadata: {
        source: string;
        timestamp: string;
    };
}

// Simple cosine similarity
function cosineSimilarity(vecA: number[], vecB: number[]): number {
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

async function getEmbedding(text: string): Promise<number[]> {
    try {
        const response = await axios.post(`${CONFIG.OLLAMA_HOST}/api/embeddings`, {
            model: CONFIG.OLLAMA_EMBED_MODEL,
            prompt: text,
        });
        return response.data.embedding;
    } catch (e) {
        // console.error("Error getting embedding:", e);
        return [];
    }
}

function ensureDir() {
    if (!fs.existsSync(CONFIG.SEMANTIC_MEMORY_DIR)) {
        fs.mkdirSync(CONFIG.SEMANTIC_MEMORY_DIR, { recursive: true });
    }
}

function loadIndex(): SemanticMemoryEntry[] {
    try {
        ensureDir();
        if (!fs.existsSync(CONFIG.SEMANTIC_INDEX_FILE)) return [];
        return JSON.parse(fs.readFileSync(CONFIG.SEMANTIC_INDEX_FILE, 'utf-8'));
    } catch {
        return [];
    }
}

function saveIndex(index: SemanticMemoryEntry[]) {
    ensureDir();
    fs.writeFileSync(CONFIG.SEMANTIC_INDEX_FILE, JSON.stringify(index, null, 2));
}

export async function storeSemanticMemory(content: string, source: string = 'chat') {
    if (!content || content.length < 10) return; // Ignore noise

    // Check if Ollama is embedding-capable
    const embedding = await getEmbedding(content);
    if (!embedding || embedding.length === 0) return;

    const index = loadIndex();
    const entry: SemanticMemoryEntry = {
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

export async function retrieveRelevantMemory(query: string, topK: number = 5): Promise<string[]> {
    const queryEmbedding = await getEmbedding(query);
    if (!queryEmbedding || queryEmbedding.length === 0) return [];

    const index = loadIndex();

    const scored = index.map(entry => ({
        entry,
        score: cosineSimilarity(queryEmbedding, entry.embedding)
    }));

    // Filter and sort
    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, topK).map(s => `[Memory: ${s.entry.metadata.timestamp}] ${s.entry.content}`);
}
