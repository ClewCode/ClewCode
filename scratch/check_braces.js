const fs = require('fs');
const content = fs.readFileSync('src/utils/sessionStorage.ts', 'utf8');
let depth = 0;
let inString = null;
let inRegex = false;
let inComment = false;

for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i+1];
    
    if (inComment) {
        if (inComment === 'single' && char === '\n') inComment = false;
        if (inComment === 'multi' && char === '*' && nextChar === '/') {
            inComment = false;
            i++;
        }
        continue;
    }
    
    if (inString) {
        if (char === inString && content[i-1] !== '\\') inString = null;
        continue;
    }
    
    if (char === '/' && nextChar === '/') { inComment = 'single'; i++; continue; }
    if (char === '/' && nextChar === '*') { inComment = 'multi'; i++; continue; }
    
    if (char === '"' || char === "'" || char === '`') { inString = char; continue; }
    
    if (char === '{') depth++;
    if (char === '}') depth--;
    
    if (depth < 0) {
        console.log(`Negative depth at index ${i}, line ${content.substring(0, i).split('\n').length}`);
        process.exit(1);
    }
}
console.log(`Final depth: ${depth}`);
