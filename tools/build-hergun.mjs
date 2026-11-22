// Kitap verisini tek dosyada toplar: private/hergun/book.json (depoya girmez; Worker'a book.txt olarak yüklenir).
// Sıra: 1–5. dersler, 1. test, 6–10, 2. test, 11–15, 3. test, 16–20, 4. test.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const dir = new URL('../private/hergun/', import.meta.url);
const order = [];
for (let t = 0; t < 4; t++) {
  for (let d = t * 5 + 1; d <= t * 5 + 5; d++) order.push(`ders-${String(d).padStart(2, '0')}.json`);
  order.push(`test-${t + 1}.json`);
}
const days = [];
for (const f of order) {
  const p = new URL(f, dir);
  if (!existsSync(p)) {
    console.log(`eksik: ${f}`);
    continue;
  }
  days.push(JSON.parse(readFileSync(p, 'utf8')));
}
const book = { title: 'Her Gün Bir Parça Öğrenelim – Flüt, 1. Kitap', days };
writeFileSync(new URL('book.json', dir), JSON.stringify(book));
console.log(`book.json: ${days.length} gün, ${days.reduce((n, d) => n + d.items.filter((i) => i.rows).length, 0)} çalınabilir öğe, ${(JSON.stringify(book).length / 1024).toFixed(0)} KB`);
