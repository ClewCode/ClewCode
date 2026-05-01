const fs = require('fs');
const content = fs.readFileSync('src/services/api/claude.ts', 'utf8');
const open = (content.match(/{/g) || []).length;
const close = (content.match(/}/g) || []).length;
console.log(`Open: ${open}, Close: ${close}`);
