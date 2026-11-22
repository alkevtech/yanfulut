// "Her Gün Bir Parça Öğrenelim" verisini denetler (veri depoda değil: private/hergun/ders-XX.json).
// node tools/check-hergun.mjs private/hergun/ders-01.json [...]
// Denetim: nota yazımı (parseRow), her ölçünün süresi ölçü sayısına eşit (anakruzlu parçada ilk ve son ölçü
// birlikte bir ölçü eder), bağlar aynı notaya, notalar flüt aralığında ve parmak tablosunda, donanım adı geçerli.
import { readFileSync } from 'node:fs';
import { parseRow, KEY_SIGNATURES } from '../js/data/worksheet.js';
import { ALL_NOTES, canonicalNote } from '../js/data/notes.js';

const known = new Set(ALL_NOTES);
let problems = 0;
const missingNotes = new Set();
for (const file of process.argv.slice(2)) {
  let lesson;
  try {
    lesson = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    console.log(`${file}: JSON okunamadı: ${e.message}`);
    problems++;
    continue;
  }
  const say = (msg) => {
    console.log(`${file} › ${msg}`);
    problems++;
  };
  for (const k of ['day', 'title', 'bookPage', 'items']) if (lesson[k] == null) say(`eksik alan: ${k}`);
  for (const it of lesson.items || []) {
    const where = `${it.id || '?'} (${it.title || ''})`;
    if (!it.id || !it.title || !it.kind) say(`${where}: id, title ve kind zorunlu`);
    if (!it.rows) continue;
    if (!it.time) say(`${where}: time yok`);
    if (!it.bpm) say(`${where}: bpm yok`);
    if (it.key && !(it.key in KEY_SIGNATURES)) say(`${where}: bilinmeyen donanım ${it.key}`);
    let rows;
    try {
      rows = it.rows.map(parseRow);
    } catch (e) {
      say(`${where}: ${e.message}`);
      continue;
    }
    const items = rows.flat();
    items.forEach((x, k) => {
      if (!x.rest && !known.has(canonicalNote(x.note))) missingNotes.add(x.note);
      if (x.tie && items[k + 1]?.note !== x.note) say(`${where}: ${k + 1}. öğedeki bağ aynı notaya gitmiyor (${x.note} → ${items[k + 1]?.note})`);
    });
    // Ölçüler: satır sonu da ölçü çizgisi sayılır
    const bars = [];
    let acc = 0;
    for (const r of rows) {
      r.forEach((x, k) => {
        acc += x.beats;
        if (x.bar || k === r.length - 1) {
          bars.push(+acc.toFixed(3));
          acc = 0;
        }
      });
    }
    const t = it.time;
    bars.forEach((b, k) => {
      const first = k === 0;
      const last = k === bars.length - 1;
      if (it.pickup && (first || last)) return;
      if (Math.abs(b - t) > 1e-6) say(`${where}: ${k + 1}. ölçü ${b} vuruş, olması gereken ${t}`);
    });
    if (it.pickup) {
      if (Math.abs(bars[0] - it.pickup) > 1e-6) say(`${where}: anakruz ${it.pickup} ama ilk ölçü ${bars[0]}`);
      const lastBar = bars[bars.length - 1];
      if (Math.abs(lastBar - t) > 1e-6 && Math.abs(lastBar - (t - it.pickup)) > 1e-6) say(`${where}: son ölçü ${lastBar} (tam ölçü ${t} ya da ${t - it.pickup} olmalı)`);
    }
  }
  console.log(`${file}: ${(lesson.items || []).length} öğe, ${(lesson.items || []).filter((i) => i.rows).length} çalınabilir`);
}
if (missingNotes.size) console.log(`Parmak tablosunda olmayan notalar: ${[...missingNotes].join(', ')}`);
console.log(problems ? `${problems} sorun` : 'Sorun yok');
process.exit(problems ? 1 : 0);
