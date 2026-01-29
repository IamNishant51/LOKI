import { runRefactorWorkflow } from '../agents/orchestrator';
import { execSync } from 'child_process';

export async function engineCommand(instruction: string) {
    if (!instruction) {
        console.log("Please provide a refactor instruction e.g. 'convert to typescript'");
        return;
    }

    try {
        // Enforce safety: Check git status first
        try {
            const status = execSync('git status --porcelain').toString();
            if (status.trim().length > 0) {
                console.log("⚠️  Standard Safety Check: You have uncommitted changes.");
                console.log("   LOKI recommends a clean state before refactoring.");
                // In a real CLI we would ask prompt yes/no.
                // For now, proceed with warning.
            }
        } catch {
            console.log("⚠️  Not a git repository. Safety features limited.");
        }

        console.log(`🧠 LOKI Engine: Initializing Refactor Workflow...`);
        const result = await runRefactorWorkflow(instruction);

        console.log(result.details);

        console.log("\n---------------------------------------------------");
        console.log("To apply changes, this scaffold would prompt for 'Yes'.");
        console.log("Currently, changes are proposed ONLY. No files modified.");

    } catch (e: any) {
        console.error("Engine Error:", e.message);
    }
}
