const firebase = require('../firebase');
const db = require('../db');
const { parseItem, enrich } = require('../utils/items');
const str = v => typeof v === 'string' ? v : '';
const validPass = v => typeof v === 'string' && v.length >= 8 && v.length <= 128;
function credentials(body) {
  const email = str(body.email).trim().toLowerCase(), password = str(body.password);
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password || password.length > 128) throw firebase.error('Enter a valid email address and password.');
  return { email, password, returnSecureToken: true };
}
exports.signup = async (req, res) => {
  const name = str(req.body.name).trim();
  if (name.length < 2 || name.length > 60) throw firebase.error('Name must contain 2–60 characters.');
  if (!validPass(req.body.password)) throw firebase.error('Use 8–128 characters for your password.');
  const input = credentials(req.body);
  await firebase.assertPrivateDatabase();
  let result = await firebase.authRequest('signUp', input);
  const updated = await firebase.authRequest('update', { idToken: result.idToken, displayName: name, returnSecureToken: true });
  result = { ...result, ...updated };
  const identity = await firebase.identity(result.idToken);
  identity.name = name;
  const user = await firebase.ensureUser(identity, result.idToken);
  res.status(201).json(firebase.session(result, user));
};
exports.login = async (req, res) => {
  const input = credentials(req.body);
  await firebase.assertPrivateDatabase();
  const result = await firebase.authRequest('signInWithPassword', input);
  const identity = await firebase.identity(result.idToken);
  const user = await firebase.ensureUser(identity, result.idToken);
  res.json(firebase.session(result, user));
};
exports.refresh = async (req, res) => {
  if (!str(req.body.refreshToken) || req.body.refreshToken.length > 10000) throw firebase.error('Please sign in again.', 401);
  const result = await firebase.refresh(req.body.refreshToken);
  const identity = await firebase.identity(result.idToken);
  const record = (await firebase.read(identity.id, result.idToken)).value;
  if (!record?.profile) throw firebase.error('Please sign in again.', 401);
  res.json(firebase.session(result, record.profile));
};
exports.resetPassword = async (req, res) => {
  const email = str(req.body.email).trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw firebase.error('Enter a valid email address.');
  try { await firebase.authRequest('sendOobCode', { requestType: 'PASSWORD_RESET', email }); }
  catch (error) { if (error.status !== 401) throw error; }
  res.json({ ok: true, message: 'If an account uses this email, a password reset link will arrive shortly. Check your inbox and spam folder.' });
};
function resetCode(body) {
  const code = str(body.oobCode);
  if (!code || code.length > 2048 || /\s/.test(code)) throw firebase.error('Open the complete password reset link from your email.');
  return code;
}
async function verifyResetCode(oobCode) {
  const result = await firebase.authRequest('resetPassword', { oobCode });
  if (result.requestType !== 'PASSWORD_RESET' || !result.email) throw firebase.error('This link is not a password reset link. Please request a new one.');
  return result;
}
exports.verifyPasswordReset = async (req, res) => {
  const result = await verifyResetCode(resetCode(req.body));
  res.json({ email: result.email });
};
exports.confirmPasswordReset = async (req, res) => {
  const oobCode = resetCode(req.body);
  if (!validPass(req.body.new_password)) throw firebase.error('Use 8–128 characters for your new password.');
  await verifyResetCode(oobCode);
  // Firebase compares auth_time and validSince in whole seconds. Move beyond
  // this verified reset's starting second so an existing session cannot tie it.
  const nextSecond = (Math.floor(Date.now() / 1000) + 1) * 1000;
  await new Promise(resolve => setTimeout(resolve, nextSecond - Date.now() + 30));
  await firebase.authRequest('resetPassword', { oobCode, newPassword: req.body.new_password });
  res.json({ ok: true, message: 'Your password has been updated. Sign in with your new password.' });
};
exports.me = (req, res) => res.json({ user: req.user });
exports.update = async (req, res) => {
  const name = str(req.body.name).trim();
  if (name.length < 2 || name.length > 60) throw firebase.error('Name must contain 2–60 characters.');
  await firebase.authRequest('update', { idToken: req.idToken, displayName: name });
  const user = await firebase.transaction(req.user.id, req.idToken, record => { record.profile.name = name; return record.profile; });
  res.json({ user });
};
async function reauthenticate(req, password) {
  try { return await firebase.authRequest('signInWithPassword', { email: req.user.email, password: str(password), returnSecureToken: true }); }
  catch (error) { if (error.status === 401) throw firebase.error('Current password is incorrect.', 403); throw error; }
}
exports.password = async (req, res) => {
  if (!validPass(req.body.new_password)) throw firebase.error('Use 8–128 characters for your new password.');
  if (req.body.new_password === req.body.current_password) throw firebase.error('Choose a different new password.');
  const verified = await reauthenticate(req, req.body.current_password);
  // Keep a newly issued token in a later auth_time second than the previous session.
  const wait = (req.identity.auth_time + 1) * 1000 - Date.now();
  if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait + 30));
  await firebase.authRequest('update', { idToken: verified.idToken, password: req.body.new_password, returnSecureToken: true });
  const result = await firebase.authRequest('signInWithPassword', { email: req.user.email, password: req.body.new_password, returnSecureToken: true });
  const identity = await firebase.identity(result.idToken);
  await firebase.transaction(req.user.id, result.idToken, record => { record.auth_valid_after = identity.auth_time; });
  res.json(firebase.session(result, req.user));
};
exports.remove = async (req, res) => {
  const verified = await reauthenticate(req, req.body.password);
  const snapshot = (await firebase.read(req.user.id, verified.idToken)).value;
  await firebase.remove(req.user.id, verified.idToken);
  try { await firebase.authRequest('delete', { idToken: verified.idToken }); }
  catch (error) {
    // If Auth is still reachable, restore the library rather than leave a half-deleted account.
    try { await firebase.identity(verified.idToken); await firebase.transaction(req.user.id, verified.idToken, record => Object.assign(record, snapshot)); } catch {}
    throw error;
  }
  res.json({ ok: true });
};
exports.settings = (req, res) => res.json({ settings: req.record.settings || {} });
exports.saveSettings = async (req, res) => {
  const { city, country, method, reciter_id, translation } = req.body;
  if (typeof city !== 'string' || city.length > 100 || typeof country !== 'string' || country.length > 100 ||
      Boolean(city.trim()) !== Boolean(country.trim()) || ![1,2,3,4,5,7,8,9,10,11,12,13,14,15,16].includes(method) ||
      !Number.isInteger(reciter_id) || !db.prepare('SELECT id FROM reciters WHERE id=?').get(reciter_id) || typeof translation !== 'boolean') {
    throw firebase.error('Check your location, calculation method, and reciter.');
  }
  const settings = { city: city.trim(), country: country.trim(), method, reciter_id, translation };
  await firebase.transaction(req.user.id, req.idToken, record => { record.settings = settings; });
  res.json({ settings });
};
exports.state = (req, res) => res.json({ bookmark: req.record.bookmark || null, playback: req.record.playback || null });
exports.bookmark = async (req, res) => {
  const { surah, ayah } = req.body;
  const chapter = Number.isInteger(surah) && db.prepare('SELECT * FROM surahs WHERE id=?').get(surah);
  if (!chapter || !Number.isInteger(ayah) || ayah < 1 || ayah > chapter.ayah_count) throw firebase.error('Choose a valid verse.');
  const bookmark = { surah, ayah, name: chapter.name_en };
  await firebase.transaction(req.user.id, req.idToken, record => { record.bookmark = bookmark; });
  res.json({ bookmark });
};
function playbackItem(item) {
  if (!item || typeof item !== 'object') throw firebase.error('Invalid playback item.');
  const parsed = parseItem({ item_type: item.type, item_id: item.id, reciter_id: item.reciter_id });
  if (parsed.error) throw firebase.error(parsed.error);
  const result = enrich(parsed);
  if (!result.audio_url) throw firebase.error('Choose an audio recording.');
  delete result.entry_id;
  return result;
}
exports.playback = async (req, res) => {
  const body = req.body;
  if (typeof body.time !== 'number' || !Number.isFinite(body.time) || body.time < 0 || body.time > 86400 ||
      !Array.isArray(body.queue) || body.queue.length > 500 || !['off','all','one'].includes(body.repeat) || typeof body.shuffle !== 'boolean') throw firebase.error('Invalid playback state.');
  const playback = { item: playbackItem(body.item), queue: body.queue.map(playbackItem), time: body.time, shuffle: body.shuffle, repeat: body.repeat, updated_at: new Date().toISOString() };
  await firebase.transaction(req.user.id, req.idToken, record => { record.playback = playback; });
  res.json({ ok: true });
};
exports.exportData = (req, res) => {
  const data = req.record;
  res.setHeader('Content-Disposition', 'attachment; filename="hidayah-fm-library.json"');
  res.json({ exported_at: new Date().toISOString(), user: data.profile, settings: data.settings || {},
    playlists: Object.values(data.playlists || {}).map(p => ({ ...p, items: Object.values(p.items || {}).sort((a,b) => a.position - b.position) })),
    likes: Object.values(data.likes || {}), history: Object.values(data.history || {}), progress: Object.values(data.progress || {}),
    bookmark: data.bookmark || null, playback: data.playback || null });
};
