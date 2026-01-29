import makeWASocket, {
    DisconnectReason,
    useMultiFileAuthState
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import { CONFIG } from '../../utils/config';
import { agentRunner } from '../../core/agentRunner';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs';
import pino from 'pino';

const authDir = path.join(CONFIG.CONFIG_DIR, 'whatsapp_baileys_auth');

export async function startWhatsAppClient() {
    console.log(chalk.blue.bold('📱 LOKI WhatsApp Client'));
    console.log(chalk.gray('Connecting...\n'));

    // Ensure auth directory exists
    if (!fs.existsSync(authDir)) {
        fs.mkdirSync(authDir, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(authDir);

    // Silent logger to reduce noise
    const logger = pino({ level: 'silent' });

    const sock = makeWASocket({
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
            console.log(chalk.yellow('\n📷 Scan this QR code with WhatsApp:\n'));
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

            console.log(chalk.red('Connection closed.'));

            if (shouldReconnect) {
                console.log(chalk.yellow('Reconnecting...'));
                startWhatsAppClient();
            } else {
                console.log(chalk.red('Logged out. Delete ~/.loki/whatsapp_baileys_auth to re-link.'));
            }
        } else if (connection === 'open') {
            console.log(chalk.green.bold('\n✅ LOKI WhatsApp Client Connected!'));
            console.log(chalk.cyan('Listening for messages. Send /ping to test.\n'));
        }
    });

    // Message handler
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg) return;

        // Skip if no message content
        if (!msg.message) return;

        // Skip status broadcasts
        if (msg.key.remoteJid === 'status@broadcast') return;

        // Get message text
        const text = msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            '';

        if (!text.trim()) return;

        const fromMe = msg.key.fromMe || false;
        const sender = msg.key.remoteJid || '';

        // Check if this is a self-chat (messaging yourself)
        const isSelfChat = sender.includes('@lid') || sender === msg.key.participant;

        console.log(chalk.magenta(`[MSG] ${sender}: "${text}" (fromMe: ${fromMe}, selfChat: ${isSelfChat})`));

        // CRITICAL: Only respond to incoming messages OR self-chat
        if (fromMe && !isSelfChat) {
            console.log(chalk.gray('  [Skipped - outgoing message to someone else]'));
            return;
        }

        // Skip LOKI's own responses (double safety)
        if (text.startsWith('🧠') || text.startsWith('🏓') || text.startsWith('⚠️')) {
            return;
        }

        const cmd = text.trim().toLowerCase();

        // Command: /ping
        if (cmd === '/ping') {
            console.log(chalk.yellow('→ Processing /ping'));
            await sock.sendMessage(sender, { text: '🏓 Pong! LOKI is online.' });
            console.log(chalk.green('✓ Sent pong'));
            return;
        }

        // Command: /help
        if (cmd === '/help') {
            await sock.sendMessage(sender, {
                text: `🧠 *LOKI Help*\n• Ask anything in natural language\n• /ping - Check if online\n• /help - Show this help`
            });
            console.log(chalk.green('✓ Sent help'));
            return;
        }

        // AI Processing for ALL messages (including self for testing)
        console.log(chalk.yellow('→ Processing with LOKI AI...'));

        // Show "typing..." indicator to user
        try {
            await sock.presenceSubscribe(sender);
            await sock.sendPresenceUpdate('composing', sender);
            console.log(chalk.gray('  [typing indicator sent]'));
        } catch (e) {
            console.log(chalk.gray('  [typing indicator failed]'));
        }

        try {
            // Use FULL agent mode with tools enabled
            const rawResponse = await agentRunner(text, {
                useMemory: true,
                stream: false,
                isChat: false  // Enable tools!
            });

            // Clean up response - remove code blocks and JSON artifacts
            let cleanResponse = rawResponse
                .replace(/```json[\s\S]*?```/g, '') // Remove JSON blocks
                .replace(/```[\s\S]*?```/g, '')     // Remove any code blocks
                .replace(/\{[^{}]*"tool"[^{}]*\}/g, '') // Remove inline tool JSON
                .replace(/\n{3,}/g, '\n\n')         // Collapse multiple newlines
                .trim();

            // If response is empty after cleanup, provide fallback
            if (!cleanResponse) {
                cleanResponse = "I've processed your request. Is there anything else you'd like to know?";
            }

            // Stop typing indicator
            try {
                await sock.sendPresenceUpdate('paused', sender);
            } catch (e) { }

            await sock.sendMessage(sender, { text: `🧠 ${cleanResponse}` });
            console.log(chalk.green('✓ Sent AI response'));
        } catch (e: any) {
            // Stop typing indicator on error too
            try {
                await sock.sendPresenceUpdate('paused', sender);
            } catch (err) { }

            console.error(chalk.red('AI Error:'), e.message);
            await sock.sendMessage(sender, { text: `⚠️ Error: ${e.message}` });
        }
    });
}
