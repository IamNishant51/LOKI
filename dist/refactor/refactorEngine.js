"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.engineCommand = engineCommand;
const orchestrator_1 = require("../agents/orchestrator");
const child_process_1 = require("child_process");
async function engineCommand(instruction) {
    if (!instruction) {
        console.log("Please provide a refactor instruction e.g. 'convert to typescript'");
        return;
    }
    try {
        // Enforce safety: Check git status first
        try {
            const status = (0, child_process_1.execSync)('git status --porcelain').toString();
            if (status.trim().length > 0) {
                console.log("⚠️  Standard Safety Check: You have uncommitted changes.");
                console.log("   LOKI recommends a clean state before refactoring.");
                // In a real CLI we would ask prompt yes/no.
                // For now, proceed with warning.
            }
        }
        catch {
            console.log("⚠️  Not a git repository. Safety features limited.");
        }
        console.log(`🧠 LOKI Engine: Initializing Refactor Workflow...`);
        const result = await (0, orchestrator_1.runRefactorWorkflow)(instruction);
        console.log(result.details);
        console.log("\n---------------------------------------------------");
        console.log("To apply changes, this scaffold would prompt for 'Yes'.");
        console.log("Currently, changes are proposed ONLY. No files modified.");
    }
    catch (e) {
        console.error("Engine Error:", e.message);
    }
}
