"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.doctorCommand = doctorCommand;
const fs_1 = __importDefault(require("fs"));
const config_1 = require("../utils/config");
const providerFactory_1 = require("../llm/providerFactory");
const chalk_1 = __importDefault(require("chalk"));
async function doctorCommand() {
    console.log(`\nLOKI DOCTOR - SYSTEM HEALTH CHECK\n`);
    let allGood = true;
    // Helper for clean output
    const check = (label, status, info) => {
        const mark = status ? chalk_1.default.green('[OK]  ') : chalk_1.default.red('[FAIL]');
        console.log(`${mark} ${label.padEnd(20)} : ${info}`);
        if (!status)
            allGood = false;
    };
    const warn = (label, info) => {
        console.log(`${chalk_1.default.yellow('[WARN]')} ${label.padEnd(20)} : ${info}`);
    };
    // 1. Check Config Dir
    try {
        if (fs_1.default.existsSync(config_1.CONFIG.CONFIG_DIR)) {
            try {
                fs_1.default.accessSync(config_1.CONFIG.CONFIG_DIR, fs_1.default.constants.W_OK);
                check('Config Directory', true, config_1.CONFIG.CONFIG_DIR);
            }
            catch {
                check('Config Directory', false, `Not Writable (${config_1.CONFIG.CONFIG_DIR})`);
            }
        }
        else {
            warn('Config Directory', 'Missing (Will be created on first run)');
        }
    }
    catch (e) {
        check('Config Directory', false, 'Check Failed');
    }
    // 2. Check Ollama
    const ollama = (0, providerFactory_1.getProvider)('ollama');
    const ollamaHealth = await ollama.checkHealth();
    if (ollamaHealth) {
        check('Ollama Connection', true, config_1.CONFIG.OLLAMA_HOST);
    }
    else {
        check('Ollama Connection', false, 'Not running or unreachable');
        console.log(chalk_1.default.gray(`      -> Run 'ollama serve' to start`));
    }
    // 3. Check Groq (Optional)
    if (config_1.CONFIG.GROQ_API_KEY) {
        check('Groq API Key', true, 'Present');
    }
    else {
        // Just info, not warn/fail since it's optional
        console.log(`${chalk_1.default.blue('[INFO]')} ${'Groq API Key'.padEnd(20)} : Not Set (Optional)`);
    }
    console.log(`\n----------------------------------------`);
    if (allGood) {
        console.log(chalk_1.default.green(`System ready.`));
    }
    else {
        console.log(chalk_1.default.red(`System has issues. Please fix above errors.`));
    }
}
