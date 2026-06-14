import { logForDebugging } from './debug.js';
export function validateBoundedIntEnvVar(name, value, defaultValue, upperLimit) {
    if (!value) {
        return { effective: defaultValue, status: 'valid' };
    }
    const parsed = parseInt(value, 10);
    if (isNaN(parsed) || parsed <= 0) {
        const result = {
            effective: defaultValue,
            status: 'invalid',
            message: `Invalid value "${value}" (using default: ${defaultValue})`,
        };
        logForDebugging(`${name} ${result.message}`);
        return result;
    }
    if (parsed > upperLimit) {
        const result = {
            effective: upperLimit,
            status: 'capped',
            message: `Capped from ${parsed} to ${upperLimit}`,
        };
        logForDebugging(`${name} ${result.message}`);
        return result;
    }
    return { effective: parsed, status: 'valid' };
}
