const db = require('../db');
const { enrich } = require('../utils/items');

const {audioUrl,describeReciter}=require('../utils/audio');

function surahCard(id, reciter) {
  const s = db.prepare('SELECT * FROM surahs WHERE id = ?').get(id);
  return {
    ...s,
    reciter: { id: reciter.id, name: reciter.name },
    audio_url: audioUrl(reciter,s.id),
  };
}

// GET /api/home
exports.get = (req, res) => {
  const reciter = db.prepare('SELECT * FROM reciters ORDER BY id LIMIT 1').get();
  const now = new Date();
  let timezone = req.query.timezone || 'UTC';
  try { new Intl.DateTimeFormat('en', { timeZone: timezone }).format(now); } catch { timezone = 'UTC'; }
  const isFriday = new Intl.DateTimeFormat('en', { timeZone: timezone, weekday: 'short' }).format(now) === 'Fri';

  // Jumu'ah ko Al-Kahf, baaki din roz alag surah
  const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const dayNumber = Math.floor(new Date(localDate + 'T00:00:00Z').getTime() / 86400000);
  const sotdId = isFriday ? 18 : (dayNumber % 114) + 1;

  const quickAccess = [
    { kind: 'surah', label: 'Surah Al-Kahf', sublabel: 'Friday Blessing', surah: surahCard(18, reciter) },
    { kind: 'surah', label: 'Surah Yaseen', sublabel: 'Surah 36 · 83 verses', surah: surahCard(36, reciter) },
    { kind: 'surah', label: 'Surah Ar-Rahman', sublabel: 'The Beneficent', surah: surahCard(55, reciter) },
    { kind: 'collection', label: 'Reflective Listening', sublabel: 'Browse Nasheeds', query: '/api/tracks?type=nasheed' },
    { kind: 'collection', label: 'Peaceful Nasheeds', sublabel: 'Vocal Harmony & Daff', query: '/api/tracks?type=nasheed' },
    { kind: 'collection', label: 'Friday Special', sublabel: 'Spiritual Reflections', query: '/api/tracks?type=naat' },
  ];

  const tracks = (type) =>
    db.prepare('SELECT * FROM tracks WHERE type = ? ORDER BY plays DESC, id LIMIT 12').all(type);

  const recentlyPlayed = Object.values(req.record.history || {}).sort((a,b)=>b.last_played.localeCompare(a.last_played)).slice(0,10).map(row=>({...enrich(row),last_played:row.last_played}));
  const days = new Set(Object.values(req.record.history || {}).flatMap(row => Object.keys(row.days || { [row.last_played.slice(0,10)]: true })));
  const cursor = new Date(); if (!days.has(cursor.toISOString().slice(0,10))) cursor.setUTCDate(cursor.getUTCDate()-1);
  let streak = 0; while (days.has(cursor.toISOString().slice(0,10))) { streak++; cursor.setUTCDate(cursor.getUTCDate()-1); }

  res.json({
    user: { id: req.user.id, name: req.user.name },
    is_friday: isFriday,
    streak,
    surah_of_the_day: surahCard(sotdId, reciter),
    quick_access: quickAccess,
    reciters: db.prepare('SELECT * FROM reciters ORDER BY id').all().map(describeReciter),
    trending_nasheeds: tracks('nasheed'),
    beautiful_naths: tracks('naat'),
    recently_played: recentlyPlayed,
  });
};
