/**
 * tools.ts - Production-Grade Tool System
 * 
 * Complete tool implementation matching GitHub Copilot's capabilities:
 * - File Operations: read, write, edit, list, create directory
 * - Search: file search, text search, symbol search
 * - Editor: selection, problems, changes
 * - Terminal: run commands, get output
 * - Web: search internet, fetch pages
 * - Codebase: workspace analysis, context gathering
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// ============== TYPES ==============

export interface ToolResult {
    success: boolean;
    result: string;
    error?: string;
}

export interface Tool {
    name: string;
    description: string;
    parameters?: string;
    execute: (args: any, onProgress?: (msg: string) => void) => Promise<ToolResult>;
}

// ============== HELPER FUNCTIONS ==============

function getWorkspaceRoot(): string {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
}

function resolvePath(filePath: string): string {
    const root = getWorkspaceRoot();
    return path.isAbsolute(filePath) ? filePath : path.join(root, filePath);
}

// ============== FILE OPERATION TOOLS ==============

const readFileTool: Tool = {
    name: 'readFile',
    description: 'Read contents of a file',
    parameters: '{"path": "file path"}',
    execute: async (args: { path: string }) => {
        try {
            const fullPath = resolvePath(args.path);
            if (!fs.existsSync(fullPath)) {
                return { success: false, result: '', error: `File not found: ${args.path}` };
            }
            const stats = fs.statSync(fullPath);
            if (stats.size > 100000) {
                return { success: false, result: '', error: `File too large (${Math.round(stats.size / 1024)}KB). Read specific sections.` };
            }
            const content = fs.readFileSync(fullPath, 'utf-8');
            return {
                success: true,
                result: `File: ${args.path} (${content.split('\n').length} lines)\n\`\`\`\n${content}\n\`\`\``
            };
        } catch (e: any) {
            return { success: false, result: '', error: e.message };
        }
    }
};

const writeFileTool: Tool = {
    name: 'writeFile',
    description: 'Create or overwrite a file with content',
    parameters: '{"path": "file path", "content": "file content"}',
    execute: async (args: { path: string; content: string }, onProgress?) => {
        try {
            onProgress?.(`Writing ${args.path}...`);

            const fullPath = resolvePath(args.path);
            const dir = path.dirname(fullPath);

            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            // Backup if exists
            if (fs.existsSync(fullPath)) {
                const backupDir = path.join(getWorkspaceRoot(), '.loki-backups');
                if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
                const ts = Date.now();
                fs.copyFileSync(fullPath, path.join(backupDir, `${path.basename(fullPath)}.${ts}.bak`));
            }

            fs.writeFileSync(fullPath, args.content, 'utf-8');

            // Open in editor
            const doc = await vscode.workspace.openTextDocument(fullPath);
            await vscode.window.showTextDocument(doc, { preview: false });

            return {
                success: true,
                result: `✅ Created ${args.path} (${args.content.split('\n').length} lines)`
            };
        } catch (e: any) {
            return { success: false, result: '', error: e.message };
        }
    }
};

const editFileTool: Tool = {
    name: 'editFile',
    description: 'Edit part of a file by replacing search text with replacement',
    parameters: '{"path": "file path", "search": "text to find", "replace": "replacement text"}',
    execute: async (args: { path: string; search: string; replace: string }, onProgress?) => {
        try {
            onProgress?.(`Editing ${args.path}...`);

            const fullPath = resolvePath(args.path);
            if (!fs.existsSync(fullPath)) {
                return { success: false, result: '', error: `File not found: ${args.path}` };
            }

            let content = fs.readFileSync(fullPath, 'utf-8');

            if (!content.includes(args.search)) {
                // Try fuzzy match - normalize whitespace
                const normalizedSearch = args.search.replace(/\s+/g, ' ').trim();
                const normalizedContent = content.replace(/\s+/g, ' ');
                if (!normalizedContent.includes(normalizedSearch)) {
                    return {
                        success: false,
                        result: '',
                        error: `Search text not found in ${args.path}. Try reading the file first.`
                    };
                }
            }

            // Backup
            const backupDir = path.join(getWorkspaceRoot(), '.loki-backups');
            if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
            const ts = Date.now();
            fs.copyFileSync(fullPath, path.join(backupDir, `${path.basename(fullPath)}.${ts}.bak`));

            content = content.replace(args.search, args.replace);
            fs.writeFileSync(fullPath, content, 'utf-8');

            return { success: true, result: `✅ Edited ${args.path}` };
        } catch (e: any) {
            return { success: false, result: '', error: e.message };
        }
    }
};

const listDirectoryTool: Tool = {
    name: 'listDirectory',
    description: 'List files and directories in a path',
    parameters: '{"path": "directory path (optional, defaults to root)"}',
    execute: async (args: { path?: string }) => {
        try {
            const fullPath = resolvePath(args.path || '.');
            const ignored = new Set(['.git', 'node_modules', 'dist', 'out', '.loki-backups', '.vscode', '__pycache__', '.next', 'coverage']);

            function listRecursive(dir: string, prefix: string = '', depth: number = 0): string[] {
                if (depth > 2) return [`${prefix}...`];
                const results: string[] = [];
                const entries = fs.readdirSync(dir, { withFileTypes: true });

                for (const entry of entries) {
                    if (ignored.has(entry.name) || entry.name.startsWith('.')) continue;
                    const icon = entry.isDirectory() ? '📁' : '📄';
                    results.push(`${prefix}${icon} ${entry.name}`);

                    if (entry.isDirectory() && depth < 2) {
                        const subResults = listRecursive(path.join(dir, entry.name), prefix + '  ', depth + 1);
                        results.push(...subResults.slice(0, 5));
                        if (subResults.length > 5) results.push(`${prefix}  ... and ${subResults.length - 5} more`);
                    }
                }
                return results;
            }

            const results = listRecursive(fullPath);
            return {
                success: true,
                result: `Directory: ${args.path || '.'}\n${results.slice(0, 50).join('\n')}${results.length > 50 ? `\n... and ${results.length - 50} more` : ''}`
            };
        } catch (e: any) {
            return { success: false, result: '', error: e.message };
        }
    }
};

const createDirectoryTool: Tool = {
    name: 'createDirectory',
    description: 'Create a new directory',
    parameters: '{"path": "directory path"}',
    execute: async (args: { path: string }) => {
        try {
            const fullPath = resolvePath(args.path);
            fs.mkdirSync(fullPath, { recursive: true });
            return { success: true, result: `✅ Created directory ${args.path}` };
        } catch (e: any) {
            return { success: false, result: '', error: e.message };
        }
    }
};

// ============== SEARCH TOOLS ==============

const fileSearchTool: Tool = {
    name: 'fileSearch',
    description: 'Find files by name pattern (glob)',
    parameters: '{"pattern": "glob pattern like **/*.ts"}',
    execute: async (args: { pattern: string; maxResults?: number }) => {
        try {
            const root = getWorkspaceRoot();
            const maxResults = args.maxResults || 30;

            const files = await vscode.workspace.findFiles(
                args.pattern,
                '{**/node_modules/**,**/.git/**,**/dist/**,**/out/**}',
                maxResults
            );

            const results = files.map(f =>
                path.relative(root, f.fsPath)
            );

            return {
                success: true,
                result: results.length > 0
                    ? `Found ${results.length} files:\n${results.join('\n')}`
                    : 'No files found matching pattern'
            };
        } catch (e: any) {
            return { success: false, result: '', error: e.message };
        }
    }
};

