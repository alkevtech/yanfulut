// "Gün Gün Flüt" kitabını denetler: data/gungun/<gün>.json (plan: data/gungun/plan.json).
// node tools/check-gungun.mjs            → bütün yazılmış günler
// node tools/check-gungun.mjs gun-03 ... → yalnızca bu günler
// Denetim: alanlar, nota yazımı (parseRow), her ölçünün süresi (anakruzda ilk + son ölçü bir ölçü eder),
// bağlar aynı notaya, donanım adı, notalar parmak tablosunda ve o güne kadar öğretilmiş, parçada kaynak (credit),
// test sorusunda cevap.
import { readFileSync, existsSync } from 'node:fs';
import { parseRow, KEY_SIGNATURES } from '../js/data/worksheet.js';
import { ALL_NOTES, canonicalNote } from '../js/data/notes.js';

const dir = new URL('../data/gungun/', import.meta.url);
const plan = JSON.parse(readFileSync(new URL('plan.json', dir), 'utf8'));
const inTable = new Set(ALL_NOTES);
const want = process.argv.slice(2).map((a) => a.replace(/^.*\//, '').replace(/\.json$/, ''));
let problems = 0;
let checked = 0;
const taught = new Set();
const ids = new Set();

for (const p of plan) {
  p.newNotes.forEach((n) => taught.add(canonicalNote(n)));
  const file = new URL(`${p.file}.json`, dir);
  if (want.length && !want.includes(p.file)) continue;
  if (!existsSync(file)) {
    if (want.length) {
      console.log(`${p.file}: dosya yok`);
      problems++;
    }
    continue;
  }
  checked++;
  const say = (msg) => {
    console.log(`${p.file} › ${msg}`);
    problems++;
  };
  let d;
  try {
    d = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    say(`JSON okunamadı: ${e.message}`);
    continue;
  }
  if (String(d.day) !== String(p.day)) say(`day ${d.day}, planda ${p.day}`);
  if (JSON.stringify(d.newNotes || []) !== JSON.stringify(p.newNotes)) say(`newNotes planla aynı olmalı: ${JSON.stringify(p.newNotes)}`);
  for (const k of ['title', 'goals', 'sections', 'items']) if (d[k] == null) say(`eksik alan: ${k}`);
  for (const s of d.sections || []) if (!s.title || !s.text) say('bölümde title ve text zorunlu');
  for (const it of d.items || []) {
    const where = `${it.id || '?'} (${it.title || ''})`;
    if (!it.id || !it.title || !it.kind) say(`${where}: id, title ve kind zorunlu`);
    if (ids.has(it.id)) say(`${where}: id tekrar ediyor`);
    ids.add(it.id);
    if (!['calisma', 'parca', 'info', 'test'].includes(it.kind)) say(`${where}: bilinmeyen kind ${it.kind}`);
    if (it.kind === 'test' && !it.answer) say(`${where}: test sorusunun cevabı (answer) yok`);
    if (it.kind === 'parca' && !it.credit) say(`${where}: parçanın kaynağı (credit) yok`);
    if (!it.rows) {
      if (it.kind === 'calisma' || it.kind === 'parca') say(`${where}: notası (rows) yok`);
      continue;
    }
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
    const notTaught = new Set();
    items.forEach((x, k) => {
      if (x.rest) return;
      if (!inTable.has(canonicalNote(x.note))) say(`${where}: ${x.note} parmak tablosunda yok`);
      else if (!taught.has(canonicalNote(x.note))) notTaught.add(x.note);
      if (x.tie && items[k + 1]?.note !== x.note) say(`${where}: ${k + 1}. öğedeki bağ aynı notaya gitmiyor (${x.note} → ${items[k + 1]?.note})`);
    });
    if (notTaught.size) say(`${where}: henüz öğretilmemiş nota: ${[...notTaught].join(', ')}`);
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
      if (it.pickup && (k === 0 || k === bars.length - 1)) return;
      if (Math.abs(b - t) > 1e-6) say(`${where}: ${k + 1}. ölçü ${b} vuruş, olması gereken ${t}`);
    });
    if (it.pickup) {
      if (Math.abs(bars[0] - it.pickup) > 1e-6) say(`${where}: anakruz ${it.pickup} ama ilk ölçü ${bars[0]}`);
      const last = bars[bars.length - 1];
      if (Math.abs(last - t) > 1e-6 && Math.abs(last - (t - it.pickup)) > 1e-6) say(`${where}: son ölçü ${last} (tam ölçü ${t} ya da ${t - it.pickup} olmalı)`);
    }
  }
  console.log(`${p.file}: ${(d.items || []).length} öğe, ${(d.items || []).filter((i) => i.rows).length} çalınabilir`);
}
console.log(checked ? (problems ? `${problems} sorun` : 'Sorun yok') : 'Denetlenecek dosya yok');
process.exit(problems ? 1 : 0);
