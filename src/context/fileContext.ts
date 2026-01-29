import fs from 'fs';
import path from 'path';
import { CONFIG } from '../utils/config';

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

function isTextFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return ALLOWED_EXTENSIONS.includes(ext);
}

function shouldIgnore(entryName: string): boolean {
    return IGNORED_DIRS.includes(entryName) || IGNORED_FILES.includes(entryName) || entryName.startsWith('.');
}

/**
 * Recursively reads files from a directory or reads a single file.
 */
function readPath(targetPath: string, gatheredContent: string[]): void {
    try {
        const stats = fs.statSync(targetPath);

        if (stats.isDirectory()) {
            const entries = fs.readdirSync(targetPath);
            for (const entry of entries) {
                if (shouldIgnore(entry)) continue;
                readPath(path.join(targetPath, entry), gatheredContent);
            }
        } else if (stats.isFile()) {
            if (isTextFile(targetPath) && !shouldIgnore(path.basename(targetPath))) {
                const content = fs.readFileSync(targetPath, 'utf-8');
                gatheredContent.push(`\n--- FILE: ${targetPath} ---\n${content}`);
            }
        }
    } catch (error) {
        // Ignore unreadable files
    }
}

/**
 * Loads context from provided file or directory paths.
 * Truncates if it exceeds the limit.
 */
export function loadFileContext(paths: string[]): string {
    const contentChunks: string[] = [];

    for (const p of paths) {
        const absPath = path.resolve(p);
        if (fs.existsSync(absPath)) {
            readPath(absPath, contentChunks);
        }
    }

    const fullContent = contentChunks.join('\n');

    if (fullContent.length > CONFIG.MAX_CONTEXT_CHARS) {
        return fullContent.substring(0, CONFIG.MAX_CONTEXT_CHARS) + '\n...[Context Truncated]...';
    }

    return fullContent;
}
