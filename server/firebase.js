require('./config');
const config = require('./firebase-config');
const { randomUUID } = require('node:crypto');
const emulatorAuth = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const emulatorDatabase = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
const authBase = emulatorAuth ? `http://${emulatorAuth}/identitytoolkit.googleapis.com/v1` : 'https://identitytoolkit.googleapis.com/v1';
const refreshBase = emulatorAuth ? `http://${emulatorAuth}/securetoken.googleapis.com/v1` : 'https://securetoken.googleapis.com/v1';
const databaseBase = emulatorDatabase ? `http://${emulatorDatabase}` : config.databaseURL;

function error(message, status = 400) { return Object.assign(new Error(message), { status }); }
async function fetchSafe(url, options = {}) {
  try { return await fetch(url, { ...options, signal: AbortSignal.timeout(15000) }); }
  catch { throw error('Firebase could not be reached. Check your connection and try again.', 503); }
}
function authError(message = '') {
  const code = message.split(' : ')[0];
  const known = {
    EMAIL_EXISTS: ['This email is already registered. Please sign in.', 409],
    INVALID_LOGIN_CREDENTIALS: ['Email or password is incorrect.', 401],
    EMAIL_NOT_FOUND: ['Email or password is incorrect.', 401],
    INVALID_PASSWORD: ['Email or password is incorrect.', 401],
    USER_DISABLED: ['This account has been disabled.', 401],
    INVALID_EMAIL: ['Enter a valid email address.', 400],
    WEAK_PASSWORD: ['Use a stronger password with at least 8 characters.', 400],
    PASSWORD_DOES_NOT_MEET_REQUIREMENTS: ['Your password does not meet the account password requirements. Try a longer password with uppercase and lowercase letters, a number and a symbol.', 400],
    EXPIRED_OOB_CODE: ['This reset link has expired. Please request a new one.', 400],
    INVALID_OOB_CODE: ['This reset link is invalid or has already been used. Please request a new one.', 400],
    MISSING_OOB_CODE: ['Open the complete password reset link from your email.', 400],
    TOO_MANY_ATTEMPTS_TRY_LATER: ['Too many attempts. Please try again later.', 429],
    TOKEN_EXPIRED: ['Your session expired. Please sign in again.', 401],
    INVALID_ID_TOKEN: ['Your session expired. Please sign in again.', 401],
    INVALID_REFRESH_TOKEN: ['Your session expired. Please sign in again.', 401],
    USER_NOT_FOUND: ['Your session expired. Please sign in again.', 401],
    CREDENTIAL_TOO_OLD_LOGIN_AGAIN: ['Please sign in again before changing your account.', 401],
    CONFIGURATION_NOT_FOUND: ['Enable Email/Password sign-in in Firebase Authentication for hidayah-fm.', 503],
    OPERATION_NOT_ALLOWED: ['Enable Email/Password sign-in in Firebase Authentication for hidayah-fm.', 503]
  };
  const entry = known[code] || ['Firebase could not complete this request. Please try again.', 502];
  return error(...entry);
}
async function authRequest(action, body) {
  const response = await fetchSafe(`${authBase}/accounts:${action}?key=${config.apiKey}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok) throw authError(data.error?.message);
  return data;
}
function claims(token) {
  try { return JSON.parse(Buffer.from(token.split('.')[1], 'base64url')); }
  catch { throw error('Please sign in again.', 401); }
}
async function identity(token) {
  const result = await authRequest('lookup', { idToken: token });
  const user = result.users?.[0];
  if (!user || user.disabled) throw error('Please sign in again.', 401);
  // The lookup endpoint verifies the token. Never authorize from decoded claims alone.
  const payload = claims(token);
  if (payload.sub !== user.localId || Number(payload.auth_time) < Number(user.validSince || 0)) {
    throw error('Your session expired. Please sign in again.', 401);
  }
  return {
    id: user.localId, name: user.displayName || '', email: user.email,
    created_at: new Date(Number(user.createdAt) || Date.now()).toISOString(), auth_time: Number(payload.auth_time)
  };
}
async function refresh(refreshToken) {
  const response = await fetchSafe(`${refreshBase}/token?key=${config.apiKey}`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken })
  });
  const data = await response.json();
  if (!response.ok) throw authError(data.error?.message);
  return { idToken: data.id_token, refreshToken: data.refresh_token, expiresIn: data.expires_in };
}
function databaseURL(uid, token) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) throw error('Invalid account.', 401);
  const url = new URL(`${databaseBase}/users/${encodeURIComponent(uid)}.json`);
  if (emulatorDatabase) url.searchParams.set('ns', `${config.projectId}-default-rtdb`);
  url.searchParams.set('auth', token);
  return url;
}
async function read(uid, token, etag = false) {
  const response = await fetchSafe(databaseURL(uid, token), { headers: etag ? { 'X-Firebase-ETag': 'true' } : {} });
  if (!response.ok) throw error('Your Firebase data could not be opened. Sign in again or check the database rules.', response.status === 401 ? 401 : 503);
  return { value: await response.json(), etag: response.headers.get('etag') };
}
async function transaction(uid, token, change) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const snapshot = await read(uid, token, true);
    const record = snapshot.value || {};
    const result = change(record);
    const response = await fetchSafe(databaseURL(uid, token), {
      method: 'PUT', headers: { 'Content-Type': 'application/json', 'If-Match': snapshot.etag }, body: JSON.stringify(record)
    });
    if (response.status === 412) continue;
    if (!response.ok) throw error('Your changes could not be saved to Firebase. Check the database rules and try again.', 503);
    return result;
  }
  throw error('Your library changed in another session. Please try again.', 409);
}
async function remove(uid, token) {
  const response = await fetchSafe(databaseURL(uid, token), { method: 'DELETE' });
  if (!response.ok) throw error('Your Firebase data could not be deleted. Please try again.', 503);
}
let privateUntil = 0;
async function assertPrivateDatabase() {
  if (Date.now() < privateUntil) return;
  const url = new URL(`${databaseBase}/users.json?shallow=true`);
  if (emulatorDatabase) url.searchParams.set('ns', `${config.projectId}-default-rtdb`);
  const response = await fetchSafe(url);
  if (response.ok) throw error('Publish the supplied private-user Firebase database rules before signing in.', 503);
  if (![401, 403].includes(response.status)) throw error('The Firebase database could not be checked.', 503);
  privateUntil = Date.now() + 60000;
}
async function ensureUser(user, token) {
  return transaction(user.id, token, record => {
    if (!record.profile) {
      record.profile = { id: user.id, name: user.name || 'Listener', email: user.email, created_at: user.created_at };
      const id = randomUUID();
      record.playlists = { [id]: { id, name: 'Heart Soothing', color: '#1db98a', created_at: new Date().toISOString() } };
    }
    return record.profile;
  });
}
function session(data, user) {
  return { token: data.idToken, refreshToken: data.refreshToken, expiresAt: Date.now() + Number(data.expiresIn || 3600) * 1000, user };
}
module.exports = { authRequest, identity, refresh, claims, read, transaction, remove, ensureUser, assertPrivateDatabase, session, error };
