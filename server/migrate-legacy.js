const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const { randomUUID, createHash } = require('node:crypto');
const firebase = require('./firebase');
const { loadItemParser } = require('./utils/static-items');
function date(value) { return value.includes('T') ? value : value.replace(' ', 'T') + 'Z'; }
module.exports = async function migrate({ file, email, legacyPassword, firebasePassword, catalogueFile }) {
  const parseItem = loadItemParser(catalogueFile);
  await firebase.assertPrivateDatabase();
  const old = new Database(file, { readonly: true, fileMustExist: true });
  let snapshot;
  try {
    const user = old.prepare('SELECT * FROM users WHERE lower(email)=?').get(email.trim().toLowerCase());
    if (!user || !(await bcrypt.compare(legacyPassword, user.password_hash))) throw new Error('The old local email or password is incorrect.');
    const has = name => !!old.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name);
    snapshot = {
      user: { id: user.id, email: user.email, created_at: user.created_at },
      playlists: old.prepare('SELECT * FROM playlists WHERE user_id=?').all(user.id).map(p => ({ ...p, items: old.prepare('SELECT * FROM playlist_items WHERE playlist_id=? ORDER BY position,id').all(p.id) })),
      likes: old.prepare('SELECT * FROM likes WHERE user_id=?').all(user.id),
      history: old.prepare('SELECT * FROM history WHERE user_id=? ORDER BY played_at').all(user.id),
      progress: has('progress') ? old.prepare('SELECT * FROM progress WHERE user_id=?').all(user.id) : [],
      settings: has('preferences') ? JSON.parse(old.prepare('SELECT settings FROM preferences WHERE user_id=?').get(user.id)?.settings || '{}') : {}
    };
  } finally { old.close(); }
  const auth = await firebase.authRequest('signInWithPassword', { email: snapshot.user.email, password: firebasePassword, returnSecureToken: true });
  const identity = await firebase.identity(auth.idToken);
  await firebase.ensureUser(identity, auth.idToken);
  const importId = createHash('sha256').update(JSON.stringify(snapshot.user)).digest('hex');
  const playlists = snapshot.playlists.map(p => ({ ...p, destinationId: randomUUID(), items: p.items.map(i => ({ ...i, destinationId: randomUUID() })) }));
  return firebase.transaction(identity.id, auth.idToken, record => {
    if (record.legacy_imports?.[importId]) return { alreadyImported: true };
    const result = { playlists: 0, likes: 0, history: 0, progress: 0, skippedItems: 0 };
    const valid = value => { const parsed = parseItem(value); if (parsed.error) { result.skippedItems++; return null; } return parsed; };
    const keyOf = i => [i.item_type, i.item_id, i.reciter_id || 0].join(':');
    record.playlists ||= {}; record.likes ||= {}; record.history ||= {}; record.progress ||= {};
    for (const p of playlists) {
      const items = {};
      for (const entry of p.items) { const i = valid(entry); if (i) items[entry.destinationId] = { ...i, id: entry.destinationId, position: entry.position, added_at: date(entry.added_at) }; }
      record.playlists[p.destinationId] = { id: p.destinationId, name: p.name, color: p.color, created_at: date(p.created_at), items };
      result.playlists++;
    }
    for (const row of snapshot.likes) { const i = valid(row); if (!i) continue; const key = keyOf(i); if (!record.likes[key]) { record.likes[key] = { ...i, id: key, created_at: date(row.created_at) }; result.likes++; } }
    for (const row of snapshot.history) {
      const i = valid(row); if (!i) continue; const key = keyOf(i), previous = record.history[key], played = date(row.played_at);
      record.history[key] = { ...i, id: key, last_played: previous?.last_played > played ? previous.last_played : played, plays: (previous?.plays || 0) + 1,
        days: { ...previous?.days, [played.slice(0,10)]: true } }; result.history++;
    }
    for (const row of snapshot.progress) { const i = valid(row); if (!i) continue; const key = keyOf(i); if (!record.progress[key]) { record.progress[key] = { ...i, seconds: row.seconds, duration: row.duration, completed: !!row.completed, updated_at: date(row.updated_at) }; result.progress++; } }
    if (!record.settings && Object.keys(snapshot.settings).length) record.settings = snapshot.settings;
    record.legacy_imports ||= {}; record.legacy_imports[importId] = { imported_at: new Date().toISOString(), ...result };
    return result;
  });
};
