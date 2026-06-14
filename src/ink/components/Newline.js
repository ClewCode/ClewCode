import { jsx as _jsx } from "react/jsx-runtime";
/**
 * Adds one or more newline (\n) characters. Must be used within <Text> components.
 */
export default function Newline({ count = 1 }) {
    return _jsx("ink-text", { children: '\n'.repeat(count) });
}
