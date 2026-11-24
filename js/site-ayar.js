/* Bu sitenin okul sistemi ayarı (ortak ayar: alkevtech.github.io/ortak/ayar.js). İkisi window.COK_AYAR'da birleşir; aynı alan
   ikisinde varsa bu dosyadaki geçerlidir. buDers: ortak/ayar.js · dersler'deki kimlik (Müzik). */
(() => {
  const SITE = {
    buDers: 'muzik',
    siteAd: 'Nokta Nokta Müzik',
    birlikte: [], // birlikte gezilen dünya yok: birlikte gezme ayarı ve düğmeleri görünmez
    serit: true, // sağ altta e-posta, Ödevlerim / öğretmen paneli ve çıkış
  };
  window.COK_AYAR = Object.assign(window.COK_AYAR || {}, SITE);
  window.SITE_AYAR = true;
})();
