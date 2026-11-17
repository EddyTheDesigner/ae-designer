const fs = require('node:fs');
const path = require('node:path');
const acorn = require('acorn');
const root = path.resolve(__dirname, '..');
for (const file of fs.readdirSync(path.join(root, 'extension/js'))) {
  if (!file.endsWith('.js')) continue;
  acorn.parse(fs.readFileSync(path.join(root, 'extension/js', file), 'utf8'), { ecmaVersion: 2020 });
  console.log('CEP syntax:', file);
}
for (const file of fs.readdirSync(path.join(root,'extension/host')).filter(f=>f.endsWith('.jsx'))) {
const jsx=fs.readFileSync(path.join(root,'extension/host',file),'utf8').replace(/^#include.*$/mg,'');
acorn.parse(jsx,{ecmaVersion:3});console.log('ExtendScript ES3 syntax:',file);
}
const manifest = fs.readFileSync(path.join(root, 'extension/CSXS/manifest.xml'), 'utf8');
for (const [, value] of manifest.matchAll(/<(?:MainPath|ScriptPath)>([^<]+)<\//g)) {
  if (!fs.existsSync(path.join(root, 'extension', value))) throw Error('Missing manifest resource: ' + value);
}
for (const file of ['scripts/install-mac.command', 'extension/CSXS/manifest.xml']) {
  if (fs.readFileSync(path.join(root, file)).includes(Buffer.from('\r\n'))) throw Error('Expected LF endings: ' + file);
}
console.log('Manifest resource paths and Mac LF endings: OK');
