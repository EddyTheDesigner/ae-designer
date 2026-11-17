const fs = require('node:fs/promises');
const path = require('node:path');
const archiver = require('archiver');
const { createWriteStream } = require('node:fs');
const root = path.resolve(__dirname, '..');
(async () => {
  const html = await fs.readFile(path.join(root, 'extension/index.html'), 'utf8');
  for (const panel of ['layers', 'properties']) await fs.writeFile(path.join(root, `extension/${panel}.html`), html.replace('<body>', `<body data-panel="${panel}">`));
  await fs.mkdir(path.join(root, 'dist'), { recursive: true });
  const target = path.join(root, 'dist/AE-Designer-Mac.zip');
  const output = createWriteStream(target);
  const zip = archiver('zip', { zlib: { level: 9 } });
  const completion = new Promise((resolve, reject) => { output.on('close', resolve); output.on('error', reject); zip.on('error', reject); });
  zip.pipe(output);
  for (const dir of ['extension', 'docs', 'tests']) zip.directory(path.join(root, dir), `AE-Designer/${dir}`);
  for (const file of ['README.md', 'LICENSE', 'THIRD-PARTY-NOTICES.md', 'package.json', 'package-lock.json', 'playwright.config.cjs']) zip.file(path.join(root, file), { name: `AE-Designer/${file}` });
  const scripts = await fs.readdir(path.join(root, 'scripts'));
  for (const script of scripts) zip.file(path.join(root, 'scripts', script), { name: `AE-Designer/scripts/${script}`, mode: script.endsWith('.command') || script.endsWith('.sh') ? 0o755 : 0o644 });
  try { await fs.access(path.join(root, 'dist/AE-Designer.zxp')); zip.file(path.join(root, 'dist/AE-Designer.zxp'), { name: 'AE-Designer/AE-Designer.zxp' }); } catch {}
  await zip.finalize(); await completion;
  console.log(target);
})().catch(error => { console.error(error); process.exit(1); });
