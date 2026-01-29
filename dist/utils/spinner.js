"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Spinner = void 0;
const chalk_1 = __importDefault(require("chalk"));
class Spinner {
    constructor(text = '') {
        this.text = text;
        this.frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
        this.interval = null;
        this.current = 0;
        this.isSpinning = false;
    }
    start() {
        if (this.isSpinning)
            return;
        this.isSpinning = true;
        process.stdout.write('\x1B[?25l'); // Hide cursor
        this.interval = setInterval(() => {
            // Clear line from cursor position to end (simplified: just backspace and rewrite)
            // We assume we are appending to the current line.
            // To properly "animate" without destroying previous text on the line (like the prefix),
            // we essentially print the frame, then backspace.
            const frame = chalk_1.default.gray(this.frames[this.current]);
            process.stdout.write(frame);
            process.stdout.write(`\b`); // Move back 1 char (assuming frame is 1 char)
            // Note: Braille chars are usually 1 column in terminals.
            this.current = (this.current + 1) % this.frames.length;
        }, 80);
    }
    stop() {
        if (!this.isSpinning)
            return;
        if (this.interval)
            clearInterval(this.interval);
        this.isSpinning = false;
        // Clear the spinner character
        process.stdout.write(' '); // overwrite with space
        process.stdout.write('\b'); // back to position
        process.stdout.write('\x1B[?25h'); // Show cursor
    }
}
exports.Spinner = Spinner;
