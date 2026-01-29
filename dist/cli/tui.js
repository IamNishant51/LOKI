"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startLoop = startLoop;
const readline_1 = __importDefault(require("readline"));
const chalk_1 = __importDefault(require("chalk"));
const chat_1 = require("./chat");
const doctor_1 = require("./doctor");
const refactorEngine_1 = require("../refactor/refactorEngine");
const indexer_1 = require("../rag/indexer");
const BANNER = chalk_1.default.green.bold(`
██╗      ██████╗ ██╗  ██╗██╗
██║     ██╔═══██╗██║ ██╔╝██║
██║     ██║   ██║█████╔╝ ██║
██║     ██║   ██║██╔═██╗ ██║
███████╗╚██████╔╝██║  ██╗██║
╚══════╝ ╚═════╝ ╚═╝  ╚═╝╚═╝
`);
// Simple prompt helper
function ask(question) {
    const rl = readline_1.default.createInterface({
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
    console.log(chalk_1.default.gray('\nPress any key to continue...'));
    process.stdin.setRawMode(true);
    return new Promise(resolve => {
        process.stdin.once('data', () => {
            process.stdin.setRawMode(false);
            resolve();
        });
    });
}
async function startLoop() {
    while (true) {
        process.stdout.write('\x1Bc'); // Clear screen
        console.log(BANNER);
        console.log(chalk_1.default.gray('  Local Omni Knowledge Interface\n'));
        console.log(chalk_1.default.white.bold('  MAIN MENU'));
        console.log(chalk_1.default.cyan('  [1]') + ' Chat with LOKI');
        console.log(chalk_1.default.cyan('  [2]') + ' Agent Workflow (Refactor/Plan)');
        console.log(chalk_1.default.cyan('  [3]') + ' Index Repository (RAG)');
        console.log(chalk_1.default.cyan('  [4]') + ' WhatsApp Link (QR)');
        console.log(chalk_1.default.cyan('  [5]') + ' System Doctor');
        console.log(chalk_1.default.cyan('  [6]') + ' Exit');
        console.log();
        const answer = await ask(chalk_1.default.green.bold('  SELECT ▸ '));
        switch (answer.trim()) {
            case '1':
                await (0, chat_1.startChatSession)({});
                break;
            case '2':
                process.stdout.write('\x1Bc');
                console.log(chalk_1.default.green.bold('LOKI AGENT WORKFLOW'));
                console.log(chalk_1.default.gray('Example: "Refactor gitTool to use async/await"\n'));
                const instruction = await ask(chalk_1.default.cyan('Describe task: '));
                if (instruction.trim()) {
                    await (0, refactorEngine_1.engineCommand)(instruction);
                }
                await waitForKey();
                break;
            case '3':
                process.stdout.write('\x1Bc');
                console.log(chalk_1.default.green.bold('LOKI RAG INDEXER'));
                await (0, indexer_1.indexRepository)();
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
                await (0, doctor_1.doctorCommand)();
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
