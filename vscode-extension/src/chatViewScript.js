const vscode = window.vscode;
let messagesEl, inputEl, sendBtn, contextBtn, modelSelect, contextChips, slashMenuEl;
let isGenerating = false;
let pendingContexts = [];
let slashCommands = {};
let slashMenuIndex = 0;

// Icons
const SEND_ICON = `<svg class="codicon" viewBox="0 0 16 16"><path d="M1.5 8a.5.5 0 0 1 .5-.5h10.793l-3.147-3.146a.5.5 0 1 1 .708-.708l4 4a.5.5 0 0 1 0 .708l-4 4a.5.5 0 0 1-.708-.708L12.793 8.5H2a.5.5 0 0 1-.5-.5z"/></svg>`;
const STOP_ICON = `<svg class="codicon" style="fill:red;" viewBox="0 0 16 16"><path d="M3.5 3.5h9v9h-9v-9z"/></svg>`;
const DELETE_ICON = `<svg class="codicon" viewBox="0 0 16 16"><path d="M11 2L9 2L8 1H4L3 2L1 2L1 3L2 3L2 14C2 14.55 2.45 15 3 15L9 15C9.55 15 10 14.55 10 14L10 3L11 3L11 2ZM4 14L4 3L5 3L5 14L4 14ZM7 14L6 14L6 3L7 3L7 14ZM9 14L8 14L8 3L9 3L9 14Z"/></svg>`;

// The new LOKI Text Logo
const LOKI_LOGO = `<svg width="80" height="30" viewBox="0 0 100 40" fill="currentColor">
    <path d="M10 5V30H25V35H5V5H10Z"/>
    <path d="M48 5H33V35H48V30H38V10H48V5Z M53 5H33V35H53V30H38V10H53V5Z" fill-rule="evenodd"/>
    <!-- O (simplified rectangular O matching screenshot) -->
    <path d="M35 5H55V35H35V5ZM40 10V30H50V10H40Z"/>
    <!-- K -->
    <path d="M65 5V35H70V23L78 35H85L75 20L85 5H78L70 17V5H65Z"/>
    <!-- I -->
    <path d="M90 5V35H95V5H90Z"/>
</svg>`;
// Actually, let's create a better path based on the L O K I pixel-font style.
// L: Top-Left at (0,0). Width 20.
// M5 5 V35 H25 V28 H12 V5 Z
// O: M35 5 H55 V35 H35 Z M42 12 V28 H48 V12 Z
// K: M65 5 V35 H72 V24 L80 35 H88 L78 21 L88 5 H80 L72 16 V5 Z
// I: M95 5 V35 H102 V5 Z
const LOKI_SVG = `
<svg width="100" height="40" viewBox="0 0 110 40" fill="currentColor">
  <path d="M5 5V35H28V28H13V5H5Z"/>
  <path d="M35 5H58V35H35V5ZM43 12V28H50V12H43Z"/>
  <path d="M65 5V35H73V23L83 35H93L80 19L93 5H83L73 17V5H65Z"/>
  <path d="M100 5V35H108V5H100Z"/>
</svg>`;

document.addEventListener('DOMContentLoaded', () => {
    messagesEl = document.getElementById('messages');
    inputEl = document.getElementById('chatInput');
    sendBtn = document.getElementById('sendBtn');
    contextBtn = document.getElementById('contextBtn');
    modelSelect = document.getElementById('modelSelect');
    contextChips = document.getElementById('contextChips');
    slashMenuEl = document.getElementById('slashMenu');

    // Bind Events
    if (sendBtn) {
        sendBtn.innerHTML = SEND_ICON;
        sendBtn.title = 'Send Message';
        sendBtn.addEventListener('click', handleSendOrStop);
    }

    if (inputEl) {
        inputEl.addEventListener('keydown', handleInputKeydown);
        inputEl.addEventListener('input', handleInputResize);
        inputEl.focus();
    }

    if (modelSelect) {
        modelSelect.addEventListener('change', () => {
            vscode.postMessage({ type: 'changeModel', model: modelSelect.value });
        });
    }

    if (contextBtn) {
        contextBtn.addEventListener('click', () => {
            vscode.postMessage({ type: 'addCurrentFile' });
        });
    }

    const newChatBtn = document.getElementById('newChatBtn');
    if (newChatBtn) {
        newChatBtn.addEventListener('click', () => {
            vscode.postMessage({ type: 'newChat' });
        });
    }

    const historyBtn = document.getElementById('historyBtn');
    if (historyBtn) {
        historyBtn.addEventListener('click', () => {
            const panel = document.getElementById('historyPanel');
            panel.classList.toggle('show');
            if (panel.classList.contains('show')) {
                vscode.postMessage({ type: 'getHistory' });
            }
        });
    }

    setTimeout(() => {
        vscode.postMessage({ type: 'getSlashCommands' });
    }, 100);
});

