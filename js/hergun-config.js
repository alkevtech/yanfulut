// "Her Gün Bir Parça Öğrenelim" bölümünün ayarları (gizli bilgi yok: istemci kimliği ve sunucu adresi herkese açıktır).
// Kitap verisi burada değil: yalnızca okul hesabıyla giriş yapanlara sunucudan (Cloudflare Worker) gelir.
export const HERGUN = {
  // Google Cloud Console › API'ler ve Hizmetler › Kimlik bilgileri › OAuth 2.0 istemci kimliği (Web uygulaması)
  googleClientId: '',
  // Cloudflare Worker adresi, ör. https://hergun.<hesap>.workers.dev
  workerUrl: '',
  // Girişe izin verilen okul alan adları (asıl denetim sunucuda yapılır)
  domains: ['alkev.k12.tr', 'stu.alkev.k12.tr'],
};
