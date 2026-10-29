const db = require('./db');

// [id, English, Arabic, meaning, ayahs, type (M=Makki, D=Madani), starting juz]
const S = [
  [1,'Al-Fatihah','الفاتحة','The Opener',7,'M',1],
  [2,'Al-Baqarah','البقرة','The Cow',286,'D',1],
  [3,"Ali 'Imran",'آل عمران','Family of Imran',200,'D',3],
  [4,'An-Nisa','النساء','The Women',176,'D',4],
  [5,"Al-Ma'idah",'المائدة','The Table Spread',120,'D',6],
  [6,"Al-An'am",'الأنعام','The Cattle',165,'M',7],
  [7,"Al-A'raf",'الأعراف','The Heights',206,'M',8],
  [8,'Al-Anfal','الأنفال','The Spoils of War',75,'D',9],
  [9,'At-Tawbah','التوبة','The Repentance',129,'D',10],
  [10,'Yunus','يونس','Jonah',109,'M',11],
  [11,'Hud','هود','Hud',123,'M',11],
  [12,'Yusuf','يوسف','Joseph',111,'M',12],
  [13,"Ar-Ra'd",'الرعد','The Thunder',43,'D',13],
  [14,'Ibrahim','إبراهيم','Abraham',52,'M',13],
  [15,'Al-Hijr','الحجر','The Rocky Tract',99,'M',14],
  [16,'An-Nahl','النحل','The Bee',128,'M',14],
  [17,'Al-Isra','الإسراء','The Night Journey',111,'M',15],
  [18,'Al-Kahf','الكهف','The Cave',110,'M',15],
  [19,'Maryam','مريم','Mary',98,'M',16],
  [20,'Ta-Ha','طه','Ta-Ha',135,'M',16],
  [21,'Al-Anbiya','الأنبياء','The Prophets',112,'M',17],
  [22,'Al-Hajj','الحج','The Pilgrimage',78,'D',17],
  [23,"Al-Mu'minun",'المؤمنون','The Believers',118,'M',18],
  [24,'An-Nur','النور','The Light',64,'D',18],
  [25,'Al-Furqan','الفرقان','The Criterion',77,'M',18],
  [26,"Ash-Shu'ara",'الشعراء','The Poets',227,'M',19],
  [27,'An-Naml','النمل','The Ants',93,'M',19],
  [28,'Al-Qasas','القصص','The Stories',88,'M',20],
  [29,"Al-'Ankabut",'العنكبوت','The Spider',69,'M',20],
  [30,'Ar-Rum','الروم','The Romans',60,'M',21],
  [31,'Luqman','لقمان','Luqman',34,'M',21],
  [32,'As-Sajdah','السجدة','The Prostration',30,'M',21],
  [33,'Al-Ahzab','الأحزاب','The Combined Forces',73,'D',21],
  [34,'Saba','سبأ','Sheba',54,'M',22],
  [35,'Fatir','فاطر','The Originator',45,'M',22],
  [36,'Ya-Sin','يس','Ya-Sin',83,'M',22],
  [37,'As-Saffat','الصافات','Those Ranged in Ranks',182,'M',23],
  [38,'Sad','ص','Sad',88,'M',23],
  [39,'Az-Zumar','الزمر','The Groups',75,'M',23],
  [40,'Ghafir','غافر','The Forgiver',85,'M',24],
  [41,'Fussilat','فصلت','Explained in Detail',54,'M',24],
  [42,'Ash-Shura','الشورى','The Consultation',53,'M',25],
  [43,'Az-Zukhruf','الزخرف','The Ornaments of Gold',89,'M',25],
  [44,'Ad-Dukhan','الدخان','The Smoke',59,'M',25],
  [45,'Al-Jathiyah','الجاثية','The Crouching',37,'M',25],
  [46,'Al-Ahqaf','الأحقاف','The Wind-Curved Sandhills',35,'M',26],
  [47,'Muhammad','محمد','Muhammad',38,'D',26],
  [48,'Al-Fath','الفتح','The Victory',29,'D',26],
  [49,'Al-Hujurat','الحجرات','The Rooms',18,'D',26],
  [50,'Qaf','ق','Qaf',45,'M',26],
  [51,'Adh-Dhariyat','الذاريات','The Winnowing Winds',60,'M',26],
  [52,'At-Tur','الطور','The Mount',49,'M',27],
  [53,'An-Najm','النجم','The Star',62,'M',27],
  [54,'Al-Qamar','القمر','The Moon',55,'M',27],
  [55,'Ar-Rahman','الرحمن','The Beneficent',78,'D',27],
  [56,"Al-Waqi'ah",'الواقعة','The Inevitable',96,'M',27],
  [57,'Al-Hadid','الحديد','The Iron',29,'D',27],
  [58,'Al-Mujadila','المجادلة','The Pleading Woman',22,'D',28],
  [59,'Al-Hashr','الحشر','The Exile',24,'D',28],
  [60,'Al-Mumtahanah','الممتحنة','She That Is To Be Examined',13,'D',28],
  [61,'As-Saff','الصف','The Ranks',14,'D',28],
  [62,"Al-Jumu'ah",'الجمعة','Friday',11,'D',28],
  [63,'Al-Munafiqun','المنافقون','The Hypocrites',11,'D',28],
  [64,'At-Taghabun','التغابن','Mutual Disillusion',18,'D',28],
  [65,'At-Talaq','الطلاق','Divorce',12,'D',28],
  [66,'At-Tahrim','التحريم','The Prohibition',12,'D',28],
  [67,'Al-Mulk','الملك','The Sovereignty',30,'M',29],
  [68,'Al-Qalam','القلم','The Pen',52,'M',29],
  [69,'Al-Haqqah','الحاقة','The Reality',52,'M',29],
  [70,"Al-Ma'arij",'المعارج','The Ascending Stairways',44,'M',29],
  [71,'Nuh','نوح','Noah',28,'M',29],
  [72,'Al-Jinn','الجن','The Jinn',28,'M',29],
  [73,'Al-Muzzammil','المزمل','The Enshrouded One',20,'M',29],
  [74,'Al-Muddaththir','المدثر','The Cloaked One',56,'M',29],
  [75,'Al-Qiyamah','القيامة','The Resurrection',40,'M',29],
  [76,'Al-Insan','الإنسان','The Human',31,'D',29],
  [77,'Al-Mursalat','المرسلات','Those Sent Forth',50,'M',29],
  [78,'An-Naba','النبأ','The Tidings',40,'M',30],
  [79,"An-Nazi'at",'النازعات','Those Who Drag Forth',46,'M',30],
  [80,"'Abasa",'عبس','He Frowned',42,'M',30],
  [81,'At-Takwir','التكوير','The Overthrowing',29,'M',30],
  [82,'Al-Infitar','الانفطار','The Cleaving',19,'M',30],
  [83,'Al-Mutaffifin','المطففين','The Defrauding',36,'M',30],
  [84,'Al-Inshiqaq','الانشقاق','The Sundering',25,'M',30],
  [85,'Al-Buruj','البروج','The Mansions of the Stars',22,'M',30],
  [86,'At-Tariq','الطارق','The Nightcomer',17,'M',30],
  [87,"Al-A'la",'الأعلى','The Most High',19,'M',30],
  [88,'Al-Ghashiyah','الغاشية','The Overwhelming',26,'M',30],
  [89,'Al-Fajr','الفجر','The Dawn',30,'M',30],
  [90,'Al-Balad','البلد','The City',20,'M',30],
  [91,'Ash-Shams','الشمس','The Sun',15,'M',30],
  [92,'Al-Layl','الليل','The Night',21,'M',30],
  [93,'Ad-Duha','الضحى','The Morning Hours',11,'M',30],
  [94,'Ash-Sharh','الشرح','The Relief',8,'M',30],
  [95,'At-Tin','التين','The Fig',8,'M',30],
  [96,"Al-'Alaq",'العلق','The Clot',19,'M',30],
  [97,'Al-Qadr','القدر','The Power',5,'M',30],
  [98,'Al-Bayyinah','البينة','The Clear Proof',8,'D',30],
  [99,'Az-Zalzalah','الزلزلة','The Earthquake',8,'D',30],
  [100,"Al-'Adiyat",'العاديات','The Courser',11,'M',30],
  [101,"Al-Qari'ah",'القارعة','The Calamity',11,'M',30],
  [102,'At-Takathur','التكاثر','Competition in Worldly Increase',8,'M',30],
  [103,"Al-'Asr",'العصر','The Declining Day',3,'M',30],
  [104,'Al-Humazah','الهمزة','The Traducer',9,'M',30],
  [105,'Al-Fil','الفيل','The Elephant',5,'M',30],
  [106,'Quraysh','قريش','Quraysh',4,'M',30],
  [107,"Al-Ma'un",'الماعون','Small Kindnesses',7,'M',30],
  [108,'Al-Kawthar','الكوثر','Abundance',3,'M',30],
  [109,'Al-Kafirun','الكافرون','The Disbelievers',6,'M',30],
  [110,'An-Nasr','النصر','Divine Support',3,'D',30],
  [111,'Al-Masad','المسد','The Palm Fiber',5,'M',30],
  [112,'Al-Ikhlas','الإخلاص','Sincerity',4,'M',30],
  [113,'Al-Falaq','الفلق','The Daybreak',5,'M',30],
  [114,'An-Nas','الناس','Mankind',6,'M',30],
];

