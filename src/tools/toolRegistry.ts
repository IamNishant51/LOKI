import { getCurrentTime, getCurrentDate } from './timeTool';
import { evaluateMath } from './mathTool';
import { listFiles, readFile } from './fsTool';
import { getGitStatus, getRecentLog, getDiff } from './gitTool';
import { getProjectContext, formatProjectContext } from '../context/projectContext';

export interface Tool {
    name: string;
    description: string;
    parameters: string; // JSON schema description or string description
    execute: (args: any) => Promise<string> | string;
}

export const TOOLS: Record<string, Tool> = {
    get_time: {
        name: 'get_time',
        description: 'Get current time. Args: timezone (optional)',
        parameters: '{ timezone?: string }',
        execute: (args) => getCurrentTime(args?.timezone)
    },
    get_date: {
        name: 'get_date',
        description: 'Get current date. Args: timezone (optional)',
        parameters: '{ timezone?: string }',
        execute: (args) => getCurrentDate(args?.timezone)
    },
    calculate: {
        name: 'calculate',
        description: 'Evaluate math expression.',
        parameters: '{ expression: string }',
        execute: (args) => evaluateMath(args.expression)
    },
    list_files: {
        name: 'list_files',
        description: 'List files in a directory.',
        parameters: '{ path?: string }',
        execute: (args) => listFiles(args?.path || '.').join(', ')
    },
    read_file: {
        name: 'read_file',
        description: 'Read file content.',
        parameters: '{ path: string }',
        execute: (args) => readFile(args.path)
    },
    git_status: {
        name: 'git_status',
        description: 'Get git status summary.',
        parameters: '{}',
        execute: () => getGitStatus()
    },
    git_log: {
        name: 'git_log',
        description: 'Get recent git commits.',
        parameters: '{ count?: number }',
        execute: (args) => getRecentLog(undefined, args?.count)
    },
    git_diff: {
        name: 'git_diff',
        description: 'Get git diff.',
        parameters: '{}',
        execute: () => getDiff()
    },
    project_context: {
        name: 'project_context',
        description: 'Get full project overview.',
        parameters: '{}',
        execute: () => formatProjectContext(getProjectContext())
    }
};

export function getToolSchemas(): string {
    return Object.values(TOOLS).map(t =>
        `- Tool: ${t.name}\n  Desc: ${t.description}\n  Params: ${t.parameters}`
    ).join('\n\n');
}

export async function executeToolCall(toolName: string, args: any): Promise<string> {
    const tool = TOOLS[toolName];
    if (!tool) return `Error: Tool ${toolName} not found.`;
    try {
        return await tool.execute(args);
    } catch (e: any) {
        return `Error executing ${toolName}: ${e.message}`;
    }
}
