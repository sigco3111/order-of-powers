// 설정 저장소 'oop-settings-v1': 기본값, 검증(손상된 값은 기본값), 옛 형식 이전, 내보내기/가져오기. DOM은 apply()에서만 만진다.
import { validSave, SAVE_KEY } from './loop.js';
import { RECORDS_KEY, META_KEY } from './records.js';

export const SETTINGS_KEY = 'oop-settings-v1', VERSION = '1.0.0-s1', REPO = 'https://github.com/sigco3111/order-of-powers';
export const TEXT_SIZES = { normal: 100, large: 115, xlarge: 130 };
export const DEFAULTS = Object.freeze({ v: 1, sfxOn: true, sfxVol: 60, musicOn: false, musicVol: 50, muteAll: false, reduceMotion: false, fast: false, textSize: 'normal', contrast: false });

const bool = (v, d) => (typeof v === 'boolean' ? v : d);
const vol = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(100, Math.max(0, Math.round(v))) : d);
/** 아무 값이나 받아 올바른 설정 객체로 만든다. 옛 형식({reduceMotion, sound})도 이전한다 */
export function sanitize(o) {
  const x = o && typeof o === 'object' && !Array.isArray(o) ? o : {}, d = DEFAULTS;
  return {
    v: 1,
    sfxOn: bool(x.sfxOn, bool(x.sound, d.sfxOn)), sfxVol: vol(x.sfxVol, d.sfxVol),
    musicOn: bool(x.musicOn, d.musicOn), musicVol: vol(x.musicVol, d.musicVol),
    muteAll: bool(x.muteAll, d.muteAll), reduceMotion: bool(x.reduceMotion, d.reduceMotion), fast: bool(x.fast, d.fast),
    textSize: Object.hasOwn(TEXT_SIZES, x.textSize) ? x.textSize : d.textSize, contrast: bool(x.contrast, d.contrast),
  };
}
export function loadSettings(storage = globalThis.localStorage) {
  try { return sanitize(JSON.parse(storage.getItem(SETTINGS_KEY))); } catch { return sanitize(null); }
}
export function saveSettings(s, storage = globalThis.localStorage) {
  try { storage.setItem(SETTINGS_KEY, JSON.stringify(sanitize(s))); return true; } catch { return false; }
}

/** 지금 쓰는 설정 (화면과 오디오가 함께 읽는다). 바꿀 때는 update() */
export const current = { ...DEFAULTS };
const listeners = new Set();
export const onSettings = (fn) => (listeners.add(fn), () => listeners.delete(fn));
export function update(patch, storage) {
  Object.assign(current, sanitize({ ...current, ...patch }));
  saveSettings(current, storage); apply(); for (const fn of listeners) { try { fn(current); } catch { /* 무시 */ } }
  return current;
}
export function init(storage) { Object.assign(current, loadSettings(storage)); apply(); return current; }
/** 글자 크기·대비·움직임을 <html>에 반영 */
export function apply(doc = globalThis.document, s = current) {
  const el = doc?.documentElement; if (!el) return;
  el.style.fontSize = `${TEXT_SIZES[s.textSize]}%`;
  el.dataset.motion = s.reduceMotion ? 'reduce' : 'auto';
  el.dataset.contrast = s.contrast ? 'high' : 'normal';
}

// ── 데이터 관리 ──
export const DATA_KEYS = [SAVE_KEY, RECORDS_KEY, META_KEY];
const parse = (storage, k) => { try { return JSON.parse(storage.getItem(k)); } catch { return null; } };
export function exportData(storage = globalThis.localStorage) {
  return JSON.stringify({ format: 'oop-export-v1', exportedAt: new Date().toISOString(), data: Object.fromEntries(DATA_KEYS.map((k) => [k, parse(storage, k)]).filter(([, v]) => v != null)) }, null, 1);
}
const okRecords = (r) => Array.isArray(r) && r.every((x) => x && typeof x === 'object' && typeof x.score === 'number');
const okMeta = (m) => !!m && typeof m === 'object' && !Array.isArray(m) && typeof m.games === 'number' && typeof m.wins === 'number';
const CHECK = { [SAVE_KEY]: validSave, [RECORDS_KEY]: okRecords, [META_KEY]: okMeta };
/** 붙여넣은 글을 검사해 통과한 항목만 저장한다. { ok, error?, imported: [키...] } */
export function importData(text, storage = globalThis.localStorage) {
  let o;
  try { o = JSON.parse(text); } catch { return { ok: false, error: 'JSON 형식이 올바르지 않습니다.', imported: [] }; }
  if (!o || o.format !== 'oop-export-v1' || !o.data || typeof o.data !== 'object') return { ok: false, error: '이 게임에서 내보낸 데이터가 아닙니다.', imported: [] };
  const found = DATA_KEYS.filter((k) => o.data[k] != null);
  if (!found.length) return { ok: false, error: '가져올 저장·기록 항목이 없습니다.', imported: [] };
  const bad = found.filter((k) => !CHECK[k](o.data[k]));
  if (bad.length) return { ok: false, error: `손상된 항목이 있어 가져오지 않았습니다: ${bad.join(', ')}`, imported: [] };
  try { for (const k of found) storage.setItem(k, JSON.stringify(o.data[k])); } catch { return { ok: false, error: '저장 공간에 쓰지 못했습니다.', imported: [] }; }
  return { ok: true, imported: found };
}
export const clearSave = (storage = globalThis.localStorage) => { try { storage.removeItem(SAVE_KEY); return true; } catch { return false; } };
export const clearRecords = (storage = globalThis.localStorage) => { try { storage.removeItem(RECORDS_KEY); storage.removeItem(META_KEY); return true; } catch { return false; } };
