import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { TOOLS } from "../tools/toolRegistry";

// Helper to wrap LOKI tools
// We verify parameters manually for now since LOKI tools behave predictably

export const timeTool = new DynamicStructuredTool({
    name: "get_time",
    description: TOOLS.get_time.description,
    schema: z.object({
        timezone: z.string().optional()
    }),
    func: async ({ timezone }) => {
        return await TOOLS.get_time.execute({ timezone });
    }
});

export const dateTool = new DynamicStructuredTool({
    name: "get_date",
    description: TOOLS.get_date.description,
    schema: z.object({
        timezone: z.string().optional()
    }),
    func: async ({ timezone }) => {
        return await TOOLS.get_date.execute({ timezone });
    }
});

export const mathTool = new DynamicStructuredTool({
    name: "calculate",
    description: TOOLS.calculate.description,
    schema: z.object({
        expression: z.string().describe("The math expression to evaluate")
    }),
    func: async ({ expression }) => {
        return await TOOLS.calculate.execute({ expression });
    }
});

export const fsListTool = new DynamicStructuredTool({
    name: "list_files",
    description: TOOLS.list_files.description,
    schema: z.object({
        path: z.string().optional().describe("Directory path to list")
    }),
    func: async ({ path }) => {
        return await TOOLS.list_files.execute({ path });
    }
});

export const fsReadTool = new DynamicStructuredTool({
    name: "read_file",
    description: TOOLS.read_file.description,
    schema: z.object({
        path: z.string().describe("File path to read")
    }),
    func: async ({ path }) => {
        return await TOOLS.read_file.execute({ path });
    }
});

export const gitStatusTool = new DynamicStructuredTool({
    name: "git_status",
    description: TOOLS.git_status.description,
    schema: z.object({}),
    func: async () => {
        return await TOOLS.git_status.execute({});
    }
});

export const lokiTools = [
    timeTool,
    dateTool,
    mathTool,
    fsListTool,
    fsReadTool,
    gitStatusTool
];