const textSearchTool: Tool = {
    name: 'textSearch',
    description: 'Search for text content across workspace files',
    parameters: '{"query": "search text"}',
    execute: async (args: { query: string; maxResults?: number }) => {
        try {
            const root = getWorkspaceRoot();
            const maxResults = args.maxResults || 20;

            // Use ripgrep for speed, fallback to grep
            const escapedQuery = args.query.replace(/"/g, '\\"');
            const cmd = `rg -n -i --max-count 3 "${escapedQuery}" --ignore-case 2>/dev/null || grep -rn -i "${escapedQuery}" . --include="*.ts" --include="*.js" --include="*.tsx" --include="*.jsx" --include="*.py" --include="*.java" 2>/dev/null | head -${maxResults}`;

            try {
                const { stdout } = await execAsync(cmd, {
                    cwd: root,
                    timeout: 10000,
                    maxBuffer: 1024 * 1024
                });

                if (!stdout.trim()) {
                    return { success: true, result: 'No matches found' };
                }

                const lines = stdout.trim().split('\n').slice(0, maxResults);
                return {
                    success: true,
                    result: `Found ${lines.length} matches:\n${lines.join('\n')}`
                };
            } catch {
                return { success: true, result: 'No matches found' };
            }
        } catch (e: any) {
            return { success: false, result: '', error: e.message };
        }
    }
};

// ============== EDITOR TOOLS ==============

const selectionTool: Tool = {
    name: 'selection',
    description: 'Get currently selected text in editor',
    parameters: '{}',
    execute: async () => {
        try {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                return { success: false, result: '', error: 'No active editor' };
            }

            const selection = editor.document.getText(editor.selection);
            const fileName = path.basename(editor.document.fileName);
            const language = editor.document.languageId;
            const startLine = editor.selection.start.line + 1;
            const endLine = editor.selection.end.line + 1;

            if (!selection) {
                // Return cursor context instead
                const line = editor.document.lineAt(editor.selection.active.line);
                return {
                    success: true,
                    result: `Cursor at ${fileName}:${startLine}\nLine content: ${line.text}`
                };
            }

            return {
                success: true,
                result: `Selection from ${fileName}:${startLine}-${endLine} (${language}):\n\`\`\`${language}\n${selection}\n\`\`\``
            };
        } catch (e: any) {
            return { success: false, result: '', error: e.message };
        }
    }
};

