// 국가: 4개 원형(atlas·redDragon·polarStar·emerald)마다 국가 5개. 좌석 id는 원형 id 그대로이고, 국가는 본거지 지역과 특성만 더한다.
import { indexData } from './util.js';
import { getData } from './data.js';
import { seedToState, shuffle } from './rng.js';

export const ARCHETYPES = ['atlas', 'redDragon', 'polarStar', 'emerald'];
export const ARCHETYPE_KO = { atlas: '외교형', redDragon: '산업형', polarStar: '군사형', emerald: '성장형' };
/** config.countries가 없을 때(옛 테스트·옛 저장)의 기본 국가 */
export const DEFAULT_COUNTRIES = Object.freeze({ atlas: 'deu', redDragon: 'chn', polarStar: 'rus', emerald: 'ind' });
/** 본거지 지역의 시작 영향력. 0이면 옛 규칙(시작 영향력 없음)과 같다. 1로 올리면 지역 점수 선점 때문에 밸런스가 크게 무너진다(BALANCE_REPORT 참고) */
export const HOME_START = 0;
export const ASSET_CHOICES = 2;

/** 받침에 맞는 조사. josa('중국', '이', '가') → '중국이' */
export const josa = (w, a, b) => { const c = w.charCodeAt(w.length - 1) - 0xac00; return w + (c >= 0 && c < 11172 && c % 28 ? a : b); };
const PARTICLE = { 와: ['과', '와'], 과: ['과', '와'], 이: ['이', '가'], 가: ['이', '가'], 을: ['을', '를'], 를: ['을', '를'], 은: ['은', '는'], 는: ['은', '는'] };

/** 좌석의 국가 id (config.countries 없으면 기본값) */
export const countryIdOf = (state, f) => state.config?.countries?.[f] ?? DEFAULT_COUNTRIES[f] ?? null;
export const countryOf = (state, f, data = getData()) => indexData(data).countries?.[countryIdOf(state, f)] ?? null;
/** 화면에 보이는 좌석 이름 = 국가 이름 (국가 정보가 없는 옛 상태는 원형 이름) */
export function seatName(state, f, data) {
  const p = state.players?.[f];
  if (p?.countryName) return p.countryName;
  try { data ??= getData(); } catch { return f; }
  const ix = indexData(data);
  return ix.countries?.[countryIdOf(state, f)]?.nameKo ?? ix.factions[f]?.name ?? f;
}
/** 엔진 문장 속 좌석 id(atlas…)를 국가 이름으로 바꾸고 뒤따르는 조사를 맞춘다 */
export function localize(state, text) {
  if (typeof text !== 'string' || !state.players) return text;
  return text.replace(/(?<![\w-])(atlas|redDragon|polarStar|emerald)(?![\w-])(와|과|이|가|을|를|은|는)?/g, (m, id, p) => {
    const name = state.players[id]?.countryName;
    if (!name) return m;
    return p ? josa(name, ...PARTICLE[p]) : name;
  });
}

/** 국가 배정 검증·보정: 좌석마다 같은 원형의 국가여야 한다. given이 없으면 기본 국가 */
export function resolveCountries(data, ids, given) {
  const ix = indexData(data).countries;
  if (!ix) return null;
  const out = {};
  for (const f of ids) {
    const id = given?.[f] ?? DEFAULT_COUNTRIES[f];
    if (!ix[id]) throw new Error('알 수 없는 국가: ' + id);
    if (ix[id].archetype !== f) throw new Error(`국가 ${id}는 ${ix[id].archetype} 좌석에만 앉을 수 있음 (좌석 ${f})`);
    out[f] = id;
  }
  return out;
}

/** 시드로 정하는 무작위 배정. fixed = { 좌석: 국가 id } 는 그대로 두고 나머지 좌석을 같은 원형의 국가 중에서 뽑는다 */
export function randomCountries(data, seed, fixed = {}) {
  let rng = seedToState(`countries|${seed}`);
  const out = {};
  for (const f of ARCHETYPES) {
    if (fixed[f]) { out[f] = fixed[f]; continue; }
    const r = shuffle(rng, data.countries.filter((c) => c.archetype === f)); rng = r.rng;
    out[f] = r.array[0].id;
  }
  return out;
}

/** 이 좌석의 전략 자산 선택지 수 */
export const assetChoicesOf = (country) => (country?.trait.effect.type === 'assetChoices' ? country.trait.effect.amount : ASSET_CHOICES);

// 시작 시점에 적용하는 특성 (나머지 — 수입·할인·라운드 첫 영향력 — 은 p.trait을 income.js·market.js·effects.js가 읽는다)
const START = {
  startPrestige: (s, f, e) => { s.players[f].prestige += e.amount; },
  startResource: (s, f, e) => { s.players[f].resources[e.res] += e.amount; },
  openingHand: (s, f, e) => { const m = (s.players[f].roundModifiers ||= {}); m.handSize = (m.handSize || 0) + e.amount; },
  modifier: (s, f, e) => { const m = s.players[f].modifiers; m[e.key] = (m[e.key] || 0) + e.value; },
};

/** 국가를 좌석에 적용 (createGame에서만 호출, s는 새 상태) */
export function applyCountry(s, f, c, data) {
  const p = s.players[f], e = c.trait.effect;
  Object.assign(p, { country: c.id, countryName: c.nameKo, iso: c.iso, home: c.homeRegion, trait: { ...e } });
  s.regions[c.homeRegion].influence[f] += HOME_START;
  START[e.type]?.(s, f, e, c, data);
}
