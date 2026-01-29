#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const chat_1 = require("./cli/chat");
const doctor_1 = require("./cli/doctor");
const refactorEngine_1 = require("./refactor/refactorEngine");
const indexer_1 = require("./rag/indexer");
const config_1 = require("./utils/config");
const chalk_1 = __importDefault(require("chalk"));
const program = new commander_1.Command();
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
    .description(`${chalk_1.default.green.bold(ASCII_ART)}\nLocal-first AI developer platform.`)
    .version(config_1.CONFIG.VERSION);
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
    await (0, chat_1.chatCommand)(message, options);
});
program
    .command('doctor')
    .description('System health check.')
    .action(async () => {
    await (0, doctor_1.doctorCommand)();
});
program
    .command('workflow <instruction>')
    .description('Run a multi-agent workflow (e.g. refactor).')
    .action(async (instruction) => {
    await (0, refactorEngine_1.engineCommand)(instruction);
});
program
    .command('index')
    .description('Index current repository for RAG.')
    .action(async () => {
    await (0, indexer_1.indexRepository)();
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
}
else {
    program.parse(process.argv);
}
