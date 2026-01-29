import readline from 'readline';
import chalk from 'chalk';
import { agentRunner } from '../core/agentRunner';
import { Spinner } from '../utils/spinner';

interface ChatCommandOptions {
    provider?: string;
    agent?: string;
    memory?: boolean;
    file?: string;
    dir?: string;
    stream?: boolean;
}

const LOKI_PREFIX = chalk.green.bold('LOKI │');
const USER_PREFIX = chalk.blue.bold('USER │');
const ERROR_PREFIX = chalk.red.bold('ERR  │');

const BANNER = chalk.green.bold(`
██╗      ██████╗ ██╗  ██╗██╗
██║     ██╔═══██╗██║ ██╔╝██║
██║     ██║   ██║█████╔╝ ██║
██║     ██║   ██║██╔═██╗ ██║
███████╗╚██████╔╝██║  ██╗██║
╚══════╝ ╚═════╝ ╚═╝  ╚═╝╚═╝
`);

// Handle cancellation
let abortController: AbortController | null = null;
let spinner: Spinner | null = null;

async function activeChat(message: string, options: ChatCommandOptions) {
    const contextPaths: string[] = [];
    if (options.file) contextPaths.push(options.file);
    if (options.dir) contextPaths.push(options.dir);

    const shouldStream = options.stream !== false;
    abortController = new AbortController();

    try {
        process.stdout.write(`\n${LOKI_PREFIX} `);

        // Start spinner
        spinner = new Spinner();
        spinner.start();

        const response = await agentRunner(message, {
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

    } catch (error: any) {
        if (spinner) {
            spinner.stop();
            spinner = null;
        }

        if (error.message.includes('cancelled') || error.message.includes('Aborted')) {
            console.log(chalk.gray(' [Cancelled]\n'));
        } else {
            console.error(`\n${ERROR_PREFIX} ${error.message}\n`);
        }
    } finally {
        abortController = null;
    }
}

/**
 * Interactive Chat Session.
 * Returns a promise that resolves when the user types 'exit' or 'back'.
 */
export async function startChatSession(options: ChatCommandOptions): Promise<void> {
    // Note: We don't clear screen here to preserve context if coming from menu, 
    // or let the clear happen if desired.
    // Actually, for a "sub-screen", a clear is nice, but maybe we just print a header.
    process.stdout.write('\x1Bc');
    console.log(chalk.green.bold('LOKI CHAT MODE'));
    console.log(chalk.gray('Type "exit" or "back" to return to main menu.\n'));

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: `${USER_PREFIX} `
    });

    return new Promise((resolve) => {
        rl.prompt();

        rl.on('SIGINT', () => {
            if (abortController) {
                abortController.abort();
            } else {
                // Return to menu on Ctrl+C (twice?) or just ask? 
                // For simplicity, let's treat idle Ctrl+C as "Back"
                console.log(chalk.gray('\nReturning to menu...'));
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

export async function chatCommand(message: string | undefined, options: any) {
    const opts: ChatCommandOptions = {
        provider: options.provider,
        agent: options.agent,
        memory: options.memory,
        file: options.file,
        dir: options.dir,
        stream: options.stream
    };

    if (message) {
        await activeChat(message, opts);
    } else {
        await startChatSession(opts);
    }
}
