const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const databaseHost = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
if (!/^127\.0\.0\.1:\d+$/.test(authHost || '') || !/^127\.0\.0\.1:\d+$/.test(databaseHost || '')) throw new Error('Rules tests require loopback Auth and Database emulators. Run npm test.');
const now = new Date().toISOString();
async function auth(action, body) {
  const response = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:${action}?key=rules-test-key`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal(response.status, 200);
  return response.json();
}
async function database(uid, token, path = '', method = 'GET', value) {
  const url = new URL(`http://${databaseHost}/users/${uid}${path ? '/' + path : ''}.json`);
  url.searchParams.set('ns', 'demo-hidayah-fm-default-rtdb');
  if (token) url.searchParams.set('auth', token);
  const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: value === undefined ? undefined : JSON.stringify(value) });
  return { status: response.status, body: await response.json() };
}
function fullRecord(user) {
  const item = { type: 'surah', id: 1, reciter_id: 1, title: 'Surah Al-Fatihah', title_ar: 'الفاتحة', subtitle: 'Mishary Rashid Alafasy', audio_url: 'https://download.quranicaudio.com/quran/mishaari_raashid_al_3afaasee/001.mp3', link_url: null, cover_url: null };
  return {
    profile: { id: user.localId, name: 'Rules Tester', email: user.email, created_at: now },
    settings: { city: 'London', country: 'United Kingdom', method: 3, reciter_id: 1, translation: true },
    playlists: { 'playlist-one': { id: 'playlist-one', name: 'Evening peace', color: '#1db98a', created_at: now, items: { 'entry-one': { id: 'entry-one', item_type: 'surah', item_id: 1, reciter_id: 1, position: 0, added_at: now } } } },
    likes: { 'track:1:0': { id: 'track:1:0', item_type: 'track', item_id: 1, reciter_id: null, created_at: now } },
    history: { 'surah:1:1': { id: 'surah:1:1', item_type: 'surah', item_id: 1, reciter_id: 1, last_played: now, plays: 1, days: { [now.slice(0, 10)]: true } } },
    progress: { 'surah:1:1': { item_type: 'surah', item_id: 1, reciter_id: 1, seconds: 20, duration: 30, completed: false, updated_at: now } },
    bookmark: { surah: 1, ayah: 3, name: 'Al-Fatihah' },
    playback: { item, queue: [item], time: 20, repeat: 'off', shuffle: false, updated_at: now },
    legacy_imports: { legacy: { imported_at: '2026-01-01T10:00:00Z', playlists: 1, likes: 0, history: 0, progress: 0, skippedItems: 0 } }
  };
}
async function fixture() {
  const email = 'rules-static-' + randomUUID() + '@example.test';
  const password = 'rules-test-password';
  const user = { ...(await auth('signUp', { email, password, returnSecureToken: true })), email, password };
  assert.equal((await database(user.localId, user.idToken, '', 'PUT', fullRecord(user))).status, 200);
  return user;
}
const denied = result => assert.equal(result.status, 401, JSON.stringify(result.body));

test('Firebase rules enforce private account ownership without an application server', async () => {
  const alice = await fixture(), bob = await fixture();
  assert.equal((await database(alice.localId, alice.idToken)).status, 200);
  denied(await database(alice.localId, null));
  denied(await database(alice.localId, bob.idToken));
  denied(await database(alice.localId, bob.idToken, 'profile/name', 'PUT', 'Intruder'));
  denied(await database(alice.localId, bob.idToken, '', 'DELETE'));
  denied(await database(alice.localId, null, '', 'PUT', fullRecord(alice)));
});

test('valid existing profiles, libraries, enriched playback and legacy imports remain compatible', async () => {
  const user = await fixture();
  const record = (await database(user.localId, user.idToken)).body;
  assert.equal(record.playlists['playlist-one'].items['entry-one'].item_id, 1);
  assert.equal(record.playback.queue[0].audio_url, fullRecord(user).playback.item.audio_url);
  assert.equal(record.legacy_imports.legacy.playlists, 1);
  assert.equal(record.likes['track:1:0'].reciter_id, undefined, 'Firebase legitimately omits nullable track reciter fields');
  assert.equal((await database(user.localId, user.idToken, '', 'PUT', record)).status, 200);
});

