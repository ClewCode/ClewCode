const fs = require('fs');
const content = fs.readFileSync('src/utils/sessionStorage.ts', 'utf8');
const lines = content.split('\n');
let depth = 0;
for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let prevDepth = depth;
    for (let char of line) {
        if (char === '{') { depth++; }
        if (char === '}') { depth--; }
    }
    if (depth !== prevDepth) {
        console.log(`Line ${i+1} (depth ${prevDepth} -> ${depth}): ${line.trim()}`);
    }
}
console.log(`Final depth: ${depth}`);
