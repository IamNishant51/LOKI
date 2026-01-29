"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.indexRepository = indexRepository;
exports.retrieveContext = retrieveContext;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const config_1 = require("../utils/config");
const semanticStore_1 = require("../memory/semanticStore");
// Local RAG Store Path
const RAG_DIR = path_1.default.join(config_1.CONFIG.CONFIG_DIR, 'rag');
function getRepoHash(cwd) {
    return crypto_1.default.createHash('md5').update(cwd).digest('hex');
}
function getRepoIndexDir(cwd) {
    return path_1.default.join(RAG_DIR, getRepoHash(cwd));
}
// Simple heuristic to find source files
function findSourceFiles(dir, fileList = []) {
    const files = fs_1.default.readdirSync(dir, { withFileTypes: true });
    for (const file of files) {
        if (file.isDirectory()) {
            if (['node_modules', '.git', 'dist', 'out', 'build'].includes(file.name))
                continue;
            findSourceFiles(path_1.default.join(dir, file.name), fileList);
        }
        else {
            if (['.ts', '.js', '.md', '.json'].includes(path_1.default.extname(file.name))) {
                fileList.push(path_1.default.join(dir, file.name));
            }
        }
    }
    return fileList;
}
async function indexRepository(cwd = process.cwd()) {
    const indexDir = getRepoIndexDir(cwd);
    // Check if already indexed (simple existence check for now)
    // Real implementation would check timestamps
    if (fs_1.default.existsSync(indexDir)) {
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
            const content = fs_1.default.readFileSync(f, 'utf-8');
            // Chunking would go here. For now, we take whole file if small, or truncate.
            // Limit to ~2k chars for embedding
            const chunk = content.substring(0, 2000);
            // Artificial metadata injection for retrieval filtering
            // Note: Our current retrieveRelevantMemory doesn't support metadata filtering yet.
            // We accepted this limitation for the MVP.
            // We just store it.
            await (0, semanticStore_1.storeSemanticMemory)(chunk, `file:${path_1.default.relative(cwd, f)}`);
            if (count++ > 50)
                break; // Safety limit
            process.stdout.write('.');
        }
        catch { }
    }
    console.log(`\n[RAG] Indexed ${count} files.`);
    // Mark as indexed
    fs_1.default.mkdirSync(indexDir, { recursive: true });
}
async function retrieveContext(query, cwd = process.cwd()) {
    // Just leverage the global semantic store for now.
    // It will return chat memories AND file memories.
    const results = await (0, semanticStore_1.retrieveRelevantMemory)(query, 3);
    return results.join('\n');
}
