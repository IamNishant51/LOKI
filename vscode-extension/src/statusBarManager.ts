/**
 * statusBarManager.ts - Enhanced Status Bar for LOKI
 * 
 * Features:
 * - Model selector
 * - Activity spinner during processing
 * - Quick access to commands
 */

import * as vscode from 'vscode';

export class StatusBarManager {
    private statusItem: vscode.StatusBarItem;
    private modelItem: vscode.StatusBarItem;
    private spinnerInterval: NodeJS.Timeout | null = null;
    private currentModel: string = 'codellama';
    private isProcessing: boolean = false;

    private spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    private spinnerIndex = 0;

    constructor() {
        // Main status item (left side)
        this.statusItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            100
        );
        this.statusItem.command = 'loki.openChat';
        this.statusItem.tooltip = 'LOKI AI Assistant - Click to open chat';
        this.updateStatus();
        this.statusItem.show();

        // Model selector item (right side)
        this.modelItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            50
        );
        this.modelItem.command = 'loki.selectModel';
        this.modelItem.tooltip = 'Click to change model';
        this.updateModelDisplay();
        this.modelItem.show();

        // Load saved model
        this.loadSavedModel();
    }

    private loadSavedModel() {
        const config = vscode.workspace.getConfiguration('loki');
        this.currentModel = config.get<string>('model') || 'codellama';
        this.updateModelDisplay();
    }

    /**
     * Update the main status display
     */
    private updateStatus() {
        if (this.isProcessing) {
            this.statusItem.text = `$(loading~spin) LOKI`;
        } else {
            this.statusItem.text = '$(hubot) LOKI';
        }
    }

    /**
     * Update the model display
     */
    private updateModelDisplay() {
        const shortName = this.currentModel.split(':')[0].split('/').pop() || this.currentModel;
        this.modelItem.text = `$(symbol-misc) ${shortName}`;
    }

    /**
     * Start the processing indicator
     */
    startProcessing() {
        this.isProcessing = true;
        this.updateStatus();

        // Animate spinner
        if (this.spinnerInterval) {
            clearInterval(this.spinnerInterval);
        }

        this.spinnerInterval = setInterval(() => {
            this.spinnerIndex = (this.spinnerIndex + 1) % this.spinnerFrames.length;
            this.statusItem.text = `${this.spinnerFrames[this.spinnerIndex]} LOKI`;
        }, 100);
    }

    /**
     * Stop the processing indicator
     */
    stopProcessing() {
        this.isProcessing = false;

        if (this.spinnerInterval) {
            clearInterval(this.spinnerInterval);
            this.spinnerInterval = null;
        }

        this.updateStatus();
    }

    /**
     * Set the current model
     */
    setModel(model: string) {
        this.currentModel = model;
        this.updateModelDisplay();

        // Save to config
        const config = vscode.workspace.getConfiguration('loki');
        config.update('model', model, vscode.ConfigurationTarget.Global);
    }

    /**
     * Get the current model
     */
    getModel(): string {
        return this.currentModel;
    }

    /**
     * Show model picker
     */
    async showModelPicker() {
        const models = await this.getAvailableModels();

        const items = models.map(m => ({
            label: m,
            description: m === this.currentModel ? '(current)' : '',
            picked: m === this.currentModel
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a model',
            title: 'LOKI: Change Model'
        });

        if (selected) {
            this.setModel(selected.label);
            vscode.window.showInformationMessage(`LOKI: Switched to ${selected.label}`);
        }
    }

    /**
     * Get available Ollama models
     */
    private async getAvailableModels(): Promise<string[]> {
        try {
            const http = require('http');
            const config = vscode.workspace.getConfiguration('loki');
            const baseUrl = config.get<string>('ollamaUrl') || 'http://localhost:11434';
            const url = new URL(baseUrl);

            return new Promise((resolve) => {
                const req = http.get({
                    hostname: url.hostname,
                    port: url.port || 11434,
                    path: '/api/tags',
                    timeout: 5000
                }, (res: any) => {
                    let data = '';
                    res.on('data', (chunk: any) => data += chunk);
                    res.on('end', () => {
                        try {
                            const parsed = JSON.parse(data);
                            const models = (parsed.models || []).map((m: any) => m.name);
                            resolve(models.length > 0 ? models : this.getDefaultModels());
                        } catch {
                            resolve(this.getDefaultModels());
                        }
                    });
                });

                req.on('error', () => resolve(this.getDefaultModels()));
                req.on('timeout', () => {
                    req.destroy();
                    resolve(this.getDefaultModels());
                });
            });
        } catch {
            return this.getDefaultModels();
        }
    }

    private getDefaultModels(): string[] {
        return [
            'codellama',
            'codellama:13b',
            'codellama:34b',
            'mistral:7b',
            'llama3',
            'llama3:70b',
            'qwen2.5-coder',
            'qwen2.5-coder:7b',
            'deepseek-coder',
            'deepseek-coder:6.7b',
            'starcoder2',
            'codegemma'
        ];
    }

    /**
     * Show a temporary message in status bar
     */
    showMessage(message: string, timeout: number = 3000) {
        const originalText = this.statusItem.text;
        this.statusItem.text = `$(hubot) ${message}`;

        setTimeout(() => {
            this.statusItem.text = originalText;
        }, timeout);
    }

    dispose() {
        if (this.spinnerInterval) {
            clearInterval(this.spinnerInterval);
        }
        this.statusItem.dispose();
        this.modelItem.dispose();
    }
}
