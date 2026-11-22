// "Gün Gün Flüt": bu uygulama için yazılmış özgün, gün gün ilerleyen başlangıç kitabı (20 gün + 4 tekrar günü).
// Veri: data/gungun/<gün>.json (plan: data/gungun/plan.json); tools/build-gungun.mjs hepsini data/gungun/kitap.json'da toplar.
// Sayfalar: #/gungun (günler), #/gungun/<gün> (hedefler, konu, yeni notalar, alıştırmalar), #/gungun/<gün>/<öğe> (çalma).
import { SheetGame } from './sheet.js';
import { fingeringSvg, staffSvg, h } from './checkpoints.js';
import { titleName } from './data/notes.js';
import { playNote } from './audio.js';
import { progress } from './progress.js';

const BOOK_URL = 'data/gungun/kitap.json';
let book = null; // { title, days: [...] }
let loading = null;

function loadBook() {
  if (book) return Promise.resolve(book);
  loading ||= fetch(BOOK_URL)
    .then((r) => {
      if (!r.ok) throw new Error(`Kitap yüklenemedi (${r.status})`);
      return r.json();
    })
    .then((data) => (book = data))
    .finally(() => (loading = null));
  return loading;
}

const playable = (it) => Array.isArray(it.rows) && it.rows.length > 0;
const dayKey = (d) => String(d.day);
const isReview = (d) => String(d.day).startsWith('tekrar');
const dayLabel = (d) => (isReview(d) ? '🔁 Tekrar günü' : `${d.day}. Gün`);
const starsOf = (it) => progress.songStars(`ws-gg-${it.id}`);
const starsHtml = (n) => `<span class="stars small">${[1, 2, 3].map((k) => `<span class="${k <= n ? 'on' : ''}">★</span>`).join('')}</span>`;
const dayDone = (d) => {
  const p = d.items.filter(playable);
  return { done: p.filter((it) => starsOf(it) > 0).length, total: p.length };
};

/** Bir öğeyi Egzersiz Yap motorunun anladığı egzersize çevirir */
function toExercise(d, it) {
  return {
    id: `gg-${it.id}`,
    title: it.title,
    focus: `${dayLabel(d)} · ${d.title}${it.text ? ` · ${it.text}` : ''}`,
    credit: it.credit ? (it.credit === 'Gün Gün Flüt' ? 'Gün Gün Flüt için yazıldı' : `${it.credit} · düzenleme: Gün Gün Flüt`) : '',
    time: it.time,
    sig: it.sig,
    beatUnit: it.beatUnit,
    pickup: it.pickup,
    key: it.key,
    bpm: it.bpm,
    rows: it.rows,
  };
}

function head(title, back) {
  return `<div class="page-head">${back ? `<a class="back" href="${back.href}">← ${back.label}</a>` : ''}<h2>${title}</h2></div>`;
}

/** #/gungun… sayfaları. ctx: { view, setActive(game), pagerHtml } */
export function showGungun(path, ctx) {
  const { view } = ctx;
  view.innerHTML = '';
  if (!book) {
    view.appendChild(h(`<section class="drill-list-page hg-page">${head('Gün Gün Flüt')}<p class="muted hg-loading">Kitap yükleniyor…</p></section>`));
    const at = location.hash;
    loadBook().then(
      () => location.hash === at && showGungun(path, ctx),
      (e) => {
        const m = view.querySelector('.hg-loading');
        if (m) m.textContent = `${e.message}. İnternet bağlantını kontrol edip sayfayı yenile.`;
      },
    );
    return;
  }
  const days = book.days || [];
  const [dayId, itemId] = path;
  const d = dayId != null && days.find((x) => dayKey(x) === dayId);
  if (d && itemId) return showItem(d, itemId, days, ctx);
  if (d) return showDay(d, days, ctx);
  showDays(days, ctx);
}

