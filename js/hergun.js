// "Her Gün Bir Parça Öğrenelim – Flüt, 1. Kitap": gün gün ilerleyen ayrı bir yol.
// Kitap telifli olduğu için notalar sitede durmaz: okul Google hesabıyla giriş yapılınca korumalı sunucudan
// (Cloudflare Worker, worker/hergun-worker.js) gelir ve yalnızca bu tarayıcı oturumunda tutulur.
// Sayfalar: #/hergun (günler), #/hergun/<gün> (dersin hedefleri, yeni notalar, çalışmalar), #/hergun/<gün>/<öğe> (çalma).
import { HERGUN } from './hergun-config.js';
import { SheetGame } from './sheet.js';
import { fingeringSvg, staffSvg, h } from './checkpoints.js';
import { titleName } from './data/notes.js';
import { playNote } from './audio.js';
import { progress } from './progress.js';

const STORE = 'hergun.book.v1';
let book = null; // { days: [...] }

/** Yerel denemede (localhost) sunucu yerine yerel dosya: localStorage 'hergun.dev' = adres */
const devUrl = () => {
  try {
    return ['localhost', '127.0.0.1'].includes(location.hostname) ? localStorage.getItem('hergun.dev') : null;
  } catch {
    return null;
  }
};

/** Bölüm kullanılabilir mi: kurulum tamam ya da yerel deneme */
export const hergunReady = () => !!((HERGUN.googleClientId && HERGUN.workerUrl) || devUrl());

function loadCached() {
  if (book) return book;
  try {
    const s = sessionStorage.getItem(STORE);
    if (s) book = JSON.parse(s);
  } catch {
    /* oturum belleği yoksa yeniden giriş istenir */
  }
  return book;
}

function keep(data) {
  book = data;
  try {
    sessionStorage.setItem(STORE, JSON.stringify(data));
  } catch {
    /* sığmazsa yalnızca bu sayfa açıkken tutulur */
  }
}

export function signOut() {
  book = null;
  try {
    sessionStorage.removeItem(STORE);
  } catch {
    /* önemsiz */
  }
  window.google?.accounts?.id?.disableAutoSelect?.();
}

async function fetchBook(token) {
  const dev = devUrl();
  const res = dev ? await fetch(dev) : await fetch(`${HERGUN.workerUrl.replace(/\/$/, '')}/book`, { method: 'POST', headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) {
    let msg = `Sunucu yanıtı: ${res.status}`;
    try {
      msg = (await res.json()).error || msg;
    } catch {
      /* düz metin */
    }
    throw new Error(msg);
  }
  const data = await res.json();
  keep(data);
  return data;
}

let gsiLoading = null;
function loadGsi() {
  if (window.google?.accounts?.id) return Promise.resolve();
  gsiLoading ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Google giriş bileşeni yüklenemedi (internet bağlantısını kontrol et).'));
    document.head.appendChild(s);
  });
  return gsiLoading;
}

/** Giriş kartı: Google düğmesi; giriş olunca kitap yüklenir ve onReady çağrılır */
function loginCard(onReady) {
  const card = h(`<div class="card hg-login">
    <h3>🔒 Okul hesabınla giriş yap</h3>
    <p>Bu bölüm kitabın notalarını içerir; yalnızca <b>${HERGUN.domains.map((d) => `@${d}`).join('</b> ve <b>')}</b> hesaplarına açıktır.</p>
    <div class="hg-gbtn"></div>
    <p class="hg-login-msg muted" aria-live="polite"></p>
  </div>`);
  const msg = card.querySelector('.hg-login-msg');
  const configured = HERGUN.googleClientId && HERGUN.workerUrl;
  if (devUrl()) {
    const b = h('<button class="btn primary">Yerel deneme verisini yükle</button>');
    b.addEventListener('click', () => fetchBook('dev').then(onReady, (e) => (msg.textContent = e.message)));
    card.querySelector('.hg-gbtn').appendChild(b);
    return card;
  }
  if (!configured) {
    msg.textContent = 'Kurulum tamamlanınca burada giriş düğmesi çıkacak (Google istemci kimliği ve sunucu adresi bekleniyor).';
    return card;
  }
  loadGsi().then(
    () => {
      window.google.accounts.id.initialize({
        client_id: HERGUN.googleClientId,
        auto_select: true,
        callback: (r) => {
          msg.textContent = 'Giriş doğrulanıyor…';
          fetchBook(r.credential).then(onReady, (e) => (msg.textContent = e.message));
        },
      });
      window.google.accounts.id.renderButton(card.querySelector('.hg-gbtn'), { theme: 'outline', size: 'large', text: 'signin_with', locale: 'tr' });
    },
    (e) => (msg.textContent = e.message),
  );
  return card;
}

