// "Her Gün Bir Parça" kitap sunucusu (Cloudflare Worker).
// Kitabın notaları telifli olduğu için depoda ve herkese açık sitede durmaz: bu Worker'a ayrı bir modül olarak
// (book.txt, JSON metni) yüklenir ve yalnızca okul Google hesabıyla giriş yapanlara verilir.
//
// İstek: POST /book, başlık "Authorization: Bearer <Google kimlik jetonu (ID token)>"
// Denetim: jetonun imzası (Google'ın açık anahtarları, RS256), alıcı (GOOGLE_CLIENT_ID), yayıncı, süre,
// e-posta doğrulanmış ve alan adı ALLOWED_DOMAINS içinde (ör. "alkev.k12.tr,stu.alkev.k12.tr").
// Ortam değişkenleri: GOOGLE_CLIENT_ID, ALLOWED_DOMAINS, ALLOWED_ORIGINS (ör. "https://alkevtech.github.io").
import BOOK from './book.txt';

const CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
let certs = { keys: [], until: 0 };

const b64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));
const json = (body, status, headers) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } });

async function googleKeys(force = false) {
  if (!force && certs.until > Date.now() && certs.keys.length) return certs.keys;
  const res = await fetch(CERTS_URL);
  const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get('cache-control') || '')?.[1] || 3600);
  certs = { keys: (await res.json()).keys || [], until: Date.now() + maxAge * 1000 };
  return certs.keys;
}

/** Google kimlik jetonunu doğrular; geçerliyse içeriğini (payload) döndürür */
async function verify(token, env) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('jeton biçimi');
  const header = JSON.parse(new TextDecoder().decode(b64url(parts[0])));
  const payload = JSON.parse(new TextDecoder().decode(b64url(parts[1])));
  if (header.alg !== 'RS256') throw new Error('algoritma');
  let jwk = (await googleKeys()).find((k) => k.kid === header.kid);
  if (!jwk) jwk = (await googleKeys(true)).find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('anahtar');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64url(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  if (!ok) throw new Error('imza');
  const now = Date.now() / 1000;
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(payload.iss)) throw new Error('yayıncı');
  if (payload.aud !== env.GOOGLE_CLIENT_ID) throw new Error('alıcı');
  if (!(payload.exp > now - 60)) throw new Error('süresi dolmuş');
  if (payload.email_verified !== true && payload.email_verified !== 'true') throw new Error('e-posta doğrulanmamış');
  const domains = (env.ALLOWED_DOMAINS || '').split(',').map((d) => d.trim().toLowerCase()).filter(Boolean);
  const domain = String(payload.email || '').split('@')[1]?.toLowerCase();
  if (!domains.includes(domain)) throw Object.assign(new Error('alan adı'), { domain });
  return payload;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean);
    const cors = allowed.includes(origin) ? { 'access-control-allow-origin': origin, vary: 'origin' } : {};
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { ...cors, 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'authorization, content-type', 'access-control-max-age': '86400' } });
    }
    const url = new URL(request.url);
    if (url.pathname !== '/book' || request.method !== 'POST') return json({ error: 'bulunamadı' }, 404, cors);
    const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) return json({ error: 'giriş gerekli' }, 401, cors);
    try {
      const who = await verify(token, env);
      return new Response(BOOK, { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'private, no-store', ...cors, 'x-hergun-user': encodeURIComponent(who.email) } });
    } catch (e) {
      const msg = e.domain ? `Bu bölüm yalnızca okul hesaplarına açık (${e.domain} değil).` : 'Giriş doğrulanamadı, yeniden giriş yap.';
      return json({ error: msg }, 403, cors);
    }
  },
};
