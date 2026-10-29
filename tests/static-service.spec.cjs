const { test, expect, installEmulators, firebaseTestConfig, service } = require('./static-fixtures.cjs');
const password = 'static-service-test-password';
const authBase = `http://${firebaseTestConfig.authHost}/identitytoolkit.googleapis.com/v1`;
const databaseBase = `http://${firebaseTestConfig.databaseHost}`;
const databasePattern = databaseBase + '/users/*.json?*';
function databaseURL(uid, token) { return databaseBase + '/users/' + uid + '.json?ns=demo-hidayah-fm-default-rtdb&auth=' + encodeURIComponent(token); }
async function rawAuth(request, action, data) {
  const response = await request.post(authBase + '/accounts:' + action + '?key=static-service-test-key', { data });
  expect(response.status()).toBe(200);
  return response.json();
}
async function resetCode(request, account) {
  await rawAuth(request, 'sendOobCode', { requestType: 'PASSWORD_RESET', email: account.user.email });
  const response = await request.get(`http://${firebaseTestConfig.authHost}/emulator/v1/projects/demo-hidayah-fm/oobCodes`);
  return (await response.json()).oobCodes.filter(item => item.email === account.user.email && item.requestType === 'PASSWORD_RESET').at(-1).oobCode;
}

async function signup(page) {
  const email = `service-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
  await page.goto('/#/login');
  return page.evaluate(async ({ email, password }) => {
    const { api, saveSession } = await import('/js/client.js');
    const data = await api('/auth/signup', 'POST', { name: 'Facade Tester', email, password });
    saveSession(data);
    return data;
  }, { email, password });
}
async function signedContext(browser, account) {
  const context = await browser.newContext();
  await installEmulators(context);
  const apiRequests = [];
  context.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/')) apiRequests.push(request.url()); });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:3081/#/login');
  await page.evaluate(async ({ email, password }) => {
    const { api, saveSession } = await import('/js/client.js');
    saveSession(await api('/auth/login', 'POST', { email, password }));
  }, { email: account.user.email, password });
  return { page, close: async () => { expect(apiRequests).toEqual([]); await context.close(); } };
}
async function successful(page, endpoint, method, body) {
  const result = await service(page, endpoint, method, body);
  expect(result.ok, result.error || endpoint).toBeTruthy();
  return result.body;
}

test('static services persist profile, preferences, bookmark and playback and export no credentials', async ({ page }) => {
  const account = await signup(page);
  expect((await service(page, '/auth/me', 'PATCH', { name: [] })).status).toBe(400);
  await successful(page, '/auth/me', 'PATCH', { name: 'Updated Listener' });
  const settings = { city: 'London', country: 'United Kingdom', method: 3, reciter_id: 3, translation: false };
  expect((await service(page, '/auth/settings', 'PUT', { ...settings, reciter_id: 99 })).status).toBe(400);
  expect((await service(page, '/auth/settings', 'PUT', { ...settings, country: '' })).status).toBe(400);
  await successful(page, '/auth/settings', 'PUT', settings);
  await successful(page, '/auth/bookmark', 'PUT', { surah: 1, ayah: 3 });
  expect((await service(page, '/auth/bookmark', 'PUT', { surah: 1, ayah: 8 })).status).toBe(400);
  const item = { type: 'surah', id: 1, reciter_id: 1 };
  await successful(page, '/auth/playback', 'PUT', { item, queue: [item, { ...item, id: 2 }], time: 12, repeat: 'all', shuffle: true });
  const exported = await successful(page, '/auth/export');
  expect(exported.user.id).toBe(account.user.id);
  expect(exported.user.name).toBe('Updated Listener');
  expect(exported.settings).toEqual(settings);
  expect(exported.bookmark).toEqual({ surah: 1, ayah: 3, name: 'Al-Fatihah' });
  expect(exported.playback.item.audio_url).toMatch(/^https:/);
  expect(exported.playback.queue.map(entry => entry.id)).toEqual([1, 2]);
  expect(exported.playback.time).toBe(12);
  expect((await successful(page, '/auth/state')).playback.repeat).toBe('all');
  expect((await successful(page, '/auth/settings')).settings).toEqual(settings);
  const serialized = JSON.stringify(exported);
  for (const credential of [password, account.token, account.refreshToken, 'password_hash']) expect(serialized).not.toContain(credential);
});

test('static playlist services preserve ownership, uniqueness, ordering and CRUD behavior', async ({ page, browser }) => {
  const account = await signup(page);
  const otherContext = await browser.newContext();
  await installEmulators(otherContext);
  const otherPage = await otherContext.newPage();
  try {
    await signup(otherPage);
    expect((await service(page, '/playlists', 'POST', { name: {} })).status).toBe(400);
    const playlist = await successful(page, '/playlists', 'POST', { name: 'Evening collection', color: '#2468ab' });
    for (const method of ['GET', 'PATCH', 'DELETE']) expect((await service(otherPage, '/playlists/' + playlist.id, method, method === 'PATCH' ? { name: 'Not mine' } : undefined)).status).toBe(404);
    const surah = { item_type: 'surah', item_id: 1, reciter_id: 1 };
    await successful(page, '/playlists/' + playlist.id + '/items', 'POST', surah);
    await successful(page, '/playlists/' + playlist.id + '/items', 'POST', { item_type: 'track', item_id: 120 });
    expect((await service(page, '/playlists/' + playlist.id + '/items', 'POST', surah)).status).toBe(409);
    const initial = await successful(page, '/playlists/' + playlist.id);
    expect(initial.items.map(item => item.id)).toEqual([1, 120]);
    const order = initial.items.map(item => item.entry_id).reverse();
    expect((await service(page, '/playlists/' + playlist.id + '/order', 'PUT', { entry_ids: [order[0], order[0]] })).status).toBe(400);
    await successful(page, '/playlists/' + playlist.id + '/order', 'PUT', { entry_ids: order });
    expect((await successful(page, '/playlists/' + playlist.id)).items.map(item => item.entry_id)).toEqual(order);
    await successful(page, '/playlists/' + playlist.id, 'PATCH', { name: 'Quiet collection' });
    const renamed = await successful(page, '/playlists/' + playlist.id);
    expect(renamed.name).toBe('Quiet collection');
    expect(renamed.color).toBe('#2468ab');
    await successful(page, '/playlists/' + playlist.id + '/items/' + order[0], 'DELETE');
    expect((await successful(page, '/playlists/' + playlist.id)).items).toHaveLength(1);
    await successful(page, '/playlists/' + playlist.id, 'DELETE');
    expect((await service(page, '/playlists/' + playlist.id)).status).toBe(404);
    expect((await successful(page, '/auth/me')).user.id).toBe(account.user.id);
  } finally { await otherContext.close(); }
});

test('static likes and history support later catalogue entries and preserve completed progress', async ({ page }) => {
  await signup(page);
  const track = { item_type: 'track', item_id: 120 };
  expect((await successful(page, '/likes/toggle', 'POST', track)).liked).toBe(true);
  expect((await successful(page, '/likes')).likes[0].id).toBe(120);
  expect((await service(page, '/likes/toggle', 'POST', { item_type: 'surah', item_id: 999 })).status).toBe(400);
  const item = { item_type: 'surah', item_id: 1, reciter_id: 1 };
  await successful(page, '/history', 'POST', item);
  await successful(page, '/history', 'POST', item);
  expect((await successful(page, '/history?limit=200')).history).toHaveLength(1);
  expect((await service(page, '/history/progress', 'POST', { ...item, seconds: 70, duration: 30 })).status).toBe(400);
  await successful(page, '/history/progress', 'POST', { ...item, seconds: 30, duration: 30, completed: true });
  await successful(page, '/history/progress', 'POST', { ...item, seconds: 2, duration: 30, completed: false });
  await successful(page, '/history/progress', 'POST', { ...item, reciter_id: 2, seconds: 30, duration: 30, completed: true });
  const stats = await successful(page, '/history/stats');
  expect(stats.plays).toBe(2);
  expect(stats.completed_surahs).toBe(1);
  expect(stats.progress.find(entry => entry.reciter_id === 1).completed).toBe(true);
  await successful(page, '/history', 'DELETE');
  expect((await successful(page, '/history/stats')).completed_surahs).toBe(0);
  expect((await successful(page, '/history')).history).toHaveLength(0);
  expect((await successful(page, '/likes')).likes[0].id).toBe(120);
  expect((await successful(page, '/likes/toggle', 'POST', track)).liked).toBe(false);
});

test('two browser contexts retry a conflicting Firebase update without losing either change', async ({ page, browser }) => {
  const account = await signup(page);
  const other = await signedContext(browser, account);
  let ready = 0, release;
  const bothReady = new Promise(resolve => { release = resolve; });
  const endpoint = /\/users\/[^/?]+\.json(?:\?|$)/;
  let conflicts = 0;
  for (const target of [page, other.page]) {
    let held = false;
    target.on('response', response => { if (endpoint.test(response.url()) && response.status() === 412) conflicts++; });
    await target.route(endpoint, async route => {
      if (route.request().method() === 'PUT' && !held) {
        held = true;
        if (++ready === 2) release();
        await bothReady;
      }
      await route.continue();
    });
  }
  try {
    const [playlist, liked] = await Promise.all([
      successful(page, '/playlists', 'POST', { name: 'Concurrent playlist' }),
      successful(other.page, '/likes/toggle', 'POST', { item_type: 'track', item_id: 120 })
    ]);
    expect(liked.liked).toBe(true);
    expect(conflicts).toBeGreaterThan(0);
    const exported = await successful(page, '/auth/export');
    expect(exported.playlists.some(item => item.id === playlist.id)).toBeTruthy();
    expect(exported.likes.some(item => item.item_type === 'track' && item.item_id === 120)).toBeTruthy();
  } finally { await other.close(); }
});

test('password changes reject earlier ID tokens in both the facade and Firebase rules', async ({ page, request }) => {
  const account = await signup(page);
  expect((await service(page, '/auth/change-password', 'POST', { current_password: 'incorrect', new_password: 'replacement-password' })).status).toBe(403);
  const changed = await successful(page, '/auth/change-password', 'POST', { current_password: password, new_password: 'replacement-password' });
  const stale = await page.evaluate(async token => {
    const { dispatch } = await import('/js/static-api.js');
    try { await dispatch('/auth/me', 'GET', undefined, token); return { accepted: true }; }
    catch (error) { return { accepted: false, status: error.status }; }
  }, account.token);
  expect(stale).toEqual({ accepted: false, status: 401 });
  const oldDatabase = await request.get(`http://${firebaseTestConfig.databaseHost}/users/${account.user.id}.json?ns=demo-hidayah-fm-default-rtdb&auth=${encodeURIComponent(account.token)}`);
  expect(oldDatabase.status()).toBe(401);
  await page.evaluate(async changed => { (await import('/js/client.js')).saveSession(changed); }, changed);
  expect((await successful(page, '/auth/me')).user.id).toBe(account.user.id);
  expect((await service(page, '/auth/login', 'POST', { email: account.user.email, password })).status).toBe(401);
  expect((await service(page, '/auth/login', 'POST', { email: account.user.email, password: 'replacement-password' })).ok).toBeTruthy();
});