const playable = (it) => Array.isArray(it.rows) && it.rows.length > 0;
const dayKey = (d) => String(d.day);
const dayLabel = (d) => (String(d.day).startsWith('test') ? '📝 Test' : `Gün ${d.day}`);
const starsOf = (it) => progress.songStars(`ws-hg-${it.id}`);
const starsHtml = (n) => `<span class="stars small">${[1, 2, 3].map((k) => `<span class="${k <= n ? 'on' : ''}">★</span>`).join('')}</span>`;
const dayDone = (d) => {
  const p = d.items.filter(playable);
  return { done: p.filter((it) => starsOf(it) > 0).length, total: p.length };
};

/** Bir öğeyi Egzersiz Yap motorunun anladığı egzersize çevirir */
function toExercise(d, it) {
  return {
    id: `hg-${it.id}`,
    title: it.title,
    focus: `${d.title} · kitap s. ${d.bookPage}${it.text ? ` · ${it.text}` : ''}`,
    credit: it.credit ? (it.credit === 'Geleneksel' ? 'Geleneksel ezgi' : `Beste/düzenleme: ${it.credit}`) : '',
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

/** #/hergun… sayfaları. ctx: { view, setActive(game), pagerHtml } */
export function showHergun(path, ctx) {
  const { view } = ctx;
  view.innerHTML = '';
  const data = loadCached();
  if (!data) {
    const page = h(`<section class="drill-list-page hg-page">${head('Her Gün Bir Parça Öğrenelim · Flüt')}
      <p class="muted">Kitabın 20 dersi ve 4 testi gün gün: her gün yeni notalar, çalışmalar ve parçalar. Notaları mikrofonla ya da tuşla
        çalarsın; uygulama her notayı ve süresini dinler. Mevcut dersler ve egzersizler olduğu gibi devam ediyor.</p></section>`);
    page.appendChild(loginCard(() => showHergun(path, ctx)));
    view.appendChild(page);
    return;
  }
  const days = data.days || [];
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
  const page = h(`<section class="drill-list-page hg-page">${head('Her Gün Bir Parça Öğrenelim · Flüt')}
    <p class="muted">Kitabı gün gün izle: hedefleri oku, yeni notaların parmaklarını gör, çalışmaları ve parçaları çal.
      Her çalınan alıştırma yıldızla işaretlenir. Kitabın sayfa numaraları her derste yazılı.</p>
    ${today ? `<a class="card hg-today" href="#/hergun/${dayKey(today)}"><span class="node-kind">Sıradaki</span><b>${dayLabel(today)} · ${today.title}</b><span>${(today.goals || []).slice(0, 3).join(' · ')}</span></a>` : ''}
    <div class="drill-cards hg-days"></div>
    <p class="small-print muted">Her Gün Bir Parça Öğrenelim – Flüt, 1. Kitap (A New Tune A Day for Flute, Ned Bennett; © 2005 Boston Music Company, Türkçe edisyon: Porte Müzik). Yalnızca okul içi kullanım içindir.
      <button class="link hg-signout">Çıkış yap</button></p>
  </section>`);
  page.querySelector('.hg-days').append(
    ...days.map((d) => {
      const { done, total } = dayDone(d);
      return h(`<a class="drill-card ${String(d.day).startsWith('test') ? 'hg-test' : ''}" href="#/hergun/${dayKey(d)}">
        <span class="node-kind">${dayLabel(d)} · s. ${d.bookPage}</span>
        <b>${d.title}</b>
        <span>${(d.goals || []).slice(0, 4).join(' · ') || ''}</span>
        <small class="muted">${total ? `${done} / ${total} alıştırma` : ''}${d.newNotes?.length ? ` · yeni: ${d.newNotes.map(titleName).join(', ')}` : ''}</small>
      </a>`);
    }),
  );
  page.querySelector('.hg-signout').addEventListener('click', () => {
    signOut();
    location.hash = '#/hergun';
    showHergun([], { view });
  });
  view.appendChild(page);
}

function showDay(d, days, { view, pagerHtml }) {
  const k = days.indexOf(d);
  const link = (x) => x && { href: `#/hergun/${dayKey(x)}`, title: x.title };
  const nav = { prev: link(days[k - 1]), next: link(days[k + 1]) };
  const page = h(`<section class="drill-list-page hg-page">
    <div class="page-head"><a class="back" href="#/hergun">← Her Gün Bir Parça</a>${pagerHtml(nav, 'gün', k, days.length)}</div>
    <h2>${dayLabel(d)} · ${d.title} <span class="muted hg-page-no">kitap s. ${d.bookPage}</span></h2>
    ${d.goals?.length ? `<div class="card hg-goals"><b>Hedefler</b><ol>${d.goals.map((g) => `<li>${g}</li>`).join('')}</ol></div>` : ''}
    ${d.newNotes?.length ? `<div class="ws-new-notes">${d.newNotes.map((n) => `<div class="ws-new-note"><div class="ws-new-top"><b>${titleName(n)}</b>${staffSvg(n)}<button class="btn ghost small" data-play="${n}">🔊</button></div>${fingeringSvg(n)}</div>`).join('')}</div>` : ''}
    ${(d.sections || []).map((s) => `<details class="card hg-section"><summary><b>${s.title}</b></summary><p>${s.text}</p></details>`).join('')}
    <div class="hg-items"></div>
  </section>`);
  page.querySelector('.hg-items').append(
    ...d.items.map((it) =>
      playable(it)
        ? h(`<a class="drill-card hg-item" href="#/hergun/${dayKey(d)}/${it.id}">
            <span class="node-kind">${it.kind === 'parca' ? '🎵 Parça' : it.kind === 'test' ? '📝 Test' : '✏️ Çalışma'}${it.credit ? ` · ${it.credit}` : ''}</span>
            <b>${it.title}</b><span>${it.text || ''}</span>${starsHtml(starsOf(it))}</a>`)
        : h(`<div class="card hg-info"><span class="node-kind">${it.kind === 'test' ? '📝 Test sorusu' : '💡 Okuyup uygula'}</span><b>${it.title}</b><p>${it.text || ''}</p></div>`),
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
  const link = (x) => x && { href: `#/hergun/${dayKey(x.d)}/${x.it.id}`, title: `${x.d !== d ? `${x.d.title} · ` : ''}${x.it.title}` };
  const nav = { prev: link(all[k - 1]), next: link(all[k + 1]) };
  const page = h(`<section class="drill-page">
    <div class="page-head"><a class="back" href="#/hergun/${dayKey(d)}">← ${dayLabel(d)} · ${d.title}</a>${pagerHtml(nav, 'alıştırma', k, all.length)}</div>
    <div class="game-host"></div>
  </section>`);
  view.appendChild(page);
  setActive(new SheetGame(page.querySelector('.game-host'), toExercise(d, all[k].it), { nav }));
}
