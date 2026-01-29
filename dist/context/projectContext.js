"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProjectContext = getProjectContext;
exports.formatProjectContext = formatProjectContext;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const gitTool_1 = require("../tools/gitTool");
function getDirectoryStructure(dir, depth = 0, maxDepth = 2) {
    if (depth > maxDepth)
        return '';
    try {
        const entries = fs_1.default.readdirSync(dir, { withFileTypes: true });
        const lines = [];
        for (const entry of entries) {
            if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist')
                continue;
            const indent = '  '.repeat(depth);
            if (entry.isDirectory()) {
                lines.push(`${indent}📂 ${entry.name}/`);
                lines.push(getDirectoryStructure(path_1.default.join(dir, entry.name), depth + 1, maxDepth));
            }
            else {
                // Only show key files at top level or if small
                if (depth === 0 || ['.json', '.md', '.ts', '.js'].includes(path_1.default.extname(entry.name))) {
                    lines.push(`${indent}📄 ${entry.name}`);
                }
            }
        }
        return lines.join('\n');
    }
    catch {
        return '';
    }
}
function getProjectContext(cwd = process.cwd()) {
    const summary = {
        name: path_1.default.basename(cwd),
        isGit: (0, gitTool_1.isGitRepo)(cwd),
        gitStatus: 'N/A',
        structure: getDirectoryStructure(cwd),
    };
    if (summary.isGit) {
        summary.gitStatus = (0, gitTool_1.getGitStatus)(cwd);
    }
    const pkgPath = path_1.default.join(cwd, 'package.json');
    if (fs_1.default.existsSync(pkgPath)) {
        try {
            const pkg = JSON.parse(fs_1.default.readFileSync(pkgPath, 'utf-8'));
            summary.packageJson = {
                name: pkg.name,
                version: pkg.version,
                scripts: pkg.scripts,
                dependencies: pkg.dependencies ? Object.keys(pkg.dependencies) : [],
            };
        }
        catch { }
    }
    const readmePath = path_1.default.join(cwd, 'README.md');
    if (fs_1.default.existsSync(readmePath)) {
        const content = fs_1.default.readFileSync(readmePath, 'utf-8');
        summary.readmePreview = content.substring(0, 500).replace(/\n/g, ' ') + '...';
    }
    return summary;
}
function formatProjectContext(ctx) {
    return `
PROJECT CONTEXT:
- Name: ${ctx.name}
- Git: ${ctx.isGit ? 'Yes' : 'No'}
- Git Status: ${ctx.gitStatus ? ctx.gitStatus.substring(0, 100).replace(/\n/g, ', ') : 'Clean'}
- Structure:
${ctx.structure}
- Package: ${ctx.packageJson ? JSON.stringify(ctx.packageJson, null, 2) : 'N/A'}
- Readme: ${ctx.readmePreview || 'N/A'}
    `.trim();
}
