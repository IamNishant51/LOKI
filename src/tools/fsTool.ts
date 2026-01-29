import fs from 'fs';
import path from 'path';

/**
 * File system tool for read-only access.
 */

// Safety blocks
const IGNORED_DIRS = ['node_modules', '.git', 'dist', 'out', '.idea', '.vscode'];
const BINARY_EXTS = ['.png', '.jpg', '.jpeg', '.exe', '.bin', '.dll', '.so', '.dylib', '.zip', '.tar', '.gz'];

// Helper to determine safety
function isSafePath(targetPath: string): boolean {
    // Resolve absolute path
    const resolved = path.resolve(targetPath);
    // Basic check: must ensure we don't go outside legitimate boundaries?
    // For a local assistant, user has full access, but we should block sensitive dirs if possible.
    // For now, we trust the local user but block binary/junk folders.
    return true;
}

export function listFiles(targetPath: string = '.'): string[] {
    try {
        if (!fs.existsSync(targetPath)) return ["Path does not exist."];

        const stats = fs.statSync(targetPath);
        if (!stats.isDirectory()) return ["Path is not a directory."];

        const entries = fs.readdirSync(targetPath);

        // Filter ignored
        const filtered = entries.filter(e => !IGNORED_DIRS.includes(e));

        // Sort: directories first, then files
        const dirs = filtered.filter(e => fs.statSync(path.join(targetPath, e)).isDirectory());
        const files = filtered.filter(e => !fs.statSync(path.join(targetPath, e)).isDirectory());

        return [...dirs.map(d => `${d}/`), ...files];
    } catch (e: any) {
        return [`Error listing files: ${e.message}`];
    }
}

export function readFile(targetPath: string): string {
    try {
        if (!fs.existsSync(targetPath)) return "File does not exist.";

        const stats = fs.statSync(targetPath);
        if (stats.isDirectory()) return "Target is a directory, not a file.";

        const ext = path.extname(targetPath).toLowerCase();
        if (BINARY_EXTS.includes(ext)) return "Binary file detected. Cannot read text content.";

        return fs.readFileSync(targetPath, 'utf-8');
    } catch (e: any) {
        return `Error reading file: ${e.message}`;
    }
}