test('existing Firebase library shapes remain readable and survive subsequent edits', async ({ page }) => {
  await signup(page);
  await page.evaluate(async () => {
    const { session } = await import('/js/client.js');
    const { transaction } = await import('/js/firebase-service.js');
    await transaction(session.user.id, session.token, record => {
      const stamp = '2026-01-01T10:00:00Z';
      record.playlists['legacy-list'] = { id: 'legacy-list', name: 'Old library', color: '#1db98a', created_at: stamp, items: { 'legacy-entry': { id: 'legacy-entry', item_type: 'track', item_id: 1, reciter_id: null, position: 4, added_at: stamp } } };
      record.likes = { 'track:1:0': { id: 'track:1:0', item_type: 'track', item_id: 1, reciter_id: null, created_at: stamp } };
      record.history = { 'surah:1:1': { id: 'surah:1:1', item_type: 'surah', item_id: 1, reciter_id: 1, last_played: stamp, plays: 2, days: { '2026-01-01': true } } };
      record.progress = { 'surah:1:1': { item_type: 'surah', item_id: 1, reciter_id: 1, seconds: 30, duration: 30, completed: true, updated_at: stamp } };
      record.settings = { method: 3, reciter_id: 1, translation: false };
      record.bookmark = { surah: 1, ayah: 3, name: 'Al-Fatihah' };
      const item = { type: 'surah', id: 1, reciter_id: 1, title: 'Surah Al-Fatihah', title_ar: 'الفاتحة', subtitle: 'Mishary Rashid Alafasy', audio_url: 'https://download.quranicaudio.com/quran/mishaari_raashid_al_3afaasee/001.mp3', link_url: null, cover_url: null };
      record.playback = { item, queue: [item], time: 12, repeat: 'off', shuffle: false, updated_at: stamp };
      record.legacy_imports = { migration: { imported_at: stamp, playlists: 1, likes: 1, history: 2, progress: 1, skippedItems: 0 } };
    });
  });
  const legacy = await successful(page, '/playlists/legacy-list');
  expect(legacy.items[0].entry_id).toBe('legacy-entry');
  expect(legacy.items[0].id).toBe(1);
  expect((await successful(page, '/likes')).likes[0].id).toBe(1);
  expect((await successful(page, '/history/stats')).completed_surahs).toBe(1);
  expect((await successful(page, '/auth/state')).playback.time).toBe(12);
  await successful(page, '/playlists/legacy-list', 'PATCH', { name: 'Still my old library' });
  await successful(page, '/likes/toggle', 'POST', { item_type: 'track', item_id: 120 });
  const exported = await successful(page, '/auth/export');
  expect(exported.playlists.find(item => item.id === 'legacy-list').items[0].position).toBe(4);
  expect(exported.settings).toEqual({ method: 3, reciter_id: 1, translation: false });
  expect(exported.bookmark.ayah).toBe(3);
  const marker = await page.evaluate(async () => {
    const { session } = await import('/js/client.js');
    const { read } = await import('/js/firebase-service.js');
    return (await read(session.user.id, session.token)).value.legacy_imports.migration;
  });
  expect(marker.history).toBe(2);
});

