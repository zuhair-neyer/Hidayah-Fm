const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const root = path.resolve(__dirname, '..');
const version = require('../package.json').version;
const roots = ['public','server','scripts','tests','package.json','package-lock.json','README.md','VALIDATION.md','.env.example','.gitignore','.firebaserc','firebase.json','netlify.toml','database.rules.json','playwright.config.cjs','Start-Hidayah.cmd'];
const files = [];
function visit(relative) {
  if (relative.replaceAll('\\','/').startsWith('public/media')) return;
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) return;
  const info = fs.lstatSync(file);
  if (info.isSymbolicLink()) throw new Error('Source packages cannot contain symlinks: ' + relative);
  if (info.isDirectory()) { for (const child of fs.readdirSync(file)) visit(path.join(relative, child)); return; }
  if (/(?:\.db(?:-wal|-shm)?$|\.session-secret$|service[-_]account|credentials|private[-_]key)/i.test(relative)) throw new Error('Private data cannot be packaged: ' + relative);
  files.push({ name: relative.replaceAll('\\','/'), data: fs.readFileSync(file) });
}
roots.forEach(visit); files.sort((a,b) => a.name.localeCompare(b.name));
const manifest = { version, files: files.map(f => ({ path: f.name, bytes: f.data.length, sha256: crypto.createHash('sha256').update(f.data).digest('hex') })) };
fs.writeFileSync(path.join(root, 'PACKAGE-MANIFEST.json'), JSON.stringify(manifest, null, 2));
files.push({ name: 'PACKAGE-MANIFEST.json', data: Buffer.from(JSON.stringify(manifest, null, 2)) });
function crc32(bytes) { let crc = 0xffffffff; for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); } return (crc ^ 0xffffffff) >>> 0; }
const locals = [], central = []; let offset = 0;
for (const file of files) {
  const name = Buffer.from('hidayah-fm/' + file.name), data = zlib.deflateRawSync(file.data), crc = crc32(file.data);
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20,4); local.writeUInt16LE(0x800,6); local.writeUInt16LE(8,8); local.writeUInt16LE(33,12); local.writeUInt32LE(crc,14); local.writeUInt32LE(data.length,18); local.writeUInt32LE(file.data.length,22); local.writeUInt16LE(name.length,26);
  locals.push(local,name,data);
  const entry = Buffer.alloc(46); entry.writeUInt32LE(0x02014b50); entry.writeUInt16LE(20,4); entry.writeUInt16LE(20,6); entry.writeUInt16LE(0x800,8); entry.writeUInt16LE(8,10); entry.writeUInt16LE(33,14); entry.writeUInt32LE(crc,16); entry.writeUInt32LE(data.length,20); entry.writeUInt32LE(file.data.length,24); entry.writeUInt16LE(name.length,28); entry.writeUInt32LE(offset,42);
  central.push(entry,name); offset += local.length + name.length + data.length;
}
const directory = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(files.length,8); end.writeUInt16LE(files.length,10); end.writeUInt32LE(directory.length,12); end.writeUInt32LE(offset,16);
const destination = path.resolve(root, '..', `hidayah-fm-v${version}.zip`);
fs.writeFileSync(destination, Buffer.concat([...locals,directory,end]));
console.log(`Source package: ${destination}\n${files.length} files. Excludes databases, session secrets, node_modules, .env and local media.`);