// [name, Arabic name, slug (quranicaudio folder), country, style]
const R = [
  ['Mishary Rashid Alafasy','مشاري العفاسي','mishaari_raashid_al_3afaasee','Kuwait','Murattal'],
  ['Abdul Rahman Al-Sudais','عبد الرحمن السديس','abdurrahmaan_as-sudays','Makkah','Imam of Masjid Al-Haram'],
  ['Maher Al-Muaiqly','ماهر المعيقلي','maher_almuaiqly','Makkah','Imam of Masjid Al-Haram'],
  ['Saad Al-Ghamdi','سعد الغامدي','sa3d_al-ghaamidi','Saudi Arabia','Soothing Tilawah'],
  ['Yasser Al-Dosari','ياسر الدوسري','yasser_ad-dussary','Makkah','Powerful Tone'],
  ['Abu Bakr Al-Shatri','أبو بكر الشاطري','abu_bakr_ash-shatri','Jeddah','Melodious'],
  ['Omar Hisham Al Arabi','عمر هشام العربي','omar_hisham_al_arabi','Egypt','Acoustic & Modern'],
];

// Original entries stay first so fresh installs retain the original IDs.
// Each recording includes its source and verification metadata.
const catalogue = require('./catalogue.json');
const searchUrl = track => 'https://www.youtube.com/results?search_query=' + encodeURIComponent(track.artist + ' ' + track.title);

