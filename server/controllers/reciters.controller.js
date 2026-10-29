const db = require('../db');
const {describeReciter}=require('../utils/audio');

// GET /api/reciters
exports.list = (req, res) => {
  const rows = db.prepare('SELECT * FROM reciters ORDER BY id').all();
  res.json({ reciters: rows.map(describeReciter) });
};

// GET /api/reciters/:id  (id ya slug)
exports.getOne = (req, res) => {
  const p = req.params.id;
  const reciter = isNaN(p)
    ? db.prepare('SELECT * FROM reciters WHERE slug = ?').get(p)
    : db.prepare('SELECT * FROM reciters WHERE id = ?').get(Number(p));

  if (!reciter) return res.status(404).json({ error: 'Reciter not found' });
  res.json(describeReciter(reciter));
};
