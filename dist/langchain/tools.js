"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.lokiTools = exports.gitStatusTool = exports.fsReadTool = exports.fsListTool = exports.mathTool = exports.dateTool = exports.timeTool = void 0;
const tools_1 = require("@langchain/core/tools");
const zod_1 = require("zod");
const toolRegistry_1 = require("../tools/toolRegistry");
// Helper to wrap LOKI tools
// We verify parameters manually for now since LOKI tools behave predictably
exports.timeTool = new tools_1.DynamicStructuredTool({
    name: "get_time",
    description: toolRegistry_1.TOOLS.get_time.description,
    schema: zod_1.z.object({
        timezone: zod_1.z.string().optional()
    }),
    func: async ({ timezone }) => {
        return await toolRegistry_1.TOOLS.get_time.execute({ timezone });
    }
});
exports.dateTool = new tools_1.DynamicStructuredTool({
    name: "get_date",
    description: toolRegistry_1.TOOLS.get_date.description,
    schema: zod_1.z.object({
        timezone: zod_1.z.string().optional()
    }),
    func: async ({ timezone }) => {
        return await toolRegistry_1.TOOLS.get_date.execute({ timezone });
    }
});
exports.mathTool = new tools_1.DynamicStructuredTool({
    name: "calculate",
    description: toolRegistry_1.TOOLS.calculate.description,
    schema: zod_1.z.object({
        expression: zod_1.z.string().describe("The math expression to evaluate")
    }),
    func: async ({ expression }) => {
        return await toolRegistry_1.TOOLS.calculate.execute({ expression });
    }
});
exports.fsListTool = new tools_1.DynamicStructuredTool({
    name: "list_files",
    description: toolRegistry_1.TOOLS.list_files.description,
    schema: zod_1.z.object({
        path: zod_1.z.string().optional().describe("Directory path to list")
    }),
    func: async ({ path }) => {
        return await toolRegistry_1.TOOLS.list_files.execute({ path });
    }
});
exports.fsReadTool = new tools_1.DynamicStructuredTool({
    name: "read_file",
    description: toolRegistry_1.TOOLS.read_file.description,
    schema: zod_1.z.object({
        path: zod_1.z.string().describe("File path to read")
    }),
    func: async ({ path }) => {
        return await toolRegistry_1.TOOLS.read_file.execute({ path });
    }
});
exports.gitStatusTool = new tools_1.DynamicStructuredTool({
    name: "git_status",
    description: toolRegistry_1.TOOLS.git_status.description,
    schema: zod_1.z.object({}),
    func: async () => {
        return await toolRegistry_1.TOOLS.git_status.execute({});
    }
});
exports.lokiTools = [
    exports.timeTool,
    exports.dateTool,
    exports.mathTool,
    exports.fsListTool,
    exports.fsReadTool,
    exports.gitStatusTool
];
