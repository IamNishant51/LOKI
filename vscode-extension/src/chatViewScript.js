const vscode = window.vscode;
let messagesEl, inputEl, sendBtn, contextBtn, modelSelect, contextChips, slashMenuEl;
let isGenerating = false;
let pendingContexts = [];
let slashCommands = {};
let slashMenuIndex = 0;

document.addEventListener('DOMContentLoaded', () => {
    messagesEl = document.getElementById('messages');
    inputEl = document.getElementById('chatInput');
    sendBtn = document.getElementById('sendBtn');
    contextBtn = document.getElementById('contextBtn');
    modelSelect = document.getElementById('modelSelect');
    contextChips = document.getElementById('contextChips');
    slashMenuEl = document.getElementById('slashMenu');

    // Bind Events
    if (sendBtn) sendBtn.addEventListener('click', handleSendOrStop);

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
            // In the new design, this specifically adds file context
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

    // Initial Load
    setTimeout(() => {
        vscode.postMessage({ type: 'getSlashCommands' });
    }, 100);
});

/* --- UI State Management --- */

function setGenerating(generating) {
    isGenerating = generating;
    if (generating) {
        sendBtn.innerHTML = 'Stop';
        sendBtn.title = 'Stop generating';
        inputEl.disabled = true;
        showSkeletonLoader();
    } else {
        sendBtn.innerHTML = 'Send';
        sendBtn.title = 'Send Message';
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
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M6 14.5L7.5 10l4.5-1.5L7.5 7 6 2.5 4.5 7 0 8.5l4.5 1.5z" /></svg>
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

/* --- Messaging Logic --- */

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

    // Clear welcome message if present
    const welcome = document.querySelector('.welcome-message');
    if (welcome) welcome.style.display = 'none';

    if (pendingContexts.length > 0) {
        const contextText = pendingContexts.map(c => c.content).join('\n\n');
        text = `${contextText}\n\n${text}`;
        pendingContexts = [];
        contextChips.innerHTML = '';
        vscode.postMessage({ type: 'clearedContext' }); // Optional: notify backend
    }

    // specific optimistic UI for user
    addMessage('user', inputEl.value.trim()); // Show original text without context header clutter

    vscode.postMessage({ type: 'chat', text });

    inputEl.value = '';
    inputEl.style.height = 'auto';
    setGenerating(true);
}

function addMessage(role, content) {
    // If it's the assistant, remove skeleton first (if it exists) just in case
    if (role === 'assistant') removeSkeletonLoader();

    const div = document.createElement('div');
    div.className = `message ${role}`;

    // User avatar: Person Icon, Assistant avatar: Robot/Sparkle
    const userIcon = `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm2-3a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm4 8c0 1-1 1-1 1H3s-1 0-1-1 1-4 6-4 6 3 6 4zm-1-.004c-.001-.246-.154-.986-.832-1.664C11.516 10.68 10.289 10 8 10c-2.29 0-3.516.68-4.168 1.332-.678.678-.83 1.418-.832 1.664h10z"/></svg>`;
    const aiIcon = `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M6 14.5L7.5 10l4.5-1.5L7.5 7 6 2.5 4.5 7 0 8.5l4.5 1.5z" /></svg>`;

    const avatarContent = role === 'user' ? userIcon : aiIcon;
    const senderName = role === 'user' ? 'You' : 'Loki AI';

    div.innerHTML = `
        <div class="message-header">
            <div class="avatar ${role}">${avatarContent}</div>
            <span>${senderName}</span>
        </div>
        <div class="message-content">${formatContent(content)}</div>
    `;

    messagesEl.appendChild(div);
    scrollToBottom();

    // Bind code block buttons
    div.querySelectorAll('.code-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const block = e.target.closest('.code-block');
            const code = block.querySelector('code').innerText;
            if (e.target.title === 'Copy') {
                vscode.postMessage({ type: 'copyCode', code });
                const originalHTML = e.target.innerHTML;
                e.target.innerHTML = `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/></svg>`;
                setTimeout(() => e.target.innerHTML = originalHTML, 1500);
            } else if (e.target.title === 'Insert') {
                vscode.postMessage({ type: 'insertCode', code });
            }
        });
    });
}

// Convert markdown-ish content to HTML
function formatContent(text) {
    if (!text) return '';

    // Basic escaping
    let html = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    // Code blocks
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
        return `<div class="code-block">
            <div class="code-header">
                <span>${lang || 'text'}</span>
                <div class="code-actions">
                    <button class="code-btn" title="Copy">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/><path d="M9.5 1h-3a.5.5 0 0 0-.5.5v1a.5.5 0 0 0 .5.5h3a.5.5 0 0 0 .5-.5v-1a.5.5 0 0 0-.5-.5zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3z"/></svg>
                        Copy
                    </button>
                    <button class="code-btn" title="Insert">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M15.502 1.94a.5.5 0 0 1 0 .706L14.459 3.69l-2-2L13.502.646a.5.5 0 0 1 .707 0l1.293 1.293zm-1.75 2.456-2-2L4.939 9.21a.5.5 0 0 0-.121.196l-.805 2.414a.25.25 0 0 0 .316.316l2.414-.805a.5.5 0 0 0 .196-.12l6.813-6.814z"/><path fill-rule="evenodd" d="M1 13.5A1.5 1.5 0 0 0 2.5 15h11a1.5 1.5 0 0 0 1.5-1.5v-6a.5.5 0 0 0-1 0v6a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5v-11a.5.5 0 0 1 .5-.5H9a.5.5 0 0 0 0-1H2.5A1.5 1.5 0 0 0 1 2.5v11z"/></svg>
                        Insert
                    </button>
                </div>
            </div>
            <pre><code>${code}</code></pre>
        </div>`;
    });

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Line breaks
    html = html.replace(/\n/g, '<br>');

    return html;
}

