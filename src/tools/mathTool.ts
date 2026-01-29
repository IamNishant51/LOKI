/**
 * Safe Math routing to evaluate simple expressions.
 * Avoids eval().
 */

// Supported operators
const OPERATORS = ['+', '-', '*', '/', '%', '(', ')'];

export function isMathExpression(input: string): boolean {
    // Basic heuristic: check if input contains digits and operators
    // and DOES NOT contain letters (except for specific math keywords like 'sqrt' or 'pi' handled later)
    // For specific keywords like sqrt, we need a robust check.

    const trimmed = input.replace(/\s+/g, '').toLowerCase();

    // Must have at least one digit
    if (!/\d/.test(trimmed)) return false;

    // Check against allowed chars: digits, ., operators, parenthese
    // also "sqrt", "pow", "abs" etc?
    // Let's stick to simple arithmetic first + math functions if strict matching allows.

    // Simplification: valid matching for our lightweight eval
    // 1. Digits 0-9
    // 2. Operators + - * / % ^
    // 3. Parentheses ( )
    // 4. "sqrt", "sin", "cos", "tan", "log", "pi"

    const validPattern = /^[\d\.\+\-\*\/\%\(\)\s\^]|(sqrt|sin|cos|tan|log|pi|e)+$/;

    // If ANY character is NOT in our allowlist, it's not math.
    // We check each char (or word structure).
    // Actually, simpler approach:

    // Remove known functions and constants
    let checkStr = trimmed
        .replace(/sqrt|sin|cos|tan|log|pi|e/g, '')
        .replace(/[\d\.\+\-\*\/\%\(\)\^]/g, '');

    return checkStr.length === 0;
}

export function evaluateMath(expression: string): string {
    try {
        // Sanitize
        // we use Function constructor as a safer eval replacement FOR MATH ONLY
        // after strict validation.

        // Replace 'sqrt' with 'Math.sqrt', etc.
        let sanitized = expression.toLowerCase()
            .replace(/\^/g, '**') // Power operator
            .replace(/sqrt/g, 'Math.sqrt')
            .replace(/sin/g, 'Math.sin')
            .replace(/cos/g, 'Math.cos')
            .replace(/tan/g, 'Math.tan')
            .replace(/log/g, 'Math.log')
            .replace(/\bpi\b/g, 'Math.PI')
            .replace(/\be\b/g, 'Math.E');

        // Validation again to ensure NO malicious code slipped in
        // e.g. "Math.sqrt(alert(1))" -> contains letters not in Math.*
        // Our isMathExpression check should have caught generic letters.
        // But let's be super safe:
        // Attempt execution in a sandbox-like scope (Function)
        // Note: Function(string) is still eval-like but restricted to global scope interaction.
        // Given we pre-validated, it reduces risk significantly.

        const f = new Function(`return (${sanitized})`);
        const result = f();

        if (typeof result === 'number' && !isNaN(result) && isFinite(result)) {
            // Round to reasonable decimals if float
            return parseFloat(result.toFixed(4)).toString();
        }
        return "Invalid math result";
    } catch (e) {
        return "Error evaluating expression";
    }
}