test('the browser facade loads the complete static catalogue and rejects malformed registration', async ({ page }) => {
  await signup(page);
  const surahs = (await successful(page, '/surahs')).surahs;
  expect(surahs).toHaveLength(114);
  expect(surahs.reduce((sum, row) => sum + row.ayah_count, 0)).toBe(6236);
  expect((await successful(page, '/reciters')).reciters.filter(row => row.audio_available)).toHaveLength(6);
  expect((await successful(page, '/tracks?type=nasheed&limit=200')).tracks).toHaveLength(60);
  expect((await successful(page, '/tracks?type=naat&limit=200')).tracks).toHaveLength(60);
  expect((await successful(page, '/tracks/search?q=114')).surahs[0].id).toBe(114);
  expect((await successful(page, '/surahs/1/ayahs')).ayahs).toHaveLength(7);
  expect((await service(page, '/auth/signup', 'POST', { name: {}, email: [], password: 42 })).status).toBe(400);
});

test('an existing Firebase account opens with its original profile and library IDs', async ({ page, request }) => {
  const email = 'existing-static-' + Date.now() + '@example.test';
  const user = await rawAuth(request, 'signUp', { email, password, returnSecureToken: true });
  const created = '2026-01-01T10:00:00Z';
  const record = { profile: { id: user.localId, name: 'Existing Listener', email, created_at: created },settings: { city: 'Makkah', country: 'Saudi Arabia', method: 4, reciter_id: 2, translation: false },playlists: { previous: { id: 'previous', name: 'Existing favourites', color: '#1db98a', created_at: created,items: { first: { id: 'first', item_type: 'surah', item_id: 1, reciter_id: 1, position: 0, added_at: created } } } },likes: { 'track:1:0': { id: 'track:1:0', item_type: 'track', item_id: 1, created_at: created } },bookmark: { surah: 1, ayah: 3, name: 'Al-Fatihah' } };
  expect((await request.put(databaseURL(user.localId, user.idToken), { data: record })).status()).toBe(200);
  await page.goto('/#/login');
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.locator('[name=password]').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('.welcome')).toContainText('Existing');
  const exported = await successful(page, '/auth/export');
  expect(exported.user).toEqual(record.profile);
  expect(exported.settings).toEqual(record.settings);
  expect(exported.playlists[0].id).toBe('previous');
  expect(exported.playlists[0].items[0].id).toBe('first');
  expect(exported.likes).toHaveLength(1);
  expect(exported.bookmark).toEqual(record.bookmark);
});