test('untrusted clients cannot inject malformed profile, settings or collection records', async () => {
  const user = await fixture();
  const invalid = [
    ['profile/id', 'different-user'], ['profile/email', 'someone-else@example.test'], ['profile/name', 'x'], ['profile/name', 'x'.repeat(61)], ['profile/created_at', 'changed-date'], ['profile/admin', true],
    ['settings/method', 999], ['settings/reciter_id', 99], ['settings/translation', 'yes'], ['settings/city', 'x'.repeat(101)], ['settings/admin', true],
    ['playlists', 'not-an-object'], ['playlists/playlist-one/id', 'mismatched-id'], ['playlists/playlist-one/name', ''], ['playlists/playlist-one/color', 'red'],
    ['playlists/playlist-one/items/entry-one/position', -1], ['playlists/playlist-one/items/entry-one/item_id', 999], ['playlists/playlist-one/items/entry-one/reciter_id', 8], ['playlists/playlist-one/items/entry-one/admin', true],
    ['likes', 'invalid'], ['likes/track:1:0/item_type', 'unknown'], ['likes/track:1:0/reciter_id', 1],
    ['history/surah:1:1/plays', -2], ['history/surah:1:1/days/not-a-day', true], ['history/surah:1:1/days/2026-01-01', 'yes'],
    ['progress/surah:1:1/seconds', 40], ['progress/surah:1:1/duration', 90000], ['progress/surah:1:1/completed', 'yes'],
    ['bookmark/surah', 115], ['bookmark/ayah', 0], ['bookmark/name', {}],
    ['playback/time', -1], ['playback/shuffle', 'on'], ['playback/repeat', 'forever'], ['playback/item/reciter_id', 9], ['playback/queue', 'bad-queue'], ['playback/queue/500', fullRecord(user).playback.item],
    ['legacy_imports/legacy/likes', -1], ['unexpected_private_data', 'value']
  ];
  for (const [path, value] of invalid) denied(await database(user.localId, user.idToken, path, 'PUT', value));
  assert.equal((await database(user.localId, user.idToken, 'profile/name')).body, 'Rules Tester');
});

test('clients cannot delete or roll back an existing session cutoff', async () => {
  const user = await fixture();
  const authTime = JSON.parse(Buffer.from(user.idToken.split('.')[1], 'base64url')).auth_time;
  assert.equal((await database(user.localId, user.idToken, 'auth_valid_after', 'PUT', authTime)).status, 200);
  denied(await database(user.localId, user.idToken, 'auth_valid_after', 'DELETE'));
  denied(await database(user.localId, user.idToken, 'auth_valid_after', 'PUT', authTime - 1));
  denied(await database(user.localId, user.idToken, 'auth_valid_after', 'PUT', authTime + 1));
  denied(await database(user.localId, user.idToken, '', 'PUT', fullRecord(user)));
  assert.equal((await database(user.localId, user.idToken, '', 'DELETE')).status, 200, 'Deleting the whole account record remains supported');
});

test('Firebase rules reject an older token after a newer session records a cutoff', async () => {
  const user = await fixture();
  const oldAuthTime = JSON.parse(Buffer.from(user.idToken.split('.')[1], 'base64url')).auth_time;
  await new Promise(resolve => setTimeout(resolve, Math.max(0, (oldAuthTime + 1) * 1000 - Date.now() + 50)));
  const fresh = await auth('signInWithPassword', { email: user.email, password: user.password, returnSecureToken: true });
  const cutoff = JSON.parse(Buffer.from(fresh.idToken.split('.')[1], 'base64url')).auth_time;
  assert.ok(cutoff > oldAuthTime);
  assert.equal((await database(user.localId, fresh.idToken, 'auth_valid_after', 'PUT', cutoff)).status, 200);
  denied(await database(user.localId, user.idToken));
  denied(await database(user.localId, user.idToken, 'profile/name', 'PUT', 'Old session'));
  assert.equal((await database(user.localId, fresh.idToken)).status, 200);
});

test('optional collections can be cleared while the required profile remains protected', async () => {
  const user = await fixture();
  for (const path of ['playlists/playlist-one/items', 'likes', 'history', 'progress', 'bookmark', 'playback/queue']) assert.equal((await database(user.localId, user.idToken, path, 'DELETE')).status, 200, path);
  denied(await database(user.localId, user.idToken, 'profile', 'DELETE'));
  const record = (await database(user.localId, user.idToken)).body;
  assert.ok(record.profile);
  assert.equal(record.playback.queue, undefined);
});