/* --- Streaming Support --- */

let streamDiv = null;
let streamContent = '';

function startStream() {
    removeSkeletonLoader(); // Ensure skeleton is gone
    streamContent = '';

    streamDiv = document.createElement('div');
    streamDiv.className = 'message assistant';
    streamDiv.innerHTML = `
        <div class="message-header">
            <div class="avatar assistant">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M6 14.5L7.5 10l4.5-1.5L7.5 7 6 2.5 4.5 7 0 8.5l4.5 1.5z" /></svg>
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
        // Re-bind buttons on the fully rendered content
        streamDiv.querySelectorAll('.code-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const block = e.target.closest('.code-block');
                const code = block.querySelector('code').innerText;
                if (e.target.title === 'Copy') {
                    vscode.postMessage({ type: 'copyCode', code });
                } else if (e.target.title === 'Insert') {
                    vscode.postMessage({ type: 'insertCode', code });
                }
            });
        });
    }
    streamDiv = null;
    setGenerating(false);
}

/* --- Input Handling --- */

function handleInputKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        // Check Slash Menu
        if (slashMenuEl.classList.contains('show')) {
            selectSlashItem();
            return;
        }
        sendMessage();
    }
    // Handle Slash Navigation
    if (slashMenuEl.classList.contains('show')) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            navigateSlashMenu(e.key === 'ArrowDown' ? 1 : -1);
        } else if (e.key === 'Escape' || e.key === 'Tab') {
            e.preventDefault();
            if (e.key === 'Tab') selectSlashItem();
            else hideSlashMenu();
        }
    }
}

function handleInputResize() {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';

    if (this.value.startsWith('/')) {
        showSlashMenu(this.value);
    } else {
        hideSlashMenu();
    }
}

/* --- Slash Menu --- */

function showSlashMenu(text) {
    const query = text.slice(1).toLowerCase();
    const matches = Object.entries(slashCommands).filter(([cmd]) =>
        cmd.slice(1).toLowerCase().startsWith(query)
    );

    if (matches.length === 0) {
        hideSlashMenu();
        return;
    }

    slashMenuEl.innerHTML = matches.map(([cmd, info], i) => `
        <div class="slash-item ${i === 0 ? 'selected' : ''}" data-cmd="${cmd}">
            <span class="slash-cmd">${cmd}</span>
            <span class="slash-desc">${info.description}</span>
        </div>
    `).join('');

    slashMenuEl.classList.add('show');
    slashMenuIndex = 0;

    // Click handlers
    slashMenuEl.querySelectorAll('.slash-item').forEach((item, i) => {
        item.addEventListener('click', () => {
            slashMenuIndex = i;
            selectSlashItem();
        });
    });
}

function hideSlashMenu() {
    slashMenuEl.classList.remove('show');
}

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

/* --- Context & Chips --- */

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

// Global Image Handler (called from HTML)
window.handleImageUpload = (input) => {
    if (input.files && input.files[0]) {
        vscode.postMessage({ type: 'pickImage' }); // Trigger vscode flow or handle file directly
        // For now, just show toast
        showToast('Image selected: ' + input.files[0].name);
    }
}

/* --- Utilities --- */

function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
}

function showToast(msg) {
    // Simple toast implementation
    const div = document.createElement('div');
    div.style.cssText = `
        position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%);
        background: var(--button-bg); color: var(--button-fg);
        padding: 8px 12px; border-radius: 4px; font-size: 12px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2); z-index: 1000;
        animation: fadeIn 0.3s;
    `;
    div.textContent = msg;
    document.body.appendChild(div);
    setTimeout(() => {
        div.style.opacity = 0;
        setTimeout(() => div.remove(), 300);
    }, 2000);
}

/* --- Message Listener --- */

window.addEventListener('message', event => {
    const msg = event.data;
    switch (msg.type) {
        case 'stream':
            appendStream(msg.chunk);
            if (msg.done) endStream();
            break;
        case 'message':
            // Only add if not user (handled optimistically) or if explicitly needed
            if (msg.role !== 'user') addMessage(msg.role, msg.content);
            break;
        case 'typing':
            if (msg.value) showSkeletonLoader();
            else removeSkeletonLoader();
            break;
        case 'contextAdded':
            addContextChip(msg.label, msg.content);
            break;
        case 'slashCommands':
            slashCommands = msg.commands;
            break;
        case 'toast':
            showToast(msg.message);
            break;
        case 'cleared':
            messagesEl.innerHTML = '';
            const welcomeMsg = document.querySelector('.welcome-message');
            if (welcomeMsg) welcomeMsg.style.display = 'flex';
            document.getElementById('historyPanel').classList.remove('show');
            break;
        case 'history':
            const panel = document.getElementById('historyPanel');
            panel.innerHTML = msg.sessions.map(s => `
                <div style="padding:8px; border-bottom:1px solid var(--border); cursor:pointer;" onclick="vscode.postMessage({type:'loadSession', id:'${s.id}'})">
                    <div style="font-weight:bold;font-size:12px;">${s.title}</div>
                    <div style="font-size:10px;opacity:0.6;">${s.date}</div>
                </div>
             `).join('');
            break;
    }
});
