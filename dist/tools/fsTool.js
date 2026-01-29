"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listFiles = listFiles;
exports.readFile = readFile;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
/**
 * File system tool for read-only access.
 */
// Safety blocks
const IGNORED_DIRS = ['node_modules', '.git', 'dist', 'out', '.idea', '.vscode'];
const BINARY_EXTS = ['.png', '.jpg', '.jpeg', '.exe', '.bin', '.dll', '.so', '.dylib', '.zip', '.tar', '.gz'];
// Helper to determine safety
function isSafePath(targetPath) {
    // Resolve absolute path
    const resolved = path_1.default.resolve(targetPath);
    // Basic check: must ensure we don't go outside legitimate boundaries?
    // For a local assistant, user has full access, but we should block sensitive dirs if possible.
    // For now, we trust the local user but block binary/junk folders.
    return true;
}
function listFiles(targetPath = '.') {
    try {
        if (!fs_1.default.existsSync(targetPath))
            return ["Path does not exist."];
        const stats = fs_1.default.statSync(targetPath);
        if (!stats.isDirectory())
            return ["Path is not a directory."];
        const entries = fs_1.default.readdirSync(targetPath);
        // Filter ignored
        const filtered = entries.filter(e => !IGNORED_DIRS.includes(e));
        // Sort: directories first, then files
        const dirs = filtered.filter(e => fs_1.default.statSync(path_1.default.join(targetPath, e)).isDirectory());
        const files = filtered.filter(e => !fs_1.default.statSync(path_1.default.join(targetPath, e)).isDirectory());
        return [...dirs.map(d => `${d}/`), ...files];
    }
    catch (e) {
        return [`Error listing files: ${e.message}`];
    }
}
function readFile(targetPath) {
    try {
        if (!fs_1.default.existsSync(targetPath))
            return "File does not exist.";
        const stats = fs_1.default.statSync(targetPath);
        if (stats.isDirectory())
            return "Target is a directory, not a file.";
        const ext = path_1.default.extname(targetPath).toLowerCase();
        if (BINARY_EXTS.includes(ext))
            return "Binary file detected. Cannot read text content.";
        return fs_1.default.readFileSync(targetPath, 'utf-8');
    }
    catch (e) {
        return `Error reading file: ${e.message}`;
    }
}
