// Okulun ortak sınıf sistemi için ödev kataloğu: js/sinif/katalog.js (window.SINIF_KATALOG, window.SINIF_OYUN).
// Öğretmen paneli (sinif.html) atanabilecek içerikleri buradan listeler; öbür derslerin Ödevlerim sayfası da bu dosyayı okur.
// Uygulamanın kendi verisinden üretilir: içerik değişince yeniden çalıştır:  node tools/build-katalog.mjs
// Her öğe: id (≤ 40 harf, okul genelinde tek), ad, kod (kısa etiket), tur 'oyun' (yıldızlı etkinlik), url (site köküne göre),
// alet (flute | violin | piano: ilerlemenin tutulduğu uygulama) ve uyeler (öğenin bitip bitmediğine bakılan ilerleme anahtarları:
// 'L:<ders>' video ders, başka her şey yıldız anahtarı). js/sinif-kayit.js öğrencinin ilerlemesini bu listeye göre öğretmene gönderir.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const load = async (f) => Object.values(await import(`../js/instruments/${f}.js`)).find((x) => x && x.id);
const [F, K, P] = await Promise.all(['flute', 'violin', 'piano'].map(load));
const book = JSON.parse(readFileSync(new URL('../data/gungun/kitap.json', import.meta.url), 'utf8'));

const ROUTE = { lesson: 'ders', drill: 'antrenman', song: 'sarki', reading: 'okuma' };
const KEY = { lesson: (id) => `L:${id}`, drill: (id) => `drill-${id}`, song: (id) => id, reading: (id) => `read-${id}` };
const LIST = { lesson: 'lessons', drill: 'drills', song: 'songs', reading: 'readings' };
const HARF = { lesson: 'v', drill: 'a', song: 's', reading: 'o' }; // kimlikte tür harfi (aynı adlı ders ve antrenman çakışmasın)
const TUR_AD = { lesson: 'video ders', drill: 'antrenman', song: 'şarkı', reading: 'nota okuma' };

/** Bir enstrümanın ders yolu: her basamak ayrı ödev */
function course(I, pre, dir, aletAd) {
  return I.course.map((c, k) => {
    const it = I[LIST[c.type]].find((x) => x.id === c.id);
    return { id: `mz-${pre}${HARF[c.type]}-${c.id}`, ad: `${k + 1}. ${it.title}`, kod: `${aletAd} · ${TUR_AD[c.type]}`, tur: 'oyun', url: `${dir}index.html#/${ROUTE[c.type]}/${c.id}`, alet: I.id, uyeler: [KEY[c.type](c.id)] };
  });
}
/** Egzersiz Yap üniteleri: ünite bir ödev, içindeki her egzersiz bir adım */
function units(I, pre, dir, aletAd) {
  return I.worksheets.map((u) => ({
    id: `mz-${pre}ws-${u.id}`,
    ad: `${u.title}${u.subtitle ? ` · ${u.subtitle}` : ''}`,
    kod: `${aletAd} · Egzersiz Yap`,
    tur: 'oyun',
    url: `${dir}index.html#/egzersiz/${u.exercises[0].id}`,
    alet: I.id,
    uyeler: u.exercises.map((e) => `ws-${e.id}`),
  }));
}
const days = book.days.map((d) => {
  const label = String(d.day).startsWith('tekrar') ? `${d.day.split('-')[1]}. Tekrar günü` : `${d.day}. Gün`;
  return {
    id: `mz-gg-${d.day}`,
    ad: `${label} · ${d.title}`,
    kod: 'Gün Gün Flüt',
    tur: 'oyun',
    url: `index.html#/gungun/${d.day}`,
    alet: 'flute',
    uyeler: d.items.filter((i) => i.rows).map((i) => `ws-gg-${i.id}`),
  };
});

const KATALOG = [
  { tema: 'Gün Gün Flüt (gün gün başlangıç kitabı)', oyunlar: days },
  { tema: 'Yan Flüt · Dersler', oyunlar: course(F, 'f', '', 'Flüt') },
  { tema: 'Yan Flüt · Egzersiz Yap', oyunlar: units(F, 'f', '', 'Flüt') },
  { tema: 'Keman · Dersler', oyunlar: course(K, 'k', 'keman/', 'Keman') },
  { tema: 'Keman · Egzersiz Yap', oyunlar: units(K, 'k', 'keman/', 'Keman') },
  { tema: 'Piyano · Nota Okuma', oyunlar: course(P, 'p', 'piyano/', 'Piyano') },
];

const all = KATALOG.flatMap((t) => t.oyunlar);
const ids = new Set();
for (const o of all) {
  if (o.id.length > 40) throw new Error(`kimlik 40 harften uzun: ${o.id}`);
  if (!/^[a-z0-9-]+$/.test(o.id)) throw new Error(`kimlikte izin verilmeyen harf: ${o.id}`);
  if (ids.has(o.id)) throw new Error(`kimlik tekrar ediyor: ${o.id}`);
  if (!o.uyeler.length) throw new Error(`üyesi yok: ${o.id}`);
  ids.add(o.id);
}
mkdirSync(new URL('../js/sinif/', import.meta.url), { recursive: true });
writeFileSync(
  new URL('../js/sinif/katalog.js', import.meta.url),
  `/* Müzik (Nokta Nokta Flüt, Keman, Piyano) ödev kataloğu: okulun ortak sınıf sistemi (portal deposu ortak/js/sinif.js, dersler.js) okur.
   ÜRETİLMİŞ DOSYA: elle değiştirmeyin; node tools/build-katalog.mjs ile yeniden üretin. */
window.SINIF_KATALOG = ${JSON.stringify(KATALOG, null, 1)};
window.SINIF_OYUN = Object.fromEntries(window.SINIF_KATALOG.flatMap((t) => t.oyunlar).map((o) => [o.id, o]));
`,
);
console.log(`js/sinif/katalog.js: ${KATALOG.length} tema, ${all.length} ödev`);
