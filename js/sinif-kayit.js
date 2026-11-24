// Okulun ortak sınıf sistemi (alkevtech.github.io/ortak) ile bağlantı: öğrencinin ödev ilerlemesini öğretmenine gönderir.
// Kapı (ortak/js/kapi.js) öğrenciyi girişe sokar ve şubesini localStorage 'nokta-sinif'e yazar; bu dosya ödev kataloğundaki
// (js/sinif/katalog.js) her öğenin durumunu uygulamanın ilerlemesinden hesaplayıp ortak sistemin beklediği yerlere yazar:
//   sonuclar/{şube}/{uid}/{ödev} = { deneme, son: { puan, max, yildiz, dogru, ilerleme, bitti, adimlar … }, guncel, enIyi, ilkBitti }
//   ilerleme/{şube}/{uid}/{ödev} = 0–1 arası pay; bitince bitirdiği an (sınıf hedefi için)
// Yalnız öğrencinin şubesine atanmış ödevler yazılır (KAPI.izinli). Öğretmen ve okul dışı açılış (kapı yoksa) hiçbir şey yazmaz.
// Puan: her adım en çok 3 yıldız (video ders bitince 3); ödev, bütün adımlarında en az bir yıldız olunca biter.
import { progress } from './progress.js';
import { instrument } from './instrument.js';

let V = null;
let O = null;
const ilk = new Map(); // ödev → { eski kayıt okundu mu, en iyi, ilkBitti, pay }

/** Bir ödevin uygulamadaki durumu */
function durum(o) {
  const st = o.uyeler.map((k) => progress.status(k));
  const done = st.filter((s) => s > 0).length;
  const puan = st.reduce((a, b) => a + b, 0);
  const max = 3 * st.length;
  const bitti = done === st.length;
  const yildiz = bitti ? Math.max(1, Math.round(puan / st.length)) : 0;
  const adimlar = o.uyeler.map((k, i) => ({ ad: k.replace(/^L:/, 'ders ').replace(/^ws-(gg-)?/, ''), y: 0, i: 0, yildiz: st[i] })).filter((a) => a.yildiz > 0);
  return { puan, max, yildiz, dogru: done, yanlis: 0, ipucu: 0, ilerleme: st.length ? done / st.length : 0, bitti, adimlar };
}

async function gonder(o) {
  const yol = `sonuclar/${O.kod}/${O.uid}/${o.id}`;
  const pYol = `ilerleme/${O.kod}/${O.uid}/${o.id}`;
  let m = ilk.get(o.id);
  if (!m) {
    const eski = (await V.get(yol)) || {};
    m = { enIyi: eski.enIyi || null, ilkBitti: eski.ilkBitti || null, pay: Number(await V.get(pYol).catch(() => 0)) || 0, deneme: eski.deneme || 0, sonPuan: eski.son ? eski.son.puan : -1, sonDogru: eski.son ? eski.son.dogru : -1 };
    ilk.set(o.id, m);
  }
  const S = durum(o);
  if (S.puan === m.sonPuan && S.dogru === m.sonDogru) return; // değişiklik yok
  if (!S.dogru && !m.deneme) return; // hiç başlanmamış ödev için boş kayıt açılmaz
  const now = Date.now();
  const veri = { son: { basla: now, guncel: V.zaman(), sure: 0, ...S }, guncel: V.zaman() };
  if (!m.deneme) veri.deneme = m.deneme = 1;
  if (S.bitti && !m.ilkBitti) veri.ilkBitti = m.ilkBitti = V.zaman();
  if (S.bitti && (!m.enIyi || S.puan >= (m.enIyi.puan || 0))) veri.enIyi = m.enIyi = { puan: S.puan, max: S.max, yildiz: S.yildiz, t: now };
  await V.update(yol, veri);
  m.sonPuan = S.puan;
  m.sonDogru = S.dogru;
  // sınıf hedefi: yalnız artınca; bitince bitirdiği an (sayı 1'den büyük olur)
  if (m.pay <= 1) {
    const v = S.bitti ? V.zaman() : Math.round(S.ilerleme * 100) / 100;
    if (S.bitti || v > m.pay) {
      m.pay = S.bitti ? 2 : v;
      await V.set(pYol, v).catch(() => {});
    }
  }
}

/** Atanan ödevlerden bu uygulamanınkiler (flüt, keman, piyano ayrı sayfalar) */
const atananlar = (K) => Object.values(window.SINIF_OYUN || {}).filter((o) => o.alet === instrument().id && K.acik(o.id) && K.izinli);

let kuyruk = Promise.resolve();
const sirala = (f) => (kuyruk = kuyruk.then(f).catch(() => rozet('kaydedilemedi', true)));

let rozetEl = null;
function rozet(t, hata) {
  if (!rozetEl) {
    rozetEl = document.createElement('a');
    rozetEl.className = 'sinif-rozet';
    rozetEl.href = `${window.KAPI.kok}sinif.html`;
    document.body.appendChild(rozetEl);
  }
  rozetEl.innerHTML = `🎒 <b>${String(O.sinifAd || O.kod).replace(/[<>&]/g, '')}</b> <span${hata ? ' class="hata"' : ''}>${t}</span>`;
}

const yukle = (src) =>
  new Promise((ok, no) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = ok;
    s.onerror = no;
    document.head.appendChild(s);
  });

async function basla(K) {
  if (!K || K.ogretmen || !K.izinli || !window.SinifVeri) return;
  try {
    O = JSON.parse(localStorage.getItem('nokta-sinif'));
  } catch {
    O = null;
  }
  if (!O || !O.kod || O.uid !== K.me.uid) return;
  if (!window.SINIF_OYUN) await yukle(`${K.kok}js/sinif/katalog.js`).catch(() => {});
  const benim = atananlar(K);
  if (!benim.length) return;
  V = window.SinifVeri.kur(O.mod === 'yerel');
  rozet(`${benim.length} ödev · bağlanıyor…`);
  // açılışta: atanan ödevlerde daha önce yapılanlar da öğretmene gitsin
  sirala(async () => {
    for (const o of benim) await gonder(o);
    rozet(`${benim.length} ödev · kaydediliyor ✓`);
  });
  addEventListener('ilerleme', (e) => {
    const ilgili = benim.filter((o) => o.uyeler.includes(e.detail.key));
    if (!ilgili.length) return;
    sirala(async () => {
      for (const o of ilgili) await gonder(o);
      const b = ilgili.filter((o) => durum(o).bitti);
      rozet(b.length ? `${b[b.length - 1].ad.slice(0, 28)} bitti, öğretmenine gitti ✓` : 'kaydedildi ✓');
    });
  });
}

/** Kapı açıldıysa hemen, açılmadıysa açılınca başlar; kapısız (yerel deneme) açılışta hiçbir şey yapmaz */
export function sinifBagla() {
  if (window.KAPI) basla(window.KAPI);
  else addEventListener('kapi-acik', (e) => basla(e.detail), { once: true });
}
