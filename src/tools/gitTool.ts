import { execSync } from 'child_process';
import path from 'path';

export function isGitRepo(cwd: string = process.cwd()): boolean {
    try {
        execSync('git rev-parse --is-inside-work-tree', { cwd, stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

export function getGitStatus(cwd: string = process.cwd()): string {
    try {
        return execSync('git status --short', { cwd, encoding: 'utf-8' }).trim();
    } catch {
        return 'Error getting git status';
    }
}

export function getRecentLog(cwd: string = process.cwd(), count: number = 5): string {
    try {
        // oneline, graph, decorate
        return execSync(`git log -n ${count} --pretty=format:"%h - %an, %ar : %s"`, { cwd, encoding: 'utf-8' }).trim();
    } catch {
        return 'Error getting git log';
    }
}

export function getDiff(cwd: string = process.cwd()): string {
    try {
        // Limit diff size to prevent token explosion
        const diff = execSync('git diff HEAD', { cwd, encoding: 'utf-8' });
        if (diff.length > 2000) return diff.substring(0, 2000) + '\n...[Diff Truncated]';
        return diff || 'No changes.';
    } catch {
        return 'Error getting diff';
    }
}

export function getBranches(cwd: string = process.cwd()): string {
    try {
        return execSync('git branch', { cwd, encoding: 'utf-8' }).trim();
    } catch {
        return 'Error getting branches';
    }
}