const seed = db.transaction(() => {
  const addSurah = db.prepare(`
    INSERT INTO surahs (id, name_en, name_ar, meaning, ayah_count, revelation_type, juz)
    VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name_en=excluded.name_en,name_ar=excluded.name_ar,meaning=excluded.meaning,ayah_count=excluded.ayah_count,revelation_type=excluded.revelation_type,juz=excluded.juz`);
  for (const s of S) {
    addSurah.run(s[0], s[1], s[2], s[3], s[4], s[5] === 'M' ? 'Makki' : 'Madani', s[6]);
  }

  const addReciter = db.prepare(`
    INSERT INTO reciters (name, name_ar, slug, country, style)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(slug) DO UPDATE SET
      name = excluded.name, name_ar = excluded.name_ar,
      country = excluded.country, style = excluded.style`);
  for (const r of R) addReciter.run(...r);

  const findTrack = db.prepare('SELECT * FROM tracks WHERE title = ? COLLATE NOCASE AND artist = ? COLLATE NOCASE AND type = ? ORDER BY id LIMIT 1');
  const addTrack = db.prepare('INSERT INTO tracks (title, artist, type, language, mood, link_url) VALUES (?, ?, ?, ?, ?, ?)');
  const updateSource = db.prepare('UPDATE tracks SET link_url = ? WHERE id = ?');
  for (const track of catalogue) {
    const existing = findTrack.get(track.title, track.artist, track.type);
    const source = track.videoId ? 'https://www.youtube.com/watch?v=' + track.videoId : searchUrl(track);
    if (!existing) {
      addTrack.run(track.title, track.artist, track.type, track.language, track.mood, source);
    } else if (!existing.link_url || (track.videoId && existing.link_url === searchUrl(existing))) {
      // Upgrade only empty links or the old generated search fallback.
      // IDs, imported audio, custom links, artwork, statistics and metadata remain intact.
      updateSource.run(source, existing.id);
    }
  }
});

seed();

const counts = {
  surahs: db.prepare('SELECT COUNT(*) AS c FROM surahs').get().c,
  reciters: db.prepare('SELECT COUNT(*) AS c FROM reciters').get().c,
  tracks: db.prepare('SELECT COUNT(*) AS c FROM tracks').get().c,
};
if(require.main===module){console.log('Catalogue ready:',counts);db.close();}
