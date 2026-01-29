"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadMemory = loadMemory;
exports.saveMemory = saveMemory;
exports.appendMemory = appendMemory;
const fs_1 = __importDefault(require("fs"));
const config_1 = require("../utils/config");
/**
 * Ensures the configuration directory exists.
 */
function ensureConfigDir() {
    if (!fs_1.default.existsSync(config_1.CONFIG.CONFIG_DIR)) {
        fs_1.default.mkdirSync(config_1.CONFIG.CONFIG_DIR, { recursive: true });
    }
}
/**
 * Loads the last N memory items from local storage.
 */
function loadMemory() {
    try {
        ensureConfigDir();
        if (!fs_1.default.existsSync(config_1.CONFIG.MEMORY_FILE)) {
            return [];
        }
        const data = fs_1.default.readFileSync(config_1.CONFIG.MEMORY_FILE, 'utf-8');
        const items = JSON.parse(data);
        // Return only the last MAX_MEMORY_ITEMS
        return items.slice(-config_1.CONFIG.MAX_MEMORY_ITEMS);
    }
    catch (error) {
        // If memory is corrupt or unreadable, return empty to prevent crash
        return [];
    }
}
/**
 * Saves the full list of memory items to local storage.
 */
function saveMemory(memory) {
    try {
        ensureConfigDir();
        fs_1.default.writeFileSync(config_1.CONFIG.MEMORY_FILE, JSON.stringify(memory, null, 2), 'utf-8');
    }
    catch (error) {
        console.error('Failed to save memory:', error);
    }
}
/**
 * Appends a single item to the persistent memory store.
 */
function appendMemory(item) {
    const currentMemory = loadMemory();
    currentMemory.push(item);
    saveMemory(currentMemory);
}
