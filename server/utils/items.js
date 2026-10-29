const db = require('../db');

const {audioUrl,externalLink}=require('./audio');

const getSurah = db.prepare('SELECT * FROM surahs WHERE id = ?');
const getTrack = db.prepare('SELECT * FROM tracks WHERE id = ?');
const getReciter = db.prepare('SELECT * FROM reciters WHERE id = ?');
const firstReciter = db.prepare('SELECT * FROM reciters ORDER BY id LIMIT 1');

// Request se item check karo. Galat ho to { error } milega
function parseItem(src) {
  const item_type = src.item_type;
  const item_id = Number(src.item_id);

  if (!['surah', 'track'].includes(item_type) || !Number.isSafeInteger(item_id) || item_id < 1) {
    return { error: 'item_type must be "surah" or "track" and item_id a number' };
  }

  if (item_type === 'surah') {
    if (!getSurah.get(item_id)) return { error: 'Surah not found' };
    if (src.reciter_id != null && (!Number.isSafeInteger(Number(src.reciter_id)) || Number(src.reciter_id) < 1)) return { error: 'Invalid reciter id' };
    const reciter = src.reciter_id != null ? getReciter.get(Number(src.reciter_id)) : firstReciter.get();
    if (!reciter) return { error: 'Reciter not found' };
    return { item_type, item_id, reciter_id: reciter.id };
  }

  if (!getTrack.get(item_id)) return { error: 'Track not found' };
  return { item_type, item_id, reciter_id: null };
}

// DB row -> UI ke liye poora item (title, audio link, etc.)
function enrich(row) {
  if (row.item_type === 'surah') {
    const s = getSurah.get(row.item_id);
    const r = getReciter.get(row.reciter_id) || firstReciter.get();
    if (!s || !r) return null;
    return {
      entry_id: row.id,
      type: 'surah',
      id: s.id,
      reciter_id: r.id,
      title: `Surah ${s.name_en}`,
      title_ar: s.name_ar,
      subtitle: r.name,
      audio_url: audioUrl(r,s.id),
      link_url: audioUrl(r,s.id)?null:externalLink(r.name+' '+s.name_en),
      cover_url: null,
    };
  }

  const t = getTrack.get(row.item_id);
  if (!t) return null;
  return {
    entry_id: row.id,
    type: 'track',
    id: t.id,
    reciter_id: null,
    title: t.title,
    title_ar: null,
    subtitle: t.artist,
    track_type: t.type,
    audio_url: t.audio_url,
    link_url: t.link_url,
    cover_url: t.cover_url,
  };
}

module.exports = { parseItem, enrich };
