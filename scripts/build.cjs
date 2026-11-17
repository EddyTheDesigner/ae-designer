const fs = require('node:fs/promises');
const path = require('node:path');
const archiver = require('archiver');
const { createWriteStream } = require('node:fs');
const root = path.resolve(__dirname, '..');
const {verifyZxp} = require('./verify-package.cjs');
(async () => {
  const html = await fs.readFile(path.join(root, 'extension/index.html'), 'utf8');
  for (const panel of ['layers', 'properties']) await fs.writeFile(path.join(root, `extension/${panel}.html`), html.replace('<body>', `<body data-panel="${panel}">`));
  await fs.mkdir(path.join(root, 'dist'), { recursive: true });
  const zxpPath=path.join(root,'dist/AE-Designer.zxp');let hasZxp=false;
  if(!process.argv.includes('--source-only')){try{await fs.access(zxpPath);hasZxp=true;}catch(error){if(error.code!=='ENOENT')throw error;}}
  if(process.argv.includes('--require-zxp')&&!hasZxp)throw Error('A signed ZXP is required for this release build.');
  if(hasZxp)await verifyZxp(path.join(root,'extension'),zxpPath);
  const target = path.join(root, 'dist/AE-Designer-Mac.zip');
  const output = createWriteStream(target);
  const zip = archiver('zip', { zlib: { level: 9 } });
  const completion = new Promise((resolve, reject) => { output.on('close', resolve); output.on('error', reject); zip.on('error', reject); });
  zip.pipe(output);
  for (const dir of ['extension', 'docs', 'tests']) zip.directory(path.join(root, dir), `AE-Designer/${dir}`);
  for (const file of ['README.md', 'LICENSE', 'THIRD-PARTY-NOTICES.md', 'package.json', 'package-lock.json', 'playwright.config.cjs']) zip.file(path.join(root, file), { name: `AE-Designer/${file}` });
  const scripts = await fs.readdir(path.join(root, 'scripts'));
  for (const script of scripts) zip.file(path.join(root, 'scripts', script), { name: `AE-Designer/scripts/${script}`, mode: script.endsWith('.command') || script.endsWith('.sh') ? 0o755 : 0o644 });
  if(hasZxp) zip.file(zxpPath, { name: 'AE-Designer/AE-Designer.zxp' });
  await zip.finalize(); await completion;
  console.log(target);
})().catch(error => { console.error(error); process.exit(1); });
