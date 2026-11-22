// "Gün Gün Flüt" günlerini plan sırasıyla tek dosyada toplar: data/gungun/kitap.json (uygulama bunu yükler).
// Önce denetle: node tools/check-gungun.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const dir = new URL('../data/gungun/', import.meta.url);
const plan = JSON.parse(readFileSync(new URL('plan.json', dir), 'utf8'));
const days = [];
for (const p of plan) {
  const f = new URL(`${p.file}.json`, dir);
  if (!existsSync(f)) {
    console.log(`eksik: ${p.file}`);
    continue;
  }
  days.push(JSON.parse(readFileSync(f, 'utf8')));
}
const book = { title: 'Gün Gün Flüt', days };
writeFileSync(new URL('kitap.json', dir), JSON.stringify(book));
const playable = days.reduce((n, d) => n + d.items.filter((i) => i.rows).length, 0);
console.log(`kitap.json: ${days.length} gün, ${playable} çalınabilir öğe, ${(JSON.stringify(book).length / 1024).toFixed(0)} KB`);