function setGenerating(generating) {
    isGenerating = generating;
    if (generating) {
        sendBtn.innerHTML = STOP_ICON;
        sendBtn.title = 'Stop generating';
        sendBtn.style.color = "red";
        inputEl.disabled = true;
        showSkeletonLoader();
    } else {
        sendBtn.innerHTML = SEND_ICON;
        sendBtn.title = 'Send Message';
        sendBtn.style.color = ""; // reset
        inputEl.disabled = false;
        inputEl.focus();
        removeSkeletonLoader();
    }
}

function showSkeletonLoader() {
    const loaderId = 'skeleton-loader';
    if (document.getElementById(loaderId)) return;

    const div = document.createElement('div');
    div.id = loaderId;
    div.className = 'message assistant';
    div.innerHTML = `
        <div class="message-header">
            <div class="avatar assistant">
                <!-- Use Sparkle for Loader -->
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M6 14.5L7.5 10l4.5-1.5L7.5 7 6 2.5 4.5 7 0 8.5l4.5 1.5z"/></svg>
            </div>
            <span>Loki AI</span>
        </div>
        <div class="message-content" style="width:100%">
            <div class="skeleton-container">
                <div class="skeleton-line"></div>
                <div class="skeleton-line medium"></div>
                <div class="skeleton-line short"></div>
            </div>
        </div>
    `;
    messagesEl.appendChild(div);
    scrollToBottom();
}

function removeSkeletonLoader() {
    const loader = document.getElementById('skeleton-loader');
    if (loader) loader.remove();
}

function handleSendOrStop() {
    if (isGenerating) {
        vscode.postMessage({ type: 'stop' });
        return;
    }
    sendMessage();
}

function sendMessage() {
    let text = inputEl.value.trim();
    if (!text && pendingContexts.length === 0) return;

    const welcome = document.querySelector('.welcome-message');
    if (welcome) welcome.style.display = 'none';

    if (pendingContexts.length > 0) {
        const contextText = pendingContexts.map(c => c.content).join('\n\n');
        text = `${contextText}\n\n${text}`;
        pendingContexts = [];
        contextChips.innerHTML = '';
        vscode.postMessage({ type: 'clearedContext' });
    }

    addMessage('user', inputEl.value.trim());
    vscode.postMessage({ type: 'chat', text });

    inputEl.value = '';
    inputEl.style.height = 'auto';
    setGenerating(true);
}

function addMessage(role, content) {
    if (role === 'assistant') removeSkeletonLoader();

    const div = document.createElement('div');
    div.className = `message ${role}`;

    // Only render header for assistant
    let headerHTML = '';
    if (role === 'assistant') {
        const aiIcon = `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M6 14.5L7.5 10l4.5-1.5L7.5 7 6 2.5 4.5 7 0 8.5l4.5 1.5z"/></svg>`;
        headerHTML = `
        <div class="message-header">
            <div class="avatar assistant">${aiIcon}</div>
            <span>Loki AI</span>
        </div>`;
    }

    div.innerHTML = `
        ${headerHTML}
        <div class="message-content">${formatContent(content)}</div>
    `;

    messagesEl.appendChild(div);
    scrollToBottom();

    // Bind buttons (only relevant for assistant mainly, but safe to keep generalized)
    div.querySelectorAll('.code-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const block = e.target.closest('.code-block');
            const code = block.querySelector('code').innerText;
            if (e.target.closest('.code-btn').title === 'Copy') {
                vscode.postMessage({ type: 'copyCode', code });
            } else if (e.target.closest('.code-btn').title === 'Insert') {
                vscode.postMessage({ type: 'insertCode', code });
            }
        });
    });
}

