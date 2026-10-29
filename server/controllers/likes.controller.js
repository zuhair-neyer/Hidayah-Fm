const firebase = require('../firebase');
const { parseItem, enrich } = require('../utils/items');
exports.list = (req, res) => res.json({ likes: Object.values(req.record.likes || {}).sort((a,b) => b.created_at.localeCompare(a.created_at)).map(enrich).filter(Boolean) });
exports.toggle = async (req, res) => {
  const item = parseItem(req.body);
  if (item.error) throw firebase.error(item.error);
  const key = [item.item_type, item.item_id, item.reciter_id || 0].join(':');
  const liked = await firebase.transaction(req.user.id, req.idToken, record => {
    record.likes ||= {};
    if (record.likes[key]) { delete record.likes[key]; return false; }
    record.likes[key] = { ...item, id: key, created_at: new Date().toISOString() }; return true;
  });
  res.status(liked ? 201 : 200).json({ liked });
};
