import { seedToState, shuffle } from './rng.js';
import { deepClone, countBy, indexData } from './util.js';
import { resolveCountries, applyCountry, assetChoicesOf } from './countries.js';

export const RULES = Object.freeze({
  factions: 4, handSize: 5, planSlots: 3, marketSlots: 6, maxInfluence: 6,
  startResources: { capital: 4, energy: 2, industry: 2 }, startPrestige: 0,
  assetsDealt: 2, goalsDealt: 2, firstPurchaseCards: 2,
});
export const RESOURCES = ['capital', 'energy', 'industry'];

const newStats = () => ({
  cardsPlayed: { domestic: 0, diplomatic: 0, military: 0 },
  influenceRemoved: 0, influenceLost: 0, treatiesMade: 0, sanctionsReceived: 0,
  maxInfluenceEver: 0, influenceGainedByRound: {},
});

const expand = (list) => list.flatMap((e) => Array(e.count).fill(e.cardId));

/** 새 게임 상태. data = { cards, events, assets, goals, growth, factions, regions } (IO 없음) */
export function createGame({ data, rounds = 8, factions, humanFaction = null, seed = 1, tutorial = false, aiLevel = 'normal', mode = 'single', countries = null, seatLevels = null }) {
  const ix = indexData(data);
  const ids = factions || data.factions.map((f) => f.id);
  if (ids.length !== RULES.factions || new Set(ids).size !== ids.length) throw new Error('세력은 서로 다른 4개여야 한다');
  for (const f of ids) if (!ix.factions[f]) throw new Error('알 수 없는 세력: ' + f);
  if (humanFaction != null && !ids.includes(humanFaction)) throw new Error('humanFaction이 참가 세력이 아님');
  if (!(tutorial ? Number.isInteger(rounds) && rounds >= 2 : [6, 8, 10].includes(rounds))) throw new Error('라운드 수 오류: ' + rounds);

  const cmap = resolveCountries(data, ids, countries), cx = indexData(data).countries;
  let rng = seedToState(seed);
  const sh = (a) => { const r = shuffle(rng, a); rng = r.rng; return r.array; };

  // 이벤트 덱: 일반 이벤트에서 rounds-1장 + 이벤트 20(마지막 라운드 직전 라운드에 고정)
  const normal = data.events.filter((e) => !e.onlyBeforeFinalRound).map((e) => e.id);
  const special = data.events.filter((e) => e.onlyBeforeFinalRound).map((e) => e.id);
  const eventDeck = sh(normal).slice(0, rounds - special.length);
  special.forEach((id) => eventDeck.splice(rounds - 2, 0, id));

  const marketAll = sh(data.cards.filter((c) => c.deck === 'market').map((c) => c.id));
  const slots = marketAll.splice(0, RULES.marketSlots);

  const assetPool = sh(data.assets.map((a) => a.id));
  const goalPool = sh(data.goals.map((g) => g.id));

  const players = {};
  let assetAt = 0;
  ids.forEach((f) => {
    const fd = ix.factions[f];
    const start = tutorial
      ? data.cards.filter((c) => c.deck === 'starter' && c.tutorialCount).flatMap((c) => Array(c.tutorialCount).fill(c.id))
      : expand(fd.startingDeck);
    players[f] = {
      resources: { ...RULES.startResources }, prestige: RULES.startPrestige, regionScore: 0,
      hand: [], deck: sh(start), discard: [], played: [], plan: [],
      collection: countBy(start), growth: [], modifiers: {}, purchases: 0,
      firstPurchase: fd.uniqueCardIds.slice(0, RULES.firstPurchaseCards),
      assetOptions: assetPool.slice(assetAt, assetAt += assetChoicesOf(cx?.[cmap?.[f]])),
      strategicAsset: null, usedAsset: false,
      secretGoals: goalPool.slice(ids.indexOf(f) * RULES.goalsDealt, (ids.indexOf(f) + 1) * RULES.goalsDealt),
      stats: newStats(),
    };
  });

  // 난이도 보정: 컴퓨터 자리에만, 공개된 표(src/data/difficulty.json)대로. 사람 자리·튜토리얼은 없음.
  const difficulty = {};
  if (!tutorial) for (const f of ids) {
    const inc = f === humanFaction ? [] : data.difficulty?.[seatLevels?.[f] ?? aiLevel]?.income || [];
    if (inc.length) difficulty[f] = deepClone(inc);
  }

  const zero = () => Object.fromEntries(ids.map((f) => [f, 0]));
  const regions = Object.fromEntries(data.regions.map((r) => [r.id, {
    influence: zero(), bases: zero(), defense: zero(),
    scoreValue: r.scoreValue, scoreBonus: r.scoreBonus || 0, produces: r.produces?.resource ?? null,
  }]));

  const state = {
    version: 1, seed, rng,
    config: { rounds, aiLevel, mode, tutorial: !!tutorial, humanFaction, ...(cmap && { countries: cmap }), ...(Object.keys(difficulty).length && { difficulty }), ...(!tutorial && data.roundModes?.[rounds] && { roundMode: deepClone(data.roundModes[rounds]) }) },
    round: 1, phase: 'setup', turnOrder: ids.slice(),
    eventDeck, eventDiscard: [], currentEvent: null,
    modifiers: { round: {}, game: {} },
    market: { slots, deck: marketAll, growth: data.growth.map((g) => g.id) },
    regions, treaties: [], players, log: [],
  };
  if (cmap) for (const f of ids) applyCountry(state, f, cx[cmap[f]], data);
  return state;
}

