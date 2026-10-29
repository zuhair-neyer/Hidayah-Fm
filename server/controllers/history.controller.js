const firebase = require('../firebase');
const { parseItem, enrich } = require('../utils/items');
function item(body) { const value = parseItem(body); if (value.error) throw firebase.error(value.error); return value; }
const keyOf = i => [i.item_type, i.item_id, i.reciter_id || 0].join(':');
exports.add = async (req, res) => {
  const value = item(req.body), key = keyOf(value);
  await firebase.transaction(req.user.id, req.idToken, record => {
    record.history ||= {};
    const now = new Date().toISOString(), previous = record.history[key];
    record.history[key] = { ...value, id: key, last_played: now, plays: (previous?.plays || 0) + 1, days: { ...previous?.days, [now.slice(0,10)]: true } };
  });
  res.status(201).json({ ok: true });
};
exports.list = (req, res) => {
  const limit = Math.max(1, Math.min(Math.floor(Number(req.query.limit)) || 20, 200));
  res.json({ history: Object.values(req.record.history || {}).sort((a,b) => b.last_played.localeCompare(a.last_played)).slice(0,limit).map(i => ({ ...enrich(i), last_played: i.last_played })).filter(i => i.type) });
};
exports.clear = async (req, res) => {
  await firebase.transaction(req.user.id, req.idToken, record => { delete record.history; delete record.progress; });
  res.json({ ok: true });
};
exports.progress = async (req, res) => {
  const value = item(req.body), key = keyOf(value), { seconds, duration, completed } = req.body;
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0 || typeof duration !== 'number' || !Number.isFinite(duration) || duration < 0 || duration > 86400 || seconds > duration + 1 || (completed !== undefined && typeof completed !== 'boolean')) throw firebase.error('Invalid playback progress.');
  await firebase.transaction(req.user.id, req.idToken, record => {
    record.progress ||= {};
    record.progress[key] = { ...value, seconds, duration, completed: !!(completed || record.progress[key]?.completed), updated_at: new Date().toISOString() };
  });
  res.json({ ok: true });
};
exports.stats = (req, res) => {
  const progress = Object.values(req.record.progress || {});
  res.json({ plays: Object.values(req.record.history || {}).reduce((sum,i) => sum + (i.plays || 1), 0), completed_surahs: new Set(progress.filter(i => i.item_type === 'surah' && i.completed).map(i => i.item_id)).size,
    progress: progress.sort((a,b) => b.updated_at.localeCompare(a.updated_at)).slice(0,200) });
};
