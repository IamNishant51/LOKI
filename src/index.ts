#!/usr/bin/env node
import { Command } from 'commander';
import { chatCommand } from './cli/chat';
import { doctorCommand } from './cli/doctor';
import { engineCommand } from './refactor/refactorEngine';
import { indexRepository } from './rag/indexer';
import { CONFIG } from './utils/config';
import chalk from 'chalk';

const program = new Command();

const ASCII_ART = `
██╗      ██████╗ ██╗  ██╗██╗
██║     ██╔═══██╗██║ ██╔╝██║
██║     ██║   ██║█████╔╝ ██║
██║     ██║   ██║██╔═██╗ ██║
███████╗╚██████╔╝██║  ██╗██║
╚══════╝ ╚═════╝ ╚═╝  ╚═╝╚═╝
`;

program
    .name('loki')
    .description(`${chalk.green.bold(ASCII_ART)}\nLocal-first AI developer platform.`)
    .version(CONFIG.VERSION);

program
    .command('chat [message]')
    .description('Chat with LOKI.')
    .option('-p, --provider <name>', 'model provider: ollama or groq', 'ollama')
    .option('-a, --agent <name>', 'agent persona: dev, explain, refactor', 'dev')
    .option('--no-memory', 'disable persistent memory')
    .option('--no-stream', 'disable streaming output')
    .option('-f, --file <path>', 'add a single file to context')
    .option('-d, --dir <path>', 'add a directory files to context')
    .action(async (message, options) => {
        await chatCommand(message, options);
    });

program
    .command('doctor')
    .description('System health check.')
    .action(async () => {
        await doctorCommand();
    });

program
    .command('workflow <instruction>')
    .description('Run a multi-agent workflow (e.g. refactor).')
    .action(async (instruction) => {
        await engineCommand(instruction);
    });

program
    .command('index')
    .description('Index current repository for RAG.')
    .action(async () => {
        await indexRepository();
    });

program
    .command('server')
    .description('Start the WhatsApp webhook server.')
    .action(async () => {
        // Lazy load to avoid require cost if not used
        const { startWhatsAppClient } = require('./interfaces/whatsapp/client');
        await startWhatsAppClient();
    });

// Check if any command was provided
if (process.argv.length <= 2) {
    // No args passed. Launch TUI.
    // Need to import dynamically or at top. 
    // We can just rely on the import we will add.
    const { startLoop } = require('./cli/tui');
    startLoop();
} else {
    program.parse(process.argv);
}