/** 이번 라운드 해결 순서: 시작 인덱스 = (round-1) mod n */
export function resolveOrder(state) {
  const o = state.turnOrder, s = (state.round - 1) % o.length;
  return o.slice(s).concat(o.slice(0, s));
}

/** 수정치 합 (세력 성장 + 세력 라운드 + 게임 + 라운드). faction이 null이면 전역만 */
export function getMod(state, faction, key) {
  const p = state.players[faction];
  return (p?.modifiers[key] || 0) + (p?.roundModifiers?.[key] || 0) + (state.modifiers.game[key] || 0) + (state.modifiers.round[key] || 0);
}
export const handSizeOf = (s, f) => RULES.handSize + getMod(s, f, 'handSize');
export const planSlotsOf = (s, f) => RULES.planSlots + getMod(s, f, 'planSlots');

/** 카드 n장 뽑기 (덱이 비면 버린 더미를 섞어 보충). 새 상태 반환 */
export function drawCards(state, faction, n) {
  const s = deepClone(state), p = s.players[faction];
  if (!p) throw new Error('알 수 없는 세력: ' + faction);
  for (let i = 0; i < n; i++) {
    if (!p.deck.length && p.discard.length) {
      const r = shuffle(s.rng, p.discard);
      p.deck = r.array; p.discard = []; s.rng = r.rng;
    }
    if (!p.deck.length) break;
    p.hand.push(p.deck.shift());
  }
  return s;
}

/** 계획 단계 시작: 손패 한도까지 뽑기 */
export const drawToHandSize = (state, faction) =>
  drawCards(state, faction, Math.max(0, handSizeOf(state, faction) - state.players[faction].hand.length));

export function pickAsset(state, faction, assetId) {
  const p = state.players[faction];
  if (!p || p.strategicAsset || !p.assetOptions.includes(assetId)) return { ok: false, reason: 'invalid-asset', state };
  const s = deepClone(state);
  s.players[faction].strategicAsset = assetId;
  return { ok: true, state: s };
}

const fail = (m) => { throw new Error('불변식 위반: ' + m); };
const sameCounts = (a, b) => JSON.stringify(Object.entries(a).filter(([, n]) => n).sort()) === JSON.stringify(Object.entries(b).filter(([, n]) => n).sort());

/** 불변식 검사 (위반 시 throw, 정상이면 true) */
export function validateInvariants(state) {
  const marketOwned = {};
  for (const [f, p] of Object.entries(state.players)) {
    for (const r of RESOURCES) if (!Number.isFinite(p.resources[r]) || p.resources[r] < 0) fail(`${f} 자원 ${r}=${p.resources[r]}`);
    if (!Number.isFinite(p.prestige)) fail(`${f} 위신=${p.prestige}`);
    if (!Number.isFinite(p.regionScore)) fail(`${f} regionScore=${p.regionScore}`);
    const all = [...p.deck, ...p.hand, ...p.discard, ...p.played];
    if (!sameCounts(countBy(all), p.collection)) fail(`${f} 카드 중복/누락 (덱+손패+버림+사용 ≠ 소유 목록)`);
    const hc = countBy(p.hand);
    for (const [c, n] of Object.entries(countBy(p.plan))) if ((hc[c] || 0) < n) fail(`${f} 계획 카드가 손패에 없음: ${c}`);
    if (new Set(p.growth).size !== p.growth.length) fail(`${f} 성장 카드 중복`);
    for (const c of p.firstPurchase) if (p.collection[c]) fail(`${f} 첫 구매 카드가 이미 덱에 있음: ${c}`);
    for (const [c, n] of Object.entries(p.collection)) marketOwned[c] = (marketOwned[c] || 0) + n;
  }
  for (const [rid, r] of Object.entries(state.regions)) {
    for (const [f, n] of Object.entries(r.influence)) {
      if (!Number.isInteger(n) || n < 0 || n > RULES.maxInfluence) fail(`${rid}.${f} 영향력=${n}`);
    }
    for (const k of ['bases', 'defense']) for (const [f, n] of Object.entries(r[k])) if (!Number.isFinite(n) || n < 0) fail(`${rid}.${k}.${f}=${n}`);
  }
  const inMarket = [...state.market.slots, ...state.market.deck];
  if (new Set(inMarket).size !== inMarket.length) fail('시장 카드 중복');
  for (const c of inMarket) if (marketOwned[c]) fail(`시장 카드가 덱에도 있음: ${c}`);
  return true;
}
