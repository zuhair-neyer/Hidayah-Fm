if (!process.env.FIREBASE_AUTH_EMULATOR_HOST || !process.env.FIREBASE_DATABASE_EMULATOR_HOST) throw new Error('Password reset tests require both Firebase emulators. Run npm test.');
process.env.FIREBASE_PROJECT_ID = 'demo-hidayah-fm';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const work = path.resolve(__dirname, '../work');
fs.mkdirSync(work, { recursive: true });
const dir = fs.mkdtempSync(path.join(work, 'password-reset-api-'));
process.env.DATA_DIR = dir;
const app = require('../server/index');
const db = require('../server/db');
const firebase = require('../server/firebase');
const email = `reset-api-${Date.now()}@example.test`;
const originalPassword = 'original-reset-password';
const newPassword = 'changed-reset-password';
let server, base, account;

async function request(endpoint, body, method = 'POST') {
  const response = await fetch(base + '/api' + endpoint, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json(), headers: response.headers };
}
async function actionCode(type = 'PASSWORD_RESET') {
  await firebase.authRequest('sendOobCode', type === 'PASSWORD_RESET' ? { requestType: type, email } : { requestType: type, idToken: account.idToken });
  const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/demo-hidayah-fm/oobCodes`);
  assert.equal(response.status, 200);
  const codes = (await response.json()).oobCodes;
  const code = codes.filter(item => item.email === email && item.requestType === type).at(-1);
  assert.ok(code, `Emulator should contain a ${type} action`);
  return code.oobCode;
}

before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
  // Only isolated demo emulator accounts are created; no real emails are sent.
  account = await firebase.authRequest('signUp', { email, password: originalPassword, returnSecureToken: true });
});
after(async () => {
  await new Promise(resolve => server.close(resolve));
  db.close();
  if (path.dirname(dir) === work && path.basename(dir).startsWith('password-reset-api-')) fs.rmSync(dir, { recursive: true, force: true });
});

test('the custom page is public while catalogue and library APIs remain protected', async () => {
  const page = await fetch(base + '/reset-password.html?mode=resetPassword&oobCode=example');
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Hidayah FM/);
  for (const endpoint of ['/surahs', '/tracks', '/playlists', '/auth/me']) assert.equal((await request(endpoint, undefined, 'GET')).status, 401, endpoint);
  assert.equal((await request('/auth/reset-password/verify', { oobCode: 'invalid-code' })).status, 400);
  assert.equal((await request('/auth/reset-password/confirm', { oobCode: 'invalid-code', new_password: newPassword })).status, 400);
});

test('reset endpoints reject malformed codes and password bounds', async () => {
  for (const oobCode of ['', null, {}, 'x'.repeat(2049)]) {
    assert.equal((await request('/auth/reset-password/verify', { oobCode })).status, 400);
    assert.equal((await request('/auth/reset-password/confirm', { oobCode, new_password: newPassword })).status, 400);
  }
  for (const password of ['short', 'x'.repeat(129), {}]) {
    assert.equal((await request('/auth/reset-password/confirm', { oobCode: 'valid-shaped-code', new_password: password })).status, 400);
  }
});

test('a verification-email code cannot be used for a password reset', async () => {
  const oobCode = await actionCode('VERIFY_EMAIL');
  assert.equal((await request('/auth/reset-password/verify', { oobCode })).status, 400);
  assert.equal((await request('/auth/reset-password/confirm', { oobCode, new_password: newPassword })).status, 400);
  const verified = await firebase.authRequest('update', { oobCode });
  assert.equal(verified.emailVerified, true, 'A rejected wrong-action attempt must not consume the verification code');
});

test('a genuine reset code verifies, changes the password, and can only be consumed once', async () => {
  const oobCode = await actionCode();
  const checked = await request('/auth/reset-password/verify', { oobCode });
  assert.equal(checked.status, 200);
  assert.equal(checked.body.email, email);
  assert.match(checked.headers.get('cache-control'), /no-store/);
  const confirmed = await request('/auth/reset-password/confirm', { oobCode, new_password: newPassword });
  assert.equal(confirmed.status, 200);
  assert.equal(typeof confirmed.body.message, 'string');
  assert.equal(confirmed.body.token, undefined);
  assert.equal((await request('/auth/login', { email, password: originalPassword })).status, 401);
  assert.equal((await request('/auth/login', { email, password: newPassword })).status, 200);
  const oldSession = await fetch(base + '/api/auth/me', { headers: { Authorization: 'Bearer ' + account.idToken } });
  assert.equal(oldSession.status, 401, 'Password reset must revoke the earlier signed-in session');
  // The Auth emulator does not invalidate refresh tokens on reset: its
  // validateRefreshToken checks project/user existence, without validSince.
  // Production Firebase owns that revocation; its error is tested below.
  for (const endpoint of ['verify', 'confirm']) {
    const reused = await request('/auth/reset-password/' + endpoint, { oobCode, new_password: newPassword });
    assert.equal(reused.status, 400);
    assert.match(reused.body.error, /invalid|expired|used/i);
  }
});

test('expired action codes and revoked refresh tokens produce actionable client errors', async () => {
  const originalFetch = global.fetch;
  try {
    for (const code of ['EXPIRED_OOB_CODE', 'INVALID_OOB_CODE']) {
      global.fetch = async () => ({ ok: false, json: async () => ({ error: { message: code } }) });
      await assert.rejects(firebase.authRequest('resetPassword', { oobCode: 'provider-error-fixture' }), error => error.status === 400 && /invalid|expired|used/i.test(error.message));
    }
    global.fetch = async () => ({ ok: false, json: async () => ({ error: { message: 'TOKEN_EXPIRED' } }) });
    await assert.rejects(firebase.refresh('revoked-provider-token-fixture'), error => error.status === 401 && /sign in again/i.test(error.message));
  } finally { global.fetch = originalFetch; }
});

test('reset-code attempts are rate limited', async () => {
  let limited;
  for (let attempt = 0; attempt < 41; attempt++) {
    const response = await request('/auth/reset-password/verify', { oobCode: '' });
    if (response.status === 429) { limited = response; break; }
    assert.equal(response.status, 400);
  }
  assert.ok(limited, 'Public reset verification must share the authentication rate limiter');
  assert.ok(Number(limited.headers.get('retry-after')) > 0);
});
