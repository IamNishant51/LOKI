import fs from 'fs';
import path from 'path';
import { isGitRepo, getGitStatus } from '../tools/gitTool';

export interface ProjectSummary {
    name: string;
    isGit: boolean;
    gitStatus: string;
    structure: string;
    packageJson?: any;
    readmePreview?: string;
}

function getDirectoryStructure(dir: string, depth: number = 0, maxDepth: number = 2): string {
    if (depth > maxDepth) return '';

    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        const lines: string[] = [];

        for (const entry of entries) {
            if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue;

            const indent = '  '.repeat(depth);
            if (entry.isDirectory()) {
                lines.push(`${indent}📂 ${entry.name}/`);
                lines.push(getDirectoryStructure(path.join(dir, entry.name), depth + 1, maxDepth));
            } else {
                // Only show key files at top level or if small
                if (depth === 0 || ['.json', '.md', '.ts', '.js'].includes(path.extname(entry.name))) {
                    lines.push(`${indent}📄 ${entry.name}`);
                }
            }
        }
        return lines.join('\n');
    } catch {
        return '';
    }
}

export function getProjectContext(cwd: string = process.cwd()): ProjectSummary {
    const summary: ProjectSummary = {
        name: path.basename(cwd),
        isGit: isGitRepo(cwd),
        gitStatus: 'N/A',
        structure: getDirectoryStructure(cwd),
    };

    if (summary.isGit) {
        summary.gitStatus = getGitStatus(cwd);
    }

    const pkgPath = path.join(cwd, 'package.json');
    if (fs.existsSync(pkgPath)) {
        try {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
            summary.packageJson = {
                name: pkg.name,
                version: pkg.version,
                scripts: pkg.scripts,
                dependencies: pkg.dependencies ? Object.keys(pkg.dependencies) : [],
            };
        } catch { }
    }

    const readmePath = path.join(cwd, 'README.md');
    if (fs.existsSync(readmePath)) {
        const content = fs.readFileSync(readmePath, 'utf-8');
        summary.readmePreview = content.substring(0, 500).replace(/\n/g, ' ') + '...';
    }

    return summary;
}

export function formatProjectContext(ctx: ProjectSummary): string {
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
