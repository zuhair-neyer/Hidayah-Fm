const path = require('node:path');
const fs = require('node:fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const dataDir = path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
fs.mkdirSync(dataDir, { recursive: true });
if (process.env.NODE_ENV === 'production' && (process.env.FIREBASE_AUTH_EMULATOR_HOST || process.env.FIREBASE_DATABASE_EMULATOR_HOST)) {
  throw new Error('Firebase emulators cannot be used in production.');
}
if (Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST) !== Boolean(process.env.FIREBASE_DATABASE_EMULATOR_HOST)) {
  throw new Error('Use both Firebase emulators together so tests cannot mix local and live services.');
}
module.exports = { dataDir, port: Number(process.env.PORT || 3000), host: process.env.HOST || '127.0.0.1' };