function showDays(days, { view }) {
  const today = days.find((d) => {
    const { done, total } = dayDone(d);
    return total > 0 && done < total;
  });
  const page = h(`<section class="drill-list-page hg-page">${head('Gün Gün Flüt')}
    <p class="muted">Her gün bir adım: hedefleri oku, konuyu öğren, yeni notaların parmaklarını gör, alıştırmaları ve parçaları çal.
      Uygulama her notayı ve süresini dinler; çaldığın her alıştırma yıldızla işaretlenir. Her beş günde bir tekrar günü var.</p>
    ${today ? `<a class="card hg-today" href="#/gungun/${dayKey(today)}"><span class="node-kind">Sıradaki</span><b>${dayLabel(today)} · ${today.title}</b><span>${(today.goals || []).slice(0, 3).join(' · ')}</span></a>` : ''}
    <div class="drill-cards hg-days"></div>
    <p class="small-print muted">Gün Gün Flüt, bu uygulama için yazılmış özgün bir başlangıç kitabıdır. Parçalar, kamu malı geleneksel ezgilerin
      ve klasik eserlerin basit düzenlemeleri ile kitap için yazılmış özgün bestelerdir.</p>
  </section>`);
  page.querySelector('.hg-days').append(
    ...days.map((d) => {
      const { done, total } = dayDone(d);
      return h(`<a class="drill-card ${isReview(d) ? 'hg-test' : ''}" href="#/gungun/${dayKey(d)}">
        <span class="node-kind">${dayLabel(d)}</span>
        <b>${d.title}</b>
        <span>${(d.goals || []).slice(0, 3).join(' · ')}</span>
        <small class="muted">${total ? `${done} / ${total} alıştırma` : ''}${d.newNotes?.length ? ` · yeni: ${d.newNotes.map(titleName).join(', ')}` : ''}</small>
      </a>`);
    }),
  );
  view.appendChild(page);
}

function showDay(d, days, { view, pagerHtml }) {
  const k = days.indexOf(d);
  const link = (x) => x && { href: `#/gungun/${dayKey(x)}`, title: x.title };
  const nav = { prev: link(days[k - 1]), next: link(days[k + 1]) };
  const page = h(`<section class="drill-list-page hg-page">
    <div class="page-head"><a class="back" href="#/gungun">← Gün Gün Flüt</a>${pagerHtml(nav, 'gün', k, days.length)}</div>
    <h2>${dayLabel(d)} · ${d.title}</h2>
    ${d.goals?.length ? `<div class="card hg-goals"><b>Hedefler</b><ol>${d.goals.map((g) => `<li>${g}</li>`).join('')}</ol></div>` : ''}
    ${d.newNotes?.length ? `<div class="ws-new-notes">${d.newNotes.map((n) => `<div class="ws-new-note"><div class="ws-new-top"><b>${titleName(n)}</b>${staffSvg(n)}<button class="btn ghost small" data-play="${n}">🔊</button></div>${fingeringSvg(n)}</div>`).join('')}</div>` : ''}
    ${(d.sections || []).map((s) => `<details class="card hg-section"><summary><b>${s.title}</b></summary><p>${s.text}</p></details>`).join('')}
    <div class="hg-items"></div>
  </section>`);
  page.querySelector('.hg-items').append(
    ...d.items.map((it) =>
      playable(it)
        ? h(`<a class="drill-card hg-item" href="#/gungun/${dayKey(d)}/${it.id}">
            <span class="node-kind">${it.kind === 'parca' ? '🎵 Parça' : '✏️ Alıştırma'}${it.credit ? ` · ${it.credit}` : ''}</span>
            <b>${it.title}</b><span>${it.text || ''}</span>${starsHtml(starsOf(it))}</a>`)
        : it.kind === 'test'
          ? h(`<details class="card hg-info hg-q"><summary><span class="node-kind">❓ ${it.title}</span><b>${it.text || ''}</b><span class="muted small">Cevabı görmek için dokun</span></summary><p class="hg-answer">✅ ${it.answer || ''}</p></details>`)
          : h(`<div class="card hg-info"><span class="node-kind">💡 Isınma</span><b>${it.title}</b><p>${it.text || ''}</p></div>`),
    ),
  );
  page.addEventListener('click', (e) => {
    const b = e.target.closest('[data-play]');
    if (b) playNote(b.dataset.play, 1.2);
  });
  view.appendChild(page);
}

function showItem(d, itemId, days, { view, setActive, pagerHtml }) {
  // Bütün kitabın çalınabilir öğeleri sırayla: önceki/sonraki gün sınırını da geçer
  const all = days.flatMap((x) => x.items.filter(playable).map((it) => ({ d: x, it })));
  const k = all.findIndex((x) => x.d === d && x.it.id === itemId);
  if (k < 0) return showDay(d, days, { view, pagerHtml });
  const link = (x) => x && { href: `#/gungun/${dayKey(x.d)}/${x.it.id}`, title: `${x.d !== d ? `${x.d.title} · ` : ''}${x.it.title}` };
  const nav = { prev: link(all[k - 1]), next: link(all[k + 1]) };
  const page = h(`<section class="drill-page">
    <div class="page-head"><a class="back" href="#/gungun/${dayKey(d)}">← ${dayLabel(d)} · ${d.title}</a>${pagerHtml(nav, 'alıştırma', k, all.length)}</div>
    <div class="game-host"></div>
  </section>`);
  view.appendChild(page);
  setActive(new SheetGame(page.querySelector('.game-host'), toExercise(d, all[k].it), { nav }));
}
