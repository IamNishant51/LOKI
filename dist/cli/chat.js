"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startChatSession = startChatSession;
exports.chatCommand = chatCommand;
const readline_1 = __importDefault(require("readline"));
const chalk_1 = __importDefault(require("chalk"));
const agentRunner_1 = require("../core/agentRunner");
const spinner_1 = require("../utils/spinner");
const LOKI_PREFIX = chalk_1.default.green.bold('LOKI │');
const USER_PREFIX = chalk_1.default.blue.bold('USER │');
const ERROR_PREFIX = chalk_1.default.red.bold('ERR  │');
const BANNER = chalk_1.default.green.bold(`
██╗      ██████╗ ██╗  ██╗██╗
██║     ██╔═══██╗██║ ██╔╝██║
██║     ██║   ██║█████╔╝ ██║
██║     ██║   ██║██╔═██╗ ██║
███████╗╚██████╔╝██║  ██╗██║
╚══════╝ ╚═════╝ ╚═╝  ╚═╝╚═╝
`);
// Handle cancellation
let abortController = null;
let spinner = null;
async function activeChat(message, options) {
    const contextPaths = [];
    if (options.file)
        contextPaths.push(options.file);
    if (options.dir)
        contextPaths.push(options.dir);
    const shouldStream = options.stream !== false;
    abortController = new AbortController();
    try {
        process.stdout.write(`\n${LOKI_PREFIX} `);
        // Start spinner
        spinner = new spinner_1.Spinner();
        spinner.start();
        const response = await (0, agentRunner_1.agentRunner)(message, {
            provider: options.provider,
            agent: options.agent,
            useMemory: options.memory,
            fileContextPaths: contextPaths,
            stream: shouldStream,
            onToken: (token) => {
                // Stop spinner on first token
                if (spinner) {
                    spinner.stop();
                    spinner = null;
                }
                process.stdout.write(token);
            },
            signal: abortController.signal
        });
        // Ensure spinner is stopped if logic completed without streaming or buffered
        if (spinner) {
            spinner.stop();
            spinner = null;
        }
        if (!shouldStream) {
            console.log(response);
        }
        console.log('\n');
    }
    catch (error) {
        if (spinner) {
            spinner.stop();
            spinner = null;
        }
        if (error.message.includes('cancelled') || error.message.includes('Aborted')) {
            console.log(chalk_1.default.gray(' [Cancelled]\n'));
        }
        else {
            console.error(`\n${ERROR_PREFIX} ${error.message}\n`);
        }
    }
    finally {
        abortController = null;
    }
}
/**
 * Interactive Chat Session.
 * Returns a promise that resolves when the user types 'exit' or 'back'.
 */
async function startChatSession(options) {
    // Note: We don't clear screen here to preserve context if coming from menu, 
    // or let the clear happen if desired.
    // Actually, for a "sub-screen", a clear is nice, but maybe we just print a header.
    process.stdout.write('\x1Bc');
    console.log(chalk_1.default.green.bold('LOKI CHAT MODE'));
    console.log(chalk_1.default.gray('Type "exit" or "back" to return to main menu.\n'));
    const rl = readline_1.default.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: `${USER_PREFIX} `
    });
    return new Promise((resolve) => {
        rl.prompt();
        rl.on('SIGINT', () => {
            if (abortController) {
                abortController.abort();
            }
            else {
                // Return to menu on Ctrl+C (twice?) or just ask? 
                // For simplicity, let's treat idle Ctrl+C as "Back"
                console.log(chalk_1.default.gray('\nReturning to menu...'));
                rl.close();
                resolve();
            }
        });
        rl.on('line', async (line) => {
            const input = line.trim();
            if (input.toLowerCase() === 'exit' || input.toLowerCase() === 'back') {
                rl.close();
                resolve();
                return;
            }
            if (input) {
                rl.pause();
                await activeChat(input, options);
                rl.resume();
            }
            rl.prompt();
        });
    });
}
async function chatCommand(message, options) {
    const opts = {
        provider: options.provider,
        agent: options.agent,
        memory: options.memory,
        file: options.file,
        dir: options.dir,
        stream: options.stream
    };
    if (message) {
        await activeChat(message, opts);
    }
    else {
        await startChatSession(opts);
    }
}
