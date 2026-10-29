const readline = require('node:readline');
const { Writable } = require('node:stream');
const path = require('node:path');
const [file, email] = process.argv.slice(2);
if (!file || !email) {
  console.log('Usage: npm run migrate -- "C:/private/path/hidayah.db" you@example.com\nCreate your Firebase account in the app first. The old database is read-only and never added to the source package.');
  process.exit(0);
}
if (!process.stdin.isTTY) { console.error('Run migration in an interactive terminal so passwords stay hidden.'); process.exit(1); }
let hidden = false;
const output = new Writable({ write(chunk, encoding, done) { if (!hidden) process.stdout.write(chunk); done(); } });
output.isTTY = true; output.columns = process.stdout.columns || 80;
const rl = readline.createInterface({ input: process.stdin, output, terminal: true });
const secret = prompt => new Promise(resolve => { hidden = false; rl.question(prompt, value => { hidden = false; process.stdout.write('\n'); resolve(value); }); hidden = true; });
rl.on('SIGINT', () => { rl.close(); process.exit(1); });
(async () => {
  try {
    const legacyPassword = await secret('Old local account password: ');
    const firebasePassword = await secret('New Firebase account password: ');
    const result = await require('../server/migrate-legacy')({ file: path.resolve(file), email, legacyPassword, firebasePassword });
    console.log(result.alreadyImported ? 'This local account has already been imported.' : 'Imported into Firebase: ' + JSON.stringify(result));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
  finally { rl.close(); }
})();
