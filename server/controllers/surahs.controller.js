const db = require('../db');

const {audioUrl:resolveAudio}=require('../utils/audio');
const ayahCache = new Map(); // surah id -> ayahs (server restart tak yaad rahega)

function audioUrl(slug, surahId) {
  return resolveAudio({slug},surahId);
}

// ?reciter=slug ya id, na diya to pehla reciter
function pickReciter(param) {
  if (param) {
    const r = isNaN(param)
      ? db.prepare('SELECT * FROM reciters WHERE slug = ?').get(param)
      : db.prepare('SELECT * FROM reciters WHERE id = ?').get(Number(param));
    if (r) return r;
  }
  return db.prepare('SELECT * FROM reciters ORDER BY id LIMIT 1').get();
}

function checkId(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1 || id > 114) {
    res.status(400).json({ error: 'Surah id must be between 1 and 114' });
    return null;
  }
  return id;
}

// GET /api/surahs?type=Makki&juz=30&q=kahf&reciter=1
exports.list = (req, res) => {
  const { type, juz, q } = req.query;
  const where = [];
  const params = [];

  if (type === 'Makki' || type === 'Madani') {
    where.push('revelation_type = ?');
    params.push(type);
  }
  if (juz && !isNaN(juz)) {
    where.push('juz = ?');
    params.push(Number(juz));
  }
  if (q && q.trim()) {
    where.push('(name_en LIKE ? OR name_ar LIKE ? OR meaning LIKE ? OR CAST(id AS TEXT) = ?)');
    const like = `%${q.trim()}%`;
    params.push(like, like, like, q.trim());
  }

  const sql = `SELECT * FROM surahs ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id`;
  const rows = db.prepare(sql).all(...params);
  const reciter = pickReciter(req.query.reciter);

  res.json({
    reciter: { id: reciter.id, name: reciter.name, slug: reciter.slug },
    surahs: rows.map((s) => ({ ...s, audio_url: audioUrl(reciter.slug, s.id) })),
  });
};

// GET /api/surahs/:id
exports.getOne = (req, res) => {
  const id = checkId(req, res);
  if (!id) return;

  const surah = db.prepare('SELECT * FROM surahs WHERE id = ?').get(id);
  if (!surah) return res.status(404).json({ error: 'Surah not found' });

  const reciter = pickReciter(req.query.reciter);
  res.json({
    ...surah,
    reciter: { id: reciter.id, name: reciter.name, slug: reciter.slug },
    audio_url: audioUrl(reciter.slug, id),
  });
};

// GET /api/surahs/:id/ayahs  -> Arabic + English translation
exports.ayahs = async (req, res, next) => {
  const id = checkId(req, res);
  if (!id) return;

  if (ayahCache.has(id)) return res.json({ surah_id: id, ayahs: ayahCache.get(id) });

  try {
    const url = `https://api.alquran.cloud/v1/surah/${id}/editions/quran-uthmani,en.sahih`;
    const cached=db.prepare('SELECT payload FROM ayah_cache WHERE surah_id=?').get(id);
    if(cached) return res.json(JSON.parse(cached.payload));
    const r = await fetch(url,{signal:AbortSignal.timeout(15000)});
    if (!r.ok) throw new Error(`Quran API status ${r.status}`);
    const json = await r.json();

    const [arabic, english] = json.data;
    const ayahs = arabic.ayahs.map((a, i) => ({
      number: a.numberInSurah,
      global_number: a.number,
      arabic: a.text,
      english: english.ayahs[i].text,
    }));

    if(ayahs.length!==db.prepare('SELECT ayah_count FROM surahs WHERE id=?').get(id).ayah_count) throw new Error('Incomplete chapter');
    db.prepare('INSERT OR REPLACE INTO ayah_cache(surah_id,payload) VALUES(?,?)').run(id,JSON.stringify({surah_id:id,ayahs,source:'AlQuran Cloud',translation:'Sahih International'}));
    ayahCache.set(id, ayahs);
    res.json({ surah_id: id, ayahs });
  } catch (err) {
    err.status = 502;
    err.message = 'Could not load ayahs right now, try again';
    next(err);
  }
};
