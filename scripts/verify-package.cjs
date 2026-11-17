const fs = require('node:fs/promises');
const path = require('node:path');
const zlib = require('node:zlib');

function entries(bytes) {
  let end = bytes.length - 22;
  while (end >= Math.max(0, bytes.length - 65557) && bytes.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0 || bytes.readUInt32LE(end) !== 0x06054b50) throw Error('ZIP directory missing.');
  const count = bytes.readUInt16LE(end + 10), files = new Map();
  let at = bytes.readUInt32LE(end + 16);
  for (let i = 0; i < count; i++) {
    if (bytes.readUInt32LE(at) !== 0x02014b50) throw Error('Invalid ZIP entry.');
    const size = bytes.readUInt32LE(at + 20), nameLength = bytes.readUInt16LE(at + 28), extra = bytes.readUInt16LE(at + 30), comment = bytes.readUInt16LE(at + 32), offset = bytes.readUInt32LE(at + 42), method = bytes.readUInt16LE(at + 10);
    const name = bytes.toString('utf8', at + 46, at + 46 + nameLength);
    const start = offset + 30 + bytes.readUInt16LE(offset + 26) + bytes.readUInt16LE(offset + 28);
    const raw = bytes.subarray(start, start + size);
    if (method !== 0 && method !== 8) throw Error('Unsupported ZIP compression.');
    if (files.has(name)) throw Error('Duplicate ZIP entry: ' + name);
    files.set(name, method === 8 ? zlib.inflateRawSync(raw) : raw);
    at += 46 + nameLength + extra + comment;
  }
  return files;
}

async function verifyZxp(extension, file) {
  const packaged = entries(await fs.readFile(file)), expected = new Map();
  async function walk(dir, prefix = '') {
    for (const entry of await fs.readdir(dir, {withFileTypes:true})) {
      const name = prefix + entry.name, full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full, name + '/');
      else expected.set(name, await fs.readFile(full));
    }
  }
  await walk(extension);
  const differences = [];
  for (const [name, bytes] of expected) {
    if (!packaged.has(name)) differences.push('missing ' + name);
    else if (!bytes.equals(packaged.get(name))) differences.push('changed ' + name);
  }
  for (const name of packaged.keys()) {
    if (name.endsWith('/') || name === 'mimetype' || name.startsWith('META-INF/')) continue;
    if (!expected.has(name)) differences.push('unexpected ' + name);
  }
  if (differences.length) throw Error('The signed ZXP does not match extension source: ' + differences.join(', ') + '. Sign to a new output filename, verify it, then replace the old ZXP.');
  return {files:expected.size};
}

module.exports = {verifyZxp, entries};
if (require.main === module) {
  const root = path.resolve(__dirname, '..');
  verifyZxp(path.join(root, 'extension'), process.argv[2] || path.join(root, 'dist/AE-Designer.zxp'))
    .then(result => console.log('ZXP source content matches: ' + result.files + ' files.'))
    .catch(error => {console.error(error.message);process.exitCode=1;});
}
