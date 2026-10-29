const db = require('../db');

// "naths", "naath", "naat" sab ko naat maano
function normalizeType(t) {
  if (!t) return null;
  t = String(t).toLowerCase();
  if (t.startsWith('nasheed')) return 'nasheed';
  if (t.startsWith('na')) return 'naat';
  return null;
}

// GET /api/tracks?type=nasheed|naat&language=Urdu&mood=...&q=...&limit=20
exports.list = (req, res) => {
  const { language, mood, q } = req.query;
  const type = normalizeType(req.query.type);
  const limit = Math.max(1, Math.min(Math.floor(Number(req.query.limit)) || 200, 200));

  const where = [];
  const params = [];

  if (type) { where.push('type = ?'); params.push(type); }
  if (language) { where.push('language = ?'); params.push(language); }
  if (mood) { where.push('mood = ?'); params.push(mood); }
  if (q && q.trim()) {
    where.push('(title LIKE ? OR artist LIKE ?)');
    const like = `%${q.trim()}%`;
    params.push(like, like);
  }

  const sql = `SELECT * FROM tracks ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
               ORDER BY plays DESC, id LIMIT ?`;
  const rows = db.prepare(sql).all(...params, limit);
  res.json({ tracks: rows });
};

// GET /api/tracks/search?q=...  -> surahs + reciters + tracks ek saath
exports.search = (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json({ surahs: [], reciters: [], tracks: [] });

  const like = `%${q}%`;
  const surahs = db
    .prepare(`SELECT * FROM surahs
              WHERE name_en LIKE ? OR name_ar LIKE ? OR meaning LIKE ? OR CAST(id AS TEXT)=? LIMIT 20`)
    .all(like, like, like, q);
  const reciters = db
    .prepare('SELECT * FROM reciters WHERE name LIKE ? OR name_ar LIKE ? LIMIT 10')
    .all(like, like);
  const tracks = db
    .prepare('SELECT * FROM tracks WHERE title LIKE ? OR artist LIKE ? LIMIT 10')
    .all(like, like);

  res.json({ surahs, reciters, tracks });
};

// GET /api/tracks/:id
exports.getOne = (req, res) => {
  const track = db.prepare('SELECT * FROM tracks WHERE id = ?').get(Number(req.params.id));
  if (!track) return res.status(404).json({ error: 'Track not found' });
  res.json(track);
};
