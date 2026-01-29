import fs from 'fs';
import path from 'path';
import { CONFIG } from '../utils/config';

export interface MemoryItem {
    timestamp: string;
    role: 'user' | 'assistant';
    content: string;
}

/**
 * Ensures the configuration directory exists.
 */
function ensureConfigDir() {
    if (!fs.existsSync(CONFIG.CONFIG_DIR)) {
        fs.mkdirSync(CONFIG.CONFIG_DIR, { recursive: true });
    }
}

/**
 * Loads the last N memory items from local storage.
 */
export function loadMemory(): MemoryItem[] {
    try {
        ensureConfigDir();
        if (!fs.existsSync(CONFIG.MEMORY_FILE)) {
            return [];
        }
        const data = fs.readFileSync(CONFIG.MEMORY_FILE, 'utf-8');
        const items: MemoryItem[] = JSON.parse(data);

        // Return only the last MAX_MEMORY_ITEMS
        return items.slice(-CONFIG.MAX_MEMORY_ITEMS);
    } catch (error) {
        // If memory is corrupt or unreadable, return empty to prevent crash
        return [];
    }
}

/**
 * Saves the full list of memory items to local storage.
 */
export function saveMemory(memory: MemoryItem[]): void {
    try {
        ensureConfigDir();
        fs.writeFileSync(CONFIG.MEMORY_FILE, JSON.stringify(memory, null, 2), 'utf-8');
    } catch (error) {
        console.error('Failed to save memory:', error);
    }
}

/**
 * Appends a single item to the persistent memory store.
 */
export function appendMemory(item: MemoryItem): void {
    const currentMemory = loadMemory();
    currentMemory.push(item);
    saveMemory(currentMemory);
}