const problemsTool: Tool = {
    name: 'problems',
    description: 'Get current errors and warnings from VS Code diagnostics',
    parameters: '{}',
    execute: async () => {
        try {
            const diagnostics = vscode.languages.getDiagnostics();
            const results: string[] = [];
            let totalErrors = 0;
            let totalWarnings = 0;

            for (const [uri, diags] of diagnostics) {
                if (diags.length === 0) continue;

                const relativePath = path.relative(getWorkspaceRoot(), uri.fsPath);
                if (relativePath.includes('node_modules')) continue;

                const errors = diags.filter(d => d.severity === vscode.DiagnosticSeverity.Error);
                const warnings = diags.filter(d => d.severity === vscode.DiagnosticSeverity.Warning);

                totalErrors += errors.length;
                totalWarnings += warnings.length;

                if (errors.length > 0 || warnings.length > 0) {
                    results.push(`\n📄 ${relativePath}:`);
                    for (const diag of [...errors, ...warnings].slice(0, 5)) {
                        const severity = diag.severity === vscode.DiagnosticSeverity.Error ? '❌' : '⚠️';
                        results.push(`  ${severity} Line ${diag.range.start.line + 1}: ${diag.message}`);
                    }
                }
            }

            if (results.length === 0) {
                return { success: true, result: '✅ No problems found!' };
            }

            return {
                success: true,
                result: `Found ${totalErrors} errors, ${totalWarnings} warnings:${results.join('\n')}`
            };
        } catch (e: any) {
            return { success: false, result: '', error: e.message };
        }
    }
};

const currentFileTool: Tool = {
    name: 'currentFile',
    description: 'Get the currently open file content and info',
    parameters: '{}',
    execute: async () => {
        try {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                return { success: false, result: '', error: 'No active editor' };
            }

            const content = editor.document.getText();
            const fileName = path.basename(editor.document.fileName);
            const relativePath = path.relative(getWorkspaceRoot(), editor.document.fileName);
            const language = editor.document.languageId;
            const lineCount = editor.document.lineCount;

            // Truncate if too long
            const maxLines = 200;
            const lines = content.split('\n');
            const truncated = lines.length > maxLines;
            const displayContent = truncated
                ? lines.slice(0, maxLines).join('\n') + `\n... (${lines.length - maxLines} more lines)`
                : content;

            return {
                success: true,
                result: `Current file: ${relativePath} (${language}, ${lineCount} lines)\n\`\`\`${language}\n${displayContent}\n\`\`\``
            };
        } catch (e: any) {
            return { success: false, result: '', error: e.message };
        }
    }
};

// ============== TERMINAL TOOLS ==============

const runInTerminalTool: Tool = {
    name: 'runInTerminal',
    description: 'Execute a command in the terminal',
    parameters: '{"command": "shell command to run"}',
    execute: async (args: { command: string }, onProgress?) => {
        try {
            onProgress?.(`Running: ${args.command}`);

            // Safety check for dangerous commands
            const dangerous = ['rm -rf /', 'format', 'mkfs', ':(){:|:&};:'];
            if (dangerous.some(d => args.command.includes(d))) {
                return { success: false, result: '', error: 'Potentially dangerous command blocked' };
            }

            const { stdout, stderr } = await execAsync(args.command, {
                cwd: getWorkspaceRoot(),
                timeout: 60000,
                maxBuffer: 1024 * 1024,
                env: { ...process.env, CI: 'true' } // Non-interactive mode
            });

            const output = (stdout + stderr).trim();
            const maxOutput = 2000;
            const truncatedOutput = output.length > maxOutput
                ? output.substring(0, maxOutput) + '\n... (output truncated)'
                : output;

            return {
                success: true,
                result: truncatedOutput || '(command completed with no output)'
            };
        } catch (e: any) {
            return {
                success: false,
                result: e.stdout || '',
                error: e.stderr || e.message
            };
        }
    }
};

