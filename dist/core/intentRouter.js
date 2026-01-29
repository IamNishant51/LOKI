"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.routeIntent = routeIntent;
const timeTool_1 = require("../tools/timeTool");
const mathTool_1 = require("../tools/mathTool");
const fsTool_1 = require("../tools/fsTool");
/**
 * Central routing logic.
 * Decides if a query can be answered locally by a tool or needs the LLM.
 */
async function routeIntent(message) {
    const cleanMsg = message.trim();
    const lowerMsg = cleanMsg.toLowerCase();
    // --- 1. TIME & DATE ---
    if (lowerMsg.includes('time') && (lowerMsg.includes('what') || lowerMsg.includes('current') || lowerMsg.includes('now') || lowerMsg.includes('in'))) {
        // Simple extraction of "in <location>"
        const match = lowerMsg.match(/in\s+([a-zA-Z]+)/);
        const timezone = match ? match[1] : undefined;
        return { handled: true, result: `It's ${(0, timeTool_1.getCurrentTime)(timezone)}` };
    }
    if (lowerMsg.includes('date') && (lowerMsg.includes('what') || lowerMsg.includes('current') || lowerMsg.includes('today'))) {
        const match = lowerMsg.match(/in\s+([a-zA-Z]+)/);
        const timezone = match ? match[1] : undefined;
        return { handled: true, result: `Today is ${(0, timeTool_1.getCurrentDate)(timezone)}` };
    }
    // --- 2. FILE SYSTEM ---
    if (lowerMsg.startsWith('list files') || lowerMsg.startsWith('ls ') || lowerMsg.startsWith('show files')) {
        // extract path
        // e.g. "list files in src" -> "src"
        // heuristic: last word or specific "in <path>"
        let targetPath = '.';
        if (lowerMsg.includes(' in ')) {
            targetPath = cleanMsg.split(' in ')[1];
        }
        else if (lowerMsg.startsWith('ls ')) {
            targetPath = cleanMsg.substring(3).trim();
            if (!targetPath)
                targetPath = '.';
        }
        const files = (0, fsTool_1.listFiles)(targetPath);
        return { handled: true, result: files.join(', ') };
    }
    if ((lowerMsg.startsWith('read ') || lowerMsg.startsWith('cat ')) && !lowerMsg.includes('what')) {
        let targetFile = '';
        if (lowerMsg.startsWith('read '))
            targetFile = cleanMsg.substring(5).trim();
        else if (lowerMsg.startsWith('cat '))
            targetFile = cleanMsg.substring(4).trim();
        return { handled: true, result: (0, fsTool_1.readFile)(targetFile) };
    }
    // --- 3. MATH ---
    // If it looks like a math expression and NOT natural language
    if ((0, mathTool_1.isMathExpression)(cleanMsg)) {
        return { handled: true, result: (0, mathTool_1.evaluateMath)(cleanMsg) };
    }
    // Default: Not handled by tools
    return { handled: false };
}
