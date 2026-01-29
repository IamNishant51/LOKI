"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadFileContext = loadFileContext;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const config_1 = require("../utils/config");
/**
 * allowed extensions for text context.
 */
const ALLOWED_EXTENSIONS = [
    '.ts', '.js', '.json', '.md', '.txt', '.html', '.css', '.py', '.java', '.c', '.cpp', '.h', '.go', '.rs', '.yml', '.yaml', '.sh'
];
/**
 * Directories to ignore.
 */
const IGNORED_DIRS = [
    'node_modules', '.git', 'dist', 'build', 'out', 'bin', '.idea', '.vscode', 'coverage'
];
/**
 * files to ignore.
 */
const IGNORED_FILES = [
    'package-lock.json', 'yarn.lock', '.DS_Store'
];
function isTextFile(filePath) {
    const ext = path_1.default.extname(filePath).toLowerCase();
    return ALLOWED_EXTENSIONS.includes(ext);
}
function shouldIgnore(entryName) {
    return IGNORED_DIRS.includes(entryName) || IGNORED_FILES.includes(entryName) || entryName.startsWith('.');
}
/**
 * Recursively reads files from a directory or reads a single file.
 */
function readPath(targetPath, gatheredContent) {
    try {
        const stats = fs_1.default.statSync(targetPath);
        if (stats.isDirectory()) {
            const entries = fs_1.default.readdirSync(targetPath);
            for (const entry of entries) {
                if (shouldIgnore(entry))
                    continue;
                readPath(path_1.default.join(targetPath, entry), gatheredContent);
            }
        }
        else if (stats.isFile()) {
            if (isTextFile(targetPath) && !shouldIgnore(path_1.default.basename(targetPath))) {
                const content = fs_1.default.readFileSync(targetPath, 'utf-8');
                gatheredContent.push(`\n--- FILE: ${targetPath} ---\n${content}`);
            }
        }
    }
    catch (error) {
        // Ignore unreadable files
    }
}
/**
 * Loads context from provided file or directory paths.
 * Truncates if it exceeds the limit.
 */
function loadFileContext(paths) {
    const contentChunks = [];
    for (const p of paths) {
        const absPath = path_1.default.resolve(p);
        if (fs_1.default.existsSync(absPath)) {
            readPath(absPath, contentChunks);
        }
    }
    const fullContent = contentChunks.join('\n');
    if (fullContent.length > config_1.CONFIG.MAX_CONTEXT_CHARS) {
        return fullContent.substring(0, config_1.CONFIG.MAX_CONTEXT_CHARS) + '\n...[Context Truncated]...';
    }
    return fullContent;
}
