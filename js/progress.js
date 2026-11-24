// İlerleme ve ayarlar tarayıcıda (localStorage) saklanır; her enstrümanın ayrı kaydı var.
import { instrument } from './instrument.js';

const defaults = () => ({ lessons: {}, songs: {}, settings: { voice: true, captions: true, rate: 1, showFingering: true } });

function load() {
  try {
    const data = JSON.parse(localStorage.getItem(instrument().storageKey));
    if (data) return { ...defaults(), ...data, settings: { ...defaults().settings, ...data.settings } };
  } catch {
    /* gizli sekme vb. */
  }
  return defaults();
}

let cache = null;
const S = () => (cache ||= load());

function save() {
  try {
    localStorage.setItem(instrument().storageKey, JSON.stringify(S()));
  } catch {
    /* saklanamadıysa uygulama yine çalışır */
  }
}

/** İlerleme değişince haber verir (js/sinif-kayit.js öğretmene gönderir) */
const changed = (key) => dispatchEvent(new CustomEvent('ilerleme', { detail: { key } }));

export const progress = {
  isLessonDone: (id) => !!S().lessons[id],
  completeLesson(id) {
    S().lessons[id] = { done: true, at: Date.now() };
    save();
    changed(`L:${id}`);
  },
  songStars: (id) => S().songs[id]?.stars || 0,
  completeSong(id, stars) {
    S().songs[id] = { stars: Math.max(stars, S().songs[id]?.stars || 0), at: Date.now() };
    save();
    changed(id);
  },
  /** Okulun sınıf sistemi için: ilerleme anahtarının durumu ('L:<ders>' video ders, başkası yıldız anahtarı) */
  status(key) {
    if (key.startsWith('L:')) return S().lessons[key.slice(2)]?.done ? 3 : 0;
    return S().songs[key]?.stars || 0;
  },
  get settings() {
    return S().settings;
  },
  setSetting(k, v) {
    S().settings[k] = v;
    save();
  },
  reset() {
    Object.assign(S(), defaults());
    save();
  },
};