// ============== GIT/CHANGES TOOLS ==============

const changesTool: Tool = {
    name: 'changes',
    description: 'Get current git changes (staged and unstaged)',
    parameters: '{}',
    execute: async () => {
        try {
            const { stdout: status } = await execAsync('git status --short', {
                cwd: getWorkspaceRoot()
            });

            if (!status.trim()) {
                return { success: true, result: 'No uncommitted changes in workspace' };
            }

            // Get diff summary
            let diffSummary = '';
            try {
                const { stdout: diff } = await execAsync('git diff --stat --cached && git diff --stat', {
                    cwd: getWorkspaceRoot()
                });
                diffSummary = diff.trim();
            } catch {
                // Git diff failed, just use status
            }

            return {
                success: true,
                result: `Git changes:\n${status}\n${diffSummary ? `\nDiff summary:\n${diffSummary}` : ''}`
            };
        } catch {
            return { success: true, result: 'Not a git repository' };
        }
    }
};

// ============== WEB TOOLS ==============

const webSearchTool: Tool = {
    name: 'webSearch',
    description: 'Search the internet for information, documentation, or code examples',
    parameters: '{"query": "search query"}',
    execute: async (args: { query: string }, onProgress?) => {
        try {
            onProgress?.(`Searching web: ${args.query}`);

            const encodedQuery = encodeURIComponent(args.query);
            const url = `https://html.duckduckgo.com/html/?q=${encodedQuery}`;

            const html = await fetchUrlContent(url);
            const results = parseDuckDuckGoResults(html, 5);

            if (results.length === 0) {
                return { success: true, result: `No web results found for "${args.query}"` };
            }

            const formatted = results.map((r, i) =>
                `${i + 1}. **${r.title}**\n   ${r.snippet}\n   URL: ${r.url}`
            ).join('\n\n');

            return {
                success: true,
                result: `Web search results for "${args.query}":\n\n${formatted}`
            };
        } catch (e: any) {
            return { success: false, result: '', error: `Web search failed: ${e.message}` };
        }
    }
};

const fetchUrlTool: Tool = {
    name: 'fetchUrl',
    description: 'Fetch content from a URL (documentation, API docs, etc)',
    parameters: '{"url": "URL to fetch"}',
    execute: async (args: { url: string }, onProgress?) => {
        try {
            onProgress?.(`Fetching: ${args.url}`);

            const html = await fetchUrlContent(args.url);
            const text = extractTextFromHtml(html, 5000);

            return {
                success: true,
                result: `Content from ${args.url}:\n\n${text}`
            };
        } catch (e: any) {
            return { success: false, result: '', error: `Failed to fetch URL: ${e.message}` };
        }
    }
};

// ============== CODEBASE ANALYSIS TOOLS ==============

