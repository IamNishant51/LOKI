import { getProvider } from '../llm/providerFactory';
import { getProjectContext } from '../context/projectContext';

export interface WorkflowResult {
    success: boolean;
    summary: string;
    details?: string;
}

// 1. Planner Agent
const PLANNER_PROMPT = `
You are the PLANNER Agent.
Analyze the request and project context.
Create a step-by-step plan to achieve the goal.
Do NOT write code. Just plan.
Output format:
- Step 1: [Action]
- Step 2: [Action]
...
`;

// 2. Analyzer Agent
const ANALYZER_PROMPT = `
You are the ANALYZER Agent.
Read the plan and relevant files.
Explain the current state and what needs to change.
Focus on impact and risks.
`;

// 3. Refactor Agent
const REFACTOR_PROMPT = `
You are the REFACTOR Agent.
Generate the actual code changes based on the plan and analysis.
Show clear Before/After blocks or unified diffs.
Do NOT apply changes. Just propose them.
`;

export async function runRefactorWorkflow(instruction: string): Promise<WorkflowResult> {
    const provider = getProvider('ollama'); // Default for internal thought loops
    const context = getProjectContext();

    // --- Step 1: Plan ---
    const planPrompt = `
${PLANNER_PROMPT}
Project: ${context.name}
User Goal: ${instruction}
Plan:`;

    console.log('[Orchestrator] Planning...');
    const plan = await provider.generate(planPrompt);

    // --- Step 2: Analyze ---
    const analysisPrompt = `
${ANALYZER_PROMPT}
Plan:
${plan}
User Goal: ${instruction}
Analysis:`;

    console.log('[Orchestrator] Analyzing...');
    const analysis = await provider.generate(analysisPrompt);

    // --- Step 3: Propose Refactor ---
    const refactorPrompt = `
${REFACTOR_PROMPT}
Plan:
${plan}
Analysis:
${analysis}
Proposal:`;

    console.log('[Orchestrator] Generating Proposal...');
    const proposal = await provider.generate(refactorPrompt);

    // Provide full report
    return {
        success: true,
        summary: "Refactor Proposal Generated",
        details: `
=== PLAN ===
${plan.trim()}

=== ANALYSIS ===
${analysis.trim()}

=== PROPOSAL ===
${proposal.trim()}
        `
    };
}