test('password reset is single-use and revokes old private-data access in Firebase rules', async ({ page, request }) => {
  const account = await signup(page);
  await rawAuth(request, 'sendOobCode', { requestType: 'VERIFY_EMAIL', idToken: account.token });
  const codesURL = `http://${firebaseTestConfig.authHost}/emulator/v1/projects/demo-hidayah-fm/oobCodes`;
  const verification = (await (await request.get(codesURL)).json()).oobCodes.find(item => item.email === account.user.email && item.requestType === 'VERIFY_EMAIL');
  expect((await service(page, '/auth/reset-password/verify', 'POST', { oobCode: verification.oobCode })).status).toBe(400);
  expect((await service(page, '/auth/reset-password/confirm', 'POST', { oobCode: verification.oobCode, new_password: 'changed-static-password' })).status).toBe(400);
  expect((await rawAuth(request, 'update', { oobCode: verification.oobCode })).emailVerified).toBe(true);
  const oobCode = await resetCode(request, account);
  expect((await successful(page, '/auth/reset-password/verify', 'POST', { oobCode })).email).toBe(account.user.email);
  await successful(page, '/auth/reset-password/confirm', 'POST', { oobCode, new_password: 'changed-static-password' });
  expect((await request.get(databaseURL(account.user.id, account.token))).status()).toBe(401);
  expect((await service(page, '/auth/reset-password/verify', 'POST', { oobCode })).status).toBe(400);
  expect((await service(page, '/auth/login', 'POST', { email: account.user.email, password })).status).toBe(401);
  expect((await successful(page, '/auth/login', 'POST', { email: account.user.email, password: 'changed-static-password' })).user.id).toBe(account.user.id);
});

test('a completed password reset stays successful when its security sync is interrupted', async ({ page, request }) => {
  const account = await signup(page);
  const oobCode = await resetCode(request, account);
  await page.route(databasePattern, route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Temporary database outage' }) }));
  const result = await successful(page, '/auth/reset-password/confirm', 'POST', { oobCode, new_password: 'recovered-static-password' });
  expect(result.message).toContain('Your password has been updated');
  expect(result.message).toContain('finish syncing');
  expect((await service(page, '/auth/reset-password/verify', 'POST', { oobCode })).status).toBe(400);
  await page.unroute(databasePattern);
  const signedIn = await successful(page, '/auth/login', 'POST', { email: account.user.email, password: 'recovered-static-password' });
  expect(signedIn.user.id).toBe(account.user.id);
  expect((await request.get(databaseURL(account.user.id, account.token))).status()).toBe(401);
});