const codebaseTool: Tool = {
    name: 'codebase',
    description: 'Analyze the codebase structure and provide overview',
    parameters: '{}',
    execute: async (_, onProgress?) => {
        try {
            onProgress?.('Analyzing codebase...');

            const root = getWorkspaceRoot();
            const packageJsonPath = path.join(root, 'package.json');
            const pyprojectPath = path.join(root, 'pyproject.toml');
            const cargoPath = path.join(root, 'Cargo.toml');
            const pomPath = path.join(root, 'pom.xml');

            let projectInfo = '';
            let language = 'unknown';

            // Detect project type
            if (fs.existsSync(packageJsonPath)) {
                const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
                language = 'JavaScript/TypeScript';
                projectInfo = `**${pkg.name || 'Node.js Project'}** v${pkg.version || '0.0.0'}\n`;
                projectInfo += `Description: ${pkg.description || 'N/A'}\n`;

                const deps = Object.keys(pkg.dependencies || {}).slice(0, 10);
                const devDeps = Object.keys(pkg.devDependencies || {}).slice(0, 5);
                if (deps.length) projectInfo += `Dependencies: ${deps.join(', ')}\n`;
                if (devDeps.length) projectInfo += `Dev Dependencies: ${devDeps.join(', ')}\n`;

                // Check for frameworks
                const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
                if (allDeps['react']) projectInfo += `Framework: React\n`;
                if (allDeps['next']) projectInfo += `Framework: Next.js\n`;
                if (allDeps['vue']) projectInfo += `Framework: Vue.js\n`;
                if (allDeps['express']) projectInfo += `Backend: Express.js\n`;
            } else if (fs.existsSync(pyprojectPath)) {
                language = 'Python';
                projectInfo = 'Python project (pyproject.toml found)\n';
            } else if (fs.existsSync(cargoPath)) {
                language = 'Rust';
                projectInfo = 'Rust project (Cargo.toml found)\n';
            } else if (fs.existsSync(pomPath)) {
                language = 'Java';
                projectInfo = 'Java project (pom.xml found)\n';
            }

            // Count files
            const { stdout: fileCount } = await execAsync(
                `find . -type f \\( -name "*.ts" -o -name "*.js" -o -name "*.tsx" -o -name "*.jsx" -o -name "*.py" -o -name "*.java" -o -name "*.rs" \\) | grep -v node_modules | grep -v .git | wc -l`,
                { cwd: root }
            ).catch(() => ({ stdout: '?' }));

            // Get directory structure
            const { stdout: tree } = await execAsync(
                `find . -type d -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/dist/*" -not -path "*/.next/*" | head -20`,
                { cwd: root }
            ).catch(() => ({ stdout: '' }));

            const directories = tree.trim().split('\n').filter(Boolean).map(d => `📁 ${d}`).join('\n');

            return {
                success: true,
                result: `**Codebase Analysis**\n\n${projectInfo}Language: ${language}\nSource files: ~${fileCount.trim()}\n\n**Directory Structure:**\n${directories}`
            };
        } catch (e: any) {
            return { success: false, result: '', error: e.message };
        }
    }
};

// ============== HELPER FUNCTIONS ==============

async function fetchUrlContent(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;

        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5'
            }
        };

        const req = protocol.get(url, options, (res) => {
            if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                fetchUrlContent(res.headers.location).then(resolve).catch(reject);
                return;
            }

            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        });

        req.on('error', reject);
        req.setTimeout(15000, () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
    });
}

function parseDuckDuckGoResults(html: string, maxResults: number): Array<{ title: string; url: string; snippet: string }> {
    const results: Array<{ title: string; url: string; snippet: string }> = [];

    const linkPattern = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]*)"[^>]*>([^<]*)/gi;
    const snippetPattern = /<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([^<]*)/gi;

    const links: { url: string; title: string }[] = [];
    let match;
    while ((match = linkPattern.exec(html)) !== null && links.length < maxResults) {
        const url = decodeURIComponent(match[1].replace(/.*uddg=/, '').split('&')[0]);
        const title = decodeHtmlEntities(match[2]);
        if (url.startsWith('http') && title) {
            links.push({ url, title });
        }
    }

    const snippets: string[] = [];
    while ((match = snippetPattern.exec(html)) !== null && snippets.length < maxResults) {
        snippets.push(decodeHtmlEntities(match[1]).replace(/<[^>]*>/g, '').trim());
    }

    for (let i = 0; i < Math.min(links.length, maxResults); i++) {
        results.push({
            title: links[i].title,
            url: links[i].url,
            snippet: snippets[i] || 'No description available'
        });
    }

    return results;
}

function extractTextFromHtml(html: string, maxLength: number): string {
    let text = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
        .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
        .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    text = decodeHtmlEntities(text);

    if (text.length > maxLength) {
        text = text.substring(0, maxLength) + '... [truncated]';
    }

    return text || 'Could not extract content';
}

function decodeHtmlEntities(text: string): string {
    return text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .trim();
}

// ============== TOOL REGISTRY ==============

export const TOOLS: Tool[] = [
    // File Operations
    readFileTool,
    writeFileTool,
    editFileTool,
    listDirectoryTool,
    createDirectoryTool,
    // Search
    fileSearchTool,
    textSearchTool,
    // Editor
    selectionTool,
    currentFileTool,
    problemsTool,
    // Terminal
    runInTerminalTool,
    // Git
    changesTool,
    // Web
    webSearchTool,
    fetchUrlTool,
    // Codebase
    codebaseTool
];

export function getToolByName(name: string): Tool | undefined {
    return TOOLS.find(t => t.name === name);
}

export function getAllToolNames(): string[] {
    return TOOLS.map(t => t.name);
}

export function getToolDescriptions(): string {
    return TOOLS.map(t => `- **${t.name}**: ${t.description}`).join('\n');
}

export function getToolsForPrompt(): string {
    return TOOLS.map(t =>
        `${t.name}: ${t.description}${t.parameters ? `\n  Parameters: ${t.parameters}` : ''}`
    ).join('\n');
}
