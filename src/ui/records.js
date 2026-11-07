// 기록(최근 20판)과 업적 — localStorage 'oop-records-v1', 'oop-meta-v1'. storage는 주입 가능 (테스트용). DOM 없음.
export const RECORDS_KEY = 'oop-records-v1', META_KEY = 'oop-meta-v1', MAX_RECORDS = 20;

const load = (storage, key, fallback) => { try { const v = JSON.parse(storage.getItem(key)); return v ?? fallback; } catch { return fallback; } };
const save = (storage, key, v) => { try { storage.setItem(key, JSON.stringify(v)); return true; } catch { return false; } };

export const readRecords = (storage = globalThis.localStorage) => { const r = load(storage, RECORDS_KEY, []); return Array.isArray(r) ? r.filter((x) => x && typeof x.score === 'number') : []; };

/** 같은 id(시드+국가+라운드+난이도)는 한 번만 저장한다. 최신이 앞. { records, added } */
export function addRecord(storage, rec) {
  const all = readRecords(storage);
  if (all.some((r) => r.id === rec.id)) return { records: all, added: false };
  const records = [rec, ...all].slice(0, MAX_RECORDS);
  save(storage, RECORDS_KEY, records);
  return { records, added: true };
}
/** 라운드 수별 최고 점수 { 6: 41, 8: 55 } */
export const bestByRounds = (records) => records.reduce((o, r) => { if (!(r.rounds in o) || r.score > o[r.rounds]) o[r.rounds] = r.score; return o; }, {});
export const winCount = (records) => records.filter((r) => r.win).length;

/** 업적 목록. test(meta, rec): meta는 이번 판이 반영된 누적값 */
export const ACHIEVEMENTS = [
  { id: 'first-win', name: '첫 승리', desc: '처음으로 승리한다', test: (m) => m.wins >= 1 },
  { id: 'full-10', name: '10라운드 완주', desc: '10라운드 판을 끝까지 마친다', test: (m, r) => r.rounds === 10 },
  { id: 'goals-3', name: '비밀 목표 3개', desc: '비밀 목표를 누적 3개 달성한다', test: (m) => m.goalsMet >= 3 },
  { id: 'hard-win', name: '어려움 승리', desc: 'AI 난이도 어려움에서 승리한다', test: (m, r) => r.win && r.level === 'hard' },
  { id: 'four-types', name: '네 성향 4승', desc: '서로 다른 성향 네 가지로 승리한다', test: (m) => m.winTypes.length >= 4 },
  { id: 'tutorial', name: '튜토리얼 수료', desc: '튜토리얼을 끝까지 마친다', manual: true, test: () => false }, // 판이 아니라 튜토리얼이 직접 준다
];
const freshMeta = () => ({ v: 1, games: 0, wins: 0, goalsMet: 0, winTypes: [], achievements: {} });
export const readMeta = (storage = globalThis.localStorage) => ({ ...freshMeta(), ...load(storage, META_KEY, {}) });

/** 한 판을 누적에 반영하고 새로 달성한 업적을 돌려준다. { meta, unlocked } */
export function updateMeta(storage, rec, goalsMet = 0) {
  const meta = readMeta(storage);
  meta.games += 1; meta.goalsMet += goalsMet;
  if (rec.win) { meta.wins += 1; if (rec.archetype && !meta.winTypes.includes(rec.archetype)) meta.winTypes.push(rec.archetype); }
  const unlocked = ACHIEVEMENTS.filter((a) => !meta.achievements[a.id] && a.test(meta, rec));
  for (const a of unlocked) meta.achievements[a.id] = rec.date;
  save(storage, META_KEY, meta);
  return { meta, unlocked };
}

/** 판과 상관없이 업적 하나를 직접 준다 (이미 있으면 그대로). 새로 얻었으면 true */
export function unlockAchievement(storage, id, date = new Date().toISOString()) {
  const meta = readMeta(storage);
  if (meta.achievements[id]) return false;
  meta.achievements[id] = date; save(storage, META_KEY, meta);
  return true;
}