function formatContent(text) {
    if (!text) return '';
    let html = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
        return `<div class="code-block">
            <div class="code-header">
                <span>${lang || 'text'}</span>
                <div class="code-actions">
                    <button class="code-btn" title="Copy">
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/><path d="M9.5 1h-3a.5.5 0 0 0-.5.5v1a.5.5 0 0 0 .5.5h3a.5.5 0 0 0 .5-.5v-1a.5.5 0 0 0-.5-.5zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3z"/></svg>
                        Copy
                    </button>
                    <button class="code-btn" title="Insert">
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M15.502 1.94a.5.5 0 0 1 0 .706L14.459 3.69l-2-2L13.502.646a.5.5 0 0 1 .707 0l1.293 1.293zm-1.75 2.456-2-2L4.939 9.21a.5.5 0 0 0-.121.196l-.805 2.414a.25.25 0 0 0 .316.316l2.414-.805a.5.5 0 0 0 .196-.12l6.813-6.814z"/><path fill-rule="evenodd" d="M1 13.5A1.5 1.5 0 0 0 2.5 15h11a1.5 1.5 0 0 0 1.5-1.5v-6a.5.5 0 0 0-1 0v6a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5v-11a.5.5 0 0 1 .5-.5H9a.5.5 0 0 0 0-1H2.5A1.5 1.5 0 0 0 1 2.5v11z"/></svg>
                        Insert
                    </button>
                </div>
            </div>
            <pre><code>${code}</code></pre>
        </div>`;
    });
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    return html.replace(/\n/g, '<br>');
}

let streamDiv = null;
let streamContent = '';
function startStream() {
    removeSkeletonLoader();
    streamContent = '';
    streamDiv = document.createElement('div');
    streamDiv.className = 'message assistant';
    streamDiv.innerHTML = `
        <div class="message-header">
            <div class="avatar assistant">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M6 14.5L7.5 10l4.5-1.5L7.5 7 6 2.5 4.5 7 0 8.5l4.5 1.5z"/></svg>
            </div>
            <span>Loki AI</span>
        </div>
        <div class="message-content"></div>
    `;
    messagesEl.appendChild(streamDiv);
    scrollToBottom();
}

function appendStream(chunk) {
    if (!streamDiv) startStream();
    streamContent += chunk;
    streamDiv.querySelector('.message-content').innerHTML = formatContent(streamContent);
    scrollToBottom();
}

function endStream() {
    if (streamDiv) {
        streamDiv.querySelectorAll('.code-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const block = e.target.closest('.code-block');
                const code = block.querySelector('code').innerText;
                if (e.target.closest('.code-btn').title === 'Copy') {
                    vscode.postMessage({ type: 'copyCode', code });
                } else if (e.target.closest('.code-btn').title === 'Insert') {
                    vscode.postMessage({ type: 'insertCode', code });
                }
            });
        });
    }
    streamDiv = null;
    setGenerating(false);
}

function handleInputKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (slashMenuEl.classList.contains('show')) {
            selectSlashItem();
            return;
        }
        sendMessage();
    }
    if (slashMenuEl.classList.contains('show')) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            navigateSlashMenu(e.key === 'ArrowDown' ? 1 : -1);
        } else if (e.key === 'Escape' || e.key === 'Tab') {
            e.preventDefault();
            if (e.key === 'Tab') selectSlashItem(); else hideSlashMenu();
        }
    }
}

function handleInputResize() {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
    if (this.value.startsWith('/')) showSlashMenu(this.value); else hideSlashMenu();
}

