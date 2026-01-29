import readline from 'readline';
import chalk from 'chalk';
import { startChatSession } from './chat';
import { doctorCommand } from './doctor';
import { engineCommand } from '../refactor/refactorEngine';
import { indexRepository } from '../rag/indexer';

const BANNER = chalk.green.bold(`
██╗      ██████╗ ██╗  ██╗██╗
██║     ██╔═══██╗██║ ██╔╝██║
██║     ██║   ██║█████╔╝ ██║
██║     ██║   ██║██╔═██╗ ██║
███████╗╚██████╔╝██║  ██╗██║
╚══════╝ ╚═════╝ ╚═╝  ╚═╝╚═╝
`);

// Simple prompt helper
function ask(question: string): Promise<string> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    return new Promise(resolve => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer);
        });
    });
}

async function waitForKey() {
    console.log(chalk.gray('\nPress any key to continue...'));
    process.stdin.setRawMode(true);
    return new Promise<void>(resolve => {
        process.stdin.once('data', () => {
            process.stdin.setRawMode(false);
            resolve();
        });
    });
}

export async function startLoop() {
    while (true) {
        process.stdout.write('\x1Bc'); // Clear screen
        console.log(BANNER);
        console.log(chalk.gray('  Local Omni Knowledge Interface\n'));

        console.log(chalk.white.bold('  MAIN MENU'));
        console.log(chalk.cyan('  [1]') + ' Chat with LOKI');
        console.log(chalk.cyan('  [2]') + ' Agent Workflow (Refactor/Plan)');
        console.log(chalk.cyan('  [3]') + ' Index Repository (RAG)');
        console.log(chalk.cyan('  [4]') + ' WhatsApp Link (QR)');
        console.log(chalk.cyan('  [5]') + ' System Doctor');
        console.log(chalk.cyan('  [6]') + ' Exit');
        console.log();

        const answer = await ask(chalk.green.bold('  SELECT ▸ '));

        switch (answer.trim()) {
            case '1':
                await startChatSession({});
                break;
            case '2':
                process.stdout.write('\x1Bc');
                console.log(chalk.green.bold('LOKI AGENT WORKFLOW'));
                console.log(chalk.gray('Example: "Refactor gitTool to use async/await"\n'));
                const instruction = await ask(chalk.cyan('Describe task: '));
                if (instruction.trim()) {
                    await engineCommand(instruction);
                }
                await waitForKey();
                break;
            case '3':
                process.stdout.write('\x1Bc');
                console.log(chalk.green.bold('LOKI RAG INDEXER'));
                await indexRepository();
                await waitForKey();
                break;
            case '4':
                process.stdout.write('\x1Bc');
                const { startWhatsAppClient } = require('../interfaces/whatsapp/client');
                await startWhatsAppClient();
                await waitForKey();
                break;
            case '5':
                process.stdout.write('\x1Bc');
                await doctorCommand();
                await waitForKey();
                break;
            case '6':
            case 'exit':
                console.log('Goodbye.');
                process.exit(0);
            default:
                break;
        }
    }
}
