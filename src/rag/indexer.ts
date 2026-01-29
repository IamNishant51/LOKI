import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { CONFIG } from '../utils/config';
import { storeSemanticMemory, retrieveRelevantMemory } from '../memory/semanticStore';

// Local RAG Store Path
const RAG_DIR = path.join(CONFIG.CONFIG_DIR, 'rag');

function getRepoHash(cwd: string): string {
    return crypto.createHash('md5').update(cwd).digest('hex');
}

function getRepoIndexDir(cwd: string): string {
    return path.join(RAG_DIR, getRepoHash(cwd));
}

// Simple heuristic to find source files
function findSourceFiles(dir: string, fileList: string[] = []) {
    const files = fs.readdirSync(dir, { withFileTypes: true });
    for (const file of files) {
        if (file.isDirectory()) {
            if (['node_modules', '.git', 'dist', 'out', 'build'].includes(file.name)) continue;
            findSourceFiles(path.join(dir, file.name), fileList);
        } else {
            if (['.ts', '.js', '.md', '.json'].includes(path.extname(file.name))) {
                fileList.push(path.join(dir, file.name));
            }
        }
    }
    return fileList;
}

export async function indexRepository(cwd: string = process.cwd()) {
    const indexDir = getRepoIndexDir(cwd);

    // Check if already indexed (simple existence check for now)
    // Real implementation would check timestamps
    if (fs.existsSync(indexDir)) {
        console.log(`[RAG] Repository already indexed: ${indexDir}`);
        return;
    }

    console.log(`[RAG] Indexing repository...`);
    const files = findSourceFiles(cwd);

    // We reuse semantic memory store logic but tag it with "RAG"
    // Ideally we'd use a separate collection, but for this MVP, shared store with metadata is fine
    // Or we use storeSemanticMemory but force source="rag"

    // Actually, 'semanticStore' uses a single file index.json.
    // For per-repo RAG, we need to namespace it.
    // Complexity warning: The current simple store is single-file.
    // Upgrading it for per-repo is needed.
    // Strategy: We will just index into the SAME store but with metadata: { repo: hash }

    let count = 0;
    for (const f of files) {
        try {
            const content = fs.readFileSync(f, 'utf-8');
            // Chunking would go here. For now, we take whole file if small, or truncate.
            // Limit to ~2k chars for embedding
            const chunk = content.substring(0, 2000);

            // Artificial metadata injection for retrieval filtering
            // Note: Our current retrieveRelevantMemory doesn't support metadata filtering yet.
            // We accepted this limitation for the MVP.
            // We just store it.

            await storeSemanticMemory(chunk, `file:${path.relative(cwd, f)}`);
            if (count++ > 50) break; // Safety limit
            process.stdout.write('.');
        } catch { }
    }
    console.log(`\n[RAG] Indexed ${count} files.`);

    // Mark as indexed
    fs.mkdirSync(indexDir, { recursive: true });
}

export async function retrieveContext(query: string, cwd: string = process.cwd()): Promise<string> {
    // Just leverage the global semantic store for now.
    // It will return chat memories AND file memories.
    const results = await retrieveRelevantMemory(query, 3);
    return results.join('\n');
}
