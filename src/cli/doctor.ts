import fs from 'fs';
import { CONFIG } from '../utils/config';
import { getProvider } from '../llm/providerFactory';
import chalk from 'chalk';

export async function doctorCommand() {
    console.log(`\nLOKI DOCTOR - SYSTEM HEALTH CHECK\n`);

    let allGood = true;

    // Helper for clean output
    const check = (label: string, status: boolean, info: string) => {
        const mark = status ? chalk.green('[OK]  ') : chalk.red('[FAIL]');
        console.log(`${mark} ${label.padEnd(20)} : ${info}`);
        if (!status) allGood = false;
    };

    const warn = (label: string, info: string) => {
        console.log(`${chalk.yellow('[WARN]')} ${label.padEnd(20)} : ${info}`);
    };

    // 1. Check Config Dir
    try {
        if (fs.existsSync(CONFIG.CONFIG_DIR)) {
            try {
                fs.accessSync(CONFIG.CONFIG_DIR, fs.constants.W_OK);
                check('Config Directory', true, CONFIG.CONFIG_DIR);
            } catch {
                check('Config Directory', false, `Not Writable (${CONFIG.CONFIG_DIR})`);
            }
        } else {
            warn('Config Directory', 'Missing (Will be created on first run)');
        }
    } catch (e) {
        check('Config Directory', false, 'Check Failed');
    }

    // 2. Check Ollama
    const ollama = getProvider('ollama');
    const ollamaHealth = await ollama.checkHealth();
    if (ollamaHealth) {
        check('Ollama Connection', true, CONFIG.OLLAMA_HOST);
    } else {
        check('Ollama Connection', false, 'Not running or unreachable');
        console.log(chalk.gray(`      -> Run 'ollama serve' to start`));
    }

    // 3. Check Groq (Optional)
    if (CONFIG.GROQ_API_KEY) {
        check('Groq API Key', true, 'Present');
    } else {
        // Just info, not warn/fail since it's optional
        console.log(`${chalk.blue('[INFO]')} ${'Groq API Key'.padEnd(20)} : Not Set (Optional)`);
    }

    console.log(`\n----------------------------------------`);
    if (allGood) {
        console.log(chalk.green(`System ready.`));
    } else {
        console.log(chalk.red(`System has issues. Please fix above errors.`));
    }
}