function showSlashMenu(text) {
    const query = text.slice(1).toLowerCase();
    const matches = Object.entries(slashCommands).filter(([cmd]) => cmd.slice(1).toLowerCase().startsWith(query));
    if (matches.length === 0) { hideSlashMenu(); return; }
    slashMenuEl.innerHTML = matches.map(([cmd, info], i) => `
        <div class="slash-item ${i === 0 ? 'selected' : ''}" data-cmd="${cmd}">
            <span class="slash-cmd">${cmd}</span>
            <span class="slash-desc">${info.description}</span>
        </div>`).join('');
    slashMenuEl.classList.add('show');
    slashMenuIndex = 0;
    slashMenuEl.querySelectorAll('.slash-item').forEach((item, i) => {
        item.addEventListener('click', () => { slashMenuIndex = i; selectSlashItem(); });
    });
}
function hideSlashMenu() { slashMenuEl.classList.remove('show'); }
function navigateSlashMenu(dir) {
    const items = slashMenuEl.querySelectorAll('.slash-item');
    if (items.length === 0) return;
    items[slashMenuIndex].classList.remove('selected');
    slashMenuIndex = (slashMenuIndex + dir + items.length) % items.length;
    items[slashMenuIndex].classList.add('selected');
    items[slashMenuIndex].scrollIntoView({ block: 'nearest' });
}
function selectSlashItem() {
    const items = slashMenuEl.querySelectorAll('.slash-item');
    if (items[slashMenuIndex]) {
        const cmd = items[slashMenuIndex].dataset.cmd;
        inputEl.value = cmd + ' ';
        hideSlashMenu();
        inputEl.focus();
    }
}

function addContextChip(label, content) {
    const div = document.createElement('div');
    div.className = 'context-pill';
    div.innerHTML = `<span>${label}</span> <span class="remove">×</span>`;
    div.querySelector('.remove').addEventListener('click', () => {
        pendingContexts = pendingContexts.filter(c => c.content !== content);
        div.remove();
    });
    pendingContexts.push({ label, content });
    contextChips.appendChild(div);
}

window.handleImageUpload = (input) => {
    if (input.files && input.files[0]) {
        vscode.postMessage({ type: 'pickImage' });
        showToast('Image selected: ' + input.files[0].name);
    }
}

function scrollToBottom() { messagesEl.scrollTop = messagesEl.scrollHeight; }

function showToast(msg) {
    const div = document.createElement('div');
    div.style.cssText = `position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%); background: var(--button-bg); color: var(--button-fg); padding: 8px 12px; border-radius: 4px; font-size: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.2); z-index: 1000; animation: fadeIn 0.3s;`;
    div.textContent = msg;
    document.body.appendChild(div);
    setTimeout(() => { div.style.opacity = 0; setTimeout(() => div.remove(), 300); }, 2000);
}

window.addEventListener('message', event => {
    const msg = event.data;
    switch (msg.type) {
        case 'stream': appendStream(msg.chunk); if (msg.done) endStream(); break;
        case 'message': if (msg.role !== 'user') addMessage(msg.role, msg.content); break;
        case 'typing': if (msg.value) showSkeletonLoader(); else removeSkeletonLoader(); break;
        case 'contextAdded': addContextChip(msg.label, msg.content); break;
        case 'slashCommands': slashCommands = msg.commands; break;
        case 'toast': showToast(msg.message); break;
        case 'cleared':
            messagesEl.innerHTML = '';
            const welcomeMsg = document.querySelector('.welcome-message');
            if (welcomeMsg) welcomeMsg.style.display = 'flex';
            document.getElementById('historyPanel').classList.remove('show');
            break;
        case 'history':
            const panel = document.getElementById('historyPanel');
            panel.innerHTML = msg.sessions.length ? msg.sessions.map(s => `
                <div class="history-item-container" style="display:flex; justify-content:space-between; align-items:center;">
                    <div class="history-item" onclick="vscode.postMessage({type:'loadSession', id:'${s.id}'})" style="flex:1;">
                        <div class="history-item-title">${s.title}</div>
                        <div class="history-item-date">${s.date}</div>
                    </div>
                    <button class="history-delete-btn" onclick="vscode.postMessage({type:'deleteSession', id:'${s.id}'})" title="Delete Chat" style="background:transparent; border:none; color:var(--fg); opacity:0.6; cursor:pointer; padding:8px;">
                        ${DELETE_ICON}
                    </button>
                </div>
             `).join('') : '<div style="padding:16px; text-align:center; opacity:0.6;">No history</div>';
            break;
    }
});
