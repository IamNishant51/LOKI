"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isGitRepo = isGitRepo;
exports.getGitStatus = getGitStatus;
exports.getRecentLog = getRecentLog;
exports.getDiff = getDiff;
exports.getBranches = getBranches;
const child_process_1 = require("child_process");
function isGitRepo(cwd = process.cwd()) {
    try {
        (0, child_process_1.execSync)('git rev-parse --is-inside-work-tree', { cwd, stdio: 'ignore' });
        return true;
    }
    catch {
        return false;
    }
}
function getGitStatus(cwd = process.cwd()) {
    try {
        return (0, child_process_1.execSync)('git status --short', { cwd, encoding: 'utf-8' }).trim();
    }
    catch {
        return 'Error getting git status';
    }
}
function getRecentLog(cwd = process.cwd(), count = 5) {
    try {
        // oneline, graph, decorate
        return (0, child_process_1.execSync)(`git log -n ${count} --pretty=format:"%h - %an, %ar : %s"`, { cwd, encoding: 'utf-8' }).trim();
    }
    catch {
        return 'Error getting git log';
    }
}
function getDiff(cwd = process.cwd()) {
    try {
        // Limit diff size to prevent token explosion
        const diff = (0, child_process_1.execSync)('git diff HEAD', { cwd, encoding: 'utf-8' });
        if (diff.length > 2000)
            return diff.substring(0, 2000) + '\n...[Diff Truncated]';
        return diff || 'No changes.';
    }
    catch {
        return 'Error getting diff';
    }
}
function getBranches(cwd = process.cwd()) {
    try {
        return (0, child_process_1.execSync)('git branch', { cwd, encoding: 'utf-8' }).trim();
    }
    catch {
        return 'Error getting branches';
    }
}
