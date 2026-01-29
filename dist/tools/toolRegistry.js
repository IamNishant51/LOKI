"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TOOLS = void 0;
exports.getToolSchemas = getToolSchemas;
exports.executeToolCall = executeToolCall;
const timeTool_1 = require("./timeTool");
const mathTool_1 = require("./mathTool");
const fsTool_1 = require("./fsTool");
const gitTool_1 = require("./gitTool");
const projectContext_1 = require("../context/projectContext");
exports.TOOLS = {
    get_time: {
        name: 'get_time',
        description: 'Get current time. Args: timezone (optional)',
        parameters: '{ timezone?: string }',
        execute: (args) => (0, timeTool_1.getCurrentTime)(args?.timezone)
    },
    get_date: {
        name: 'get_date',
        description: 'Get current date. Args: timezone (optional)',
        parameters: '{ timezone?: string }',
        execute: (args) => (0, timeTool_1.getCurrentDate)(args?.timezone)
    },
    calculate: {
        name: 'calculate',
        description: 'Evaluate math expression.',
        parameters: '{ expression: string }',
        execute: (args) => (0, mathTool_1.evaluateMath)(args.expression)
    },
    list_files: {
        name: 'list_files',
        description: 'List files in a directory.',
        parameters: '{ path?: string }',
        execute: (args) => (0, fsTool_1.listFiles)(args?.path || '.').join(', ')
    },
    read_file: {
        name: 'read_file',
        description: 'Read file content.',
        parameters: '{ path: string }',
        execute: (args) => (0, fsTool_1.readFile)(args.path)
    },
    git_status: {
        name: 'git_status',
        description: 'Get git status summary.',
        parameters: '{}',
        execute: () => (0, gitTool_1.getGitStatus)()
    },
    git_log: {
        name: 'git_log',
        description: 'Get recent git commits.',
        parameters: '{ count?: number }',
        execute: (args) => (0, gitTool_1.getRecentLog)(undefined, args?.count)
    },
    git_diff: {
        name: 'git_diff',
        description: 'Get git diff.',
        parameters: '{}',
        execute: () => (0, gitTool_1.getDiff)()
    },
    project_context: {
        name: 'project_context',
        description: 'Get full project overview.',
        parameters: '{}',
        execute: () => (0, projectContext_1.formatProjectContext)((0, projectContext_1.getProjectContext)())
    }
};
function getToolSchemas() {
    return Object.values(exports.TOOLS).map(t => `- Tool: ${t.name}\n  Desc: ${t.description}\n  Params: ${t.parameters}`).join('\n\n');
}
async function executeToolCall(toolName, args) {
    const tool = exports.TOOLS[toolName];
    if (!tool)
        return `Error: Tool ${toolName} not found.`;
    try {
        return await tool.execute(args);
    }
    catch (e) {
        return `Error executing ${toolName}: ${e.message}`;
    }
}
