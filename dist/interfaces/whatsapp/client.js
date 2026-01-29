"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startWhatsAppClient = startWhatsAppClient;
const baileys_1 = __importStar(require("@whiskeysockets/baileys"));
const qrcode_terminal_1 = __importDefault(require("qrcode-terminal"));
const config_1 = require("../../utils/config");
const agentRunner_1 = require("../../core/agentRunner");
const chalk_1 = __importDefault(require("chalk"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const pino_1 = __importDefault(require("pino"));
const authDir = path_1.default.join(config_1.CONFIG.CONFIG_DIR, 'whatsapp_baileys_auth');
async function startWhatsAppClient() {
    console.log(chalk_1.default.blue.bold('📱 LOKI WhatsApp Client'));
    console.log(chalk_1.default.gray('Connecting...\n'));
    // Ensure auth directory exists
    if (!fs_1.default.existsSync(authDir)) {
        fs_1.default.mkdirSync(authDir, { recursive: true });
    }
    const { state, saveCreds } = await (0, baileys_1.useMultiFileAuthState)(authDir);
    // Silent logger to reduce noise
    const logger = (0, pino_1.default)({ level: 'silent' });
    const sock = (0, baileys_1.default)({
        auth: state,
        browser: ['LOKI', 'Desktop', '1.0.0'],
        logger: logger
    });
    // Save credentials on update
    sock.ev.on('creds.update', saveCreds);
    // Connection updates
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        // Display QR code manually
        if (qr) {
            console.log(chalk_1.default.yellow('\n📷 Scan this QR code with WhatsApp:\n'));
            qrcode_terminal_1.default.generate(qr, { small: true });
        }
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== baileys_1.DisconnectReason.loggedOut;
            console.log(chalk_1.default.red('Connection closed.'));
            if (shouldReconnect) {
                console.log(chalk_1.default.yellow('Reconnecting...'));
                startWhatsAppClient();
            }
            else {
                console.log(chalk_1.default.red('Logged out. Delete ~/.loki/whatsapp_baileys_auth to re-link.'));
            }
        }
        else if (connection === 'open') {
            console.log(chalk_1.default.green.bold('\n✅ LOKI WhatsApp Client Connected!'));
            console.log(chalk_1.default.cyan('Listening for messages. Send /ping to test.\n'));
        }
    });
    // Message handler
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg)
            return;
        // Skip if no message content
        if (!msg.message)
            return;
        // Skip status broadcasts
        if (msg.key.remoteJid === 'status@broadcast')
            return;
        // Get message text
        const text = msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            '';
        if (!text.trim())
            return;
        const fromMe = msg.key.fromMe || false;
        const sender = msg.key.remoteJid || '';
        // Check if this is a self-chat (messaging yourself)
        const isSelfChat = sender.includes('@lid') || sender === msg.key.participant;
        console.log(chalk_1.default.magenta(`[MSG] ${sender}: "${text}" (fromMe: ${fromMe}, selfChat: ${isSelfChat})`));
        // CRITICAL: Only respond to incoming messages OR self-chat
        if (fromMe && !isSelfChat) {
            console.log(chalk_1.default.gray('  [Skipped - outgoing message to someone else]'));
            return;
        }
        // Skip LOKI's own responses (double safety)
        if (text.startsWith('🧠') || text.startsWith('🏓') || text.startsWith('⚠️')) {
            return;
        }
        const cmd = text.trim().toLowerCase();
        // Command: /ping
        if (cmd === '/ping') {
            console.log(chalk_1.default.yellow('→ Processing /ping'));
            await sock.sendMessage(sender, { text: '🏓 Pong! LOKI is online.' });
            console.log(chalk_1.default.green('✓ Sent pong'));
            return;
        }
        // Command: /help
        if (cmd === '/help') {
            await sock.sendMessage(sender, {
                text: `🧠 *LOKI Help*\n• Ask anything in natural language\n• /ping - Check if online\n• /help - Show this help`
            });
            console.log(chalk_1.default.green('✓ Sent help'));
            return;
        }
        // AI Processing for ALL messages (including self for testing)
        console.log(chalk_1.default.yellow('→ Processing with LOKI AI...'));
        // Show "typing..." indicator to user
        try {
            await sock.presenceSubscribe(sender);
            await sock.sendPresenceUpdate('composing', sender);
            console.log(chalk_1.default.gray('  [typing indicator sent]'));
        }
        catch (e) {
            console.log(chalk_1.default.gray('  [typing indicator failed]'));
        }
        try {
            // Use FULL agent mode with tools enabled
            const rawResponse = await (0, agentRunner_1.agentRunner)(text, {
                useMemory: true,
                stream: false,
                isChat: false // Enable tools!
            });
            // Clean up response - remove code blocks and JSON artifacts
            let cleanResponse = rawResponse
                .replace(/```json[\s\S]*?```/g, '') // Remove JSON blocks
                .replace(/```[\s\S]*?```/g, '') // Remove any code blocks
                .replace(/\{[^{}]*"tool"[^{}]*\}/g, '') // Remove inline tool JSON
                .replace(/\n{3,}/g, '\n\n') // Collapse multiple newlines
                .trim();
            // If response is empty after cleanup, provide fallback
            if (!cleanResponse) {
                cleanResponse = "I've processed your request. Is there anything else you'd like to know?";
            }
            // Stop typing indicator
            try {
                await sock.sendPresenceUpdate('paused', sender);
            }
            catch (e) { }
            await sock.sendMessage(sender, { text: `🧠 ${cleanResponse}` });
            console.log(chalk_1.default.green('✓ Sent AI response'));
        }
        catch (e) {
            // Stop typing indicator on error too
            try {
                await sock.sendPresenceUpdate('paused', sender);
            }
            catch (err) { }
            console.error(chalk_1.default.red('AI Error:'), e.message);
            await sock.sendMessage(sender, { text: `⚠️ Error: ${e.message}` });
        }
    });
}
