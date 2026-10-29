const { randomUUID } = require('node:crypto');
const firebase = require('../firebase');
const { parseItem, enrich } = require('../utils/items');
function own(record, id) {
  const playlist = Object.hasOwn(record.playlists || {}, id) && record.playlists[id];
  if (!playlist) throw firebase.error('Playlist not found', 404);
  return playlist;
}
function cleanName(value) {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name || name.length > 60) throw firebase.error('Playlist name required (max 60 characters)');
  return name;
}
function cleanColor(value, fallback = '#1db98a') { return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback; }
const sortedItems = p => Object.values(p.items || {}).sort((a,b) => a.position - b.position || a.id.localeCompare(b.id));
const summary = p => ({ id: p.id, name: p.name, color: p.color, created_at: p.created_at, item_count: Object.keys(p.items || {}).length });
exports.list = (req, res) => res.json({ playlists: Object.values(req.record.playlists || {}).sort((a,b) => a.created_at.localeCompare(b.created_at)).map(summary) });
exports.create = async (req, res) => {
  const playlist = { id: randomUUID(), name: cleanName(req.body.name), color: cleanColor(req.body.color), created_at: new Date().toISOString() };
  await firebase.transaction(req.user.id, req.idToken, record => { record.playlists ||= {}; record.playlists[playlist.id] = playlist; });
  res.status(201).json(summary(playlist));
};
exports.getOne = (req, res) => { const p = own(req.record, req.params.id); res.json({ ...summary(p), items: sortedItems(p).map(enrich).filter(Boolean) }); };
exports.update = async (req, res) => {
  const result = await firebase.transaction(req.user.id, req.idToken, record => {
    const p = own(record, req.params.id);
    if (req.body.name !== undefined) p.name = cleanName(req.body.name);
    p.color = cleanColor(req.body.color, p.color);
    return summary(p);
  });
  res.json(result);
};
exports.remove = async (req, res) => {
  await firebase.transaction(req.user.id, req.idToken, record => { own(record, req.params.id); delete record.playlists[req.params.id]; });
  res.json({ ok: true });
};
exports.addItem = async (req, res) => {
  const item = parseItem(req.body);
  if (item.error) throw firebase.error(item.error);
  const id = randomUUID();
  await firebase.transaction(req.user.id, req.idToken, record => {
    const p = own(record, req.params.id), entries = sortedItems(p);
    if (entries.some(e => e.item_type === item.item_type && e.item_id === item.item_id && (e.reciter_id || null) === item.reciter_id)) throw firebase.error('Already in this playlist', 409);
    p.items ||= {};
    p.items[id] = { ...item, id, position: entries.length ? Math.max(...entries.map(e => e.position)) + 1 : 0, added_at: new Date().toISOString() };
  });
  res.status(201).json({ ok: true });
};
exports.removeItem = async (req, res) => {
  await firebase.transaction(req.user.id, req.idToken, record => {
    const p = own(record, req.params.id);
    if (!Object.hasOwn(p.items || {}, req.params.entryId)) throw firebase.error('Item not in playlist', 404);
    delete p.items[req.params.entryId];
  });
  res.json({ ok: true });
};
exports.reorder = async (req, res) => {
  await firebase.transaction(req.user.id, req.idToken, record => {
    const p = own(record, req.params.id), ids = req.body.entry_ids, entries = Object.keys(p.items || {});
    if (!Array.isArray(ids) || ids.length !== entries.length || new Set(ids).size !== ids.length || !ids.every(id => entries.includes(id))) throw firebase.error('Provide every playlist entry exactly once.');
    ids.forEach((id, index) => { p.items[id].position = index; });
  });
  res.json({ ok: true });
};
