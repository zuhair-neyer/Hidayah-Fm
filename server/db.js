const Database = require('better-sqlite3');
const path = require('node:path');
const { dataDir } = require('./config');
// SQLite contains public catalogue/cache data only. Accounts and libraries live in Firebase.
const db = new Database(path.join(dataDir, 'hidayah-catalogue.db'));
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS surahs(id INTEGER PRIMARY KEY,name_en TEXT NOT NULL,name_ar TEXT NOT NULL,meaning TEXT,ayah_count INTEGER NOT NULL,revelation_type TEXT NOT NULL CHECK(revelation_type IN ('Makki','Madani')),juz INTEGER);
CREATE TABLE IF NOT EXISTS reciters(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,name_ar TEXT,slug TEXT NOT NULL UNIQUE,country TEXT,style TEXT,image_url TEXT);
CREATE TABLE IF NOT EXISTS tracks(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,artist TEXT NOT NULL,type TEXT NOT NULL CHECK(type IN ('nasheed','naat')),language TEXT,mood TEXT,cover_url TEXT,audio_url TEXT,link_url TEXT,duration INTEGER,plays INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS ayah_cache(surah_id INTEGER PRIMARY KEY,payload TEXT NOT NULL,fetched_at TEXT NOT NULL DEFAULT(datetime('now')));
`);
module.exports = db;
