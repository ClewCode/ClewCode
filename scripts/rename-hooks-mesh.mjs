import fs from 'fs';
for (const f of fs.readdirSync('src/hooks')) {
  const nn = f.replace(/A2A/g, 'Mesh').replace(/a2a/g, 'mesh');
  if (nn !== f) fs.renameSync('src/hooks/' + f, 'src/hooks/' + nn);
}
console.log('DONE');
