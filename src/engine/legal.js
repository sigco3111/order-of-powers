// 합법 수 열거와 대기 세력 계산 (AI와 UI 공용).
import { nextInt, seedToState } from './rng.js';
import { countBy, indexData } from './util.js';
import { planSlotsOf } from './state.js';
import { buyable, cardCost } from './market.js';
import { getData } from './data.js';

export const PLAN_CAP = 200;

export const phaseOf = (state) => state.phase;

/** 지금 입력해야 하는 세력들. 선택 대기가 있으면 그 세력 하나만 */
export function waitingFor(state) {
  if (state.pending?.length) return [state.pending[0].faction];
  const ids = state.turnOrder;
  switch (state.phase) {
    case 'setup': return ids.filter((f) => !state.players[f].strategicAsset);
    case 'plan': return ids.filter((f) => !state.flow?.submitted?.[f]);
    case 'shop': return ids.filter((f) => !state.flow?.done?.[f]);
    default: return [];
  }
}

/** 손패에서 계획 카드 순서열 열거. 합계가 cap을 넘으면 시드 RNG로 표본 추출 (빈 계획은 항상 포함) */
export function planCombos(state, faction, cap = PLAN_CAP) {
  const hand = state.players[faction].hand, max = Math.min(planSlotsOf(state, faction), hand.length);
  const left = countBy(hand), ids = Object.keys(left), out = [[]];
  let over = false;
  const dfs = (seq) => {
    if (over || seq.length >= max) return;
    for (const id of ids) {
      if (!left[id]) continue;
      left[id]--; seq.push(id);
      if (out.length >= cap) over = true; else out.push(seq.slice());
      dfs(seq);
      seq.pop(); left[id]++;
      if (over) return;
    }
  };
  dfs([]);
  if (!over) return out;
  // 표본: 길이를 1..max에서 고르게 뽑고 손패를 섞어 앞에서 자른다
  let rng = seedToState(`${state.rng}|${faction}|${state.round}|plan`);
  const draw = (n) => { const r = nextInt(rng, n); rng = r.rng; return r.value; };
  const seen = new Set(['']), res = [[]];
  for (let tries = 0; res.length < cap && tries < cap * 20; tries++) {
    const pool = hand.slice(), len = 1 + draw(max), seq = [];
    for (let i = 0; i < len; i++) seq.push(pool.splice(draw(pool.length), 1)[0]);
    const key = seq.join('|');
    if (!seen.has(key)) { seen.add(key); res.push(seq); }
  }
  return res;
}

const pairs = (a) => a.flatMap((x, i) => a.slice(i + 1).map((y) => [x, y]));

export function legalActions(state, faction, data = getData()) {
  if (!waitingFor(state).includes(faction)) return [];
  const p = state.players[faction], A = (type, o = {}) => ({ type, faction, ...o });
  if (state.pending?.length) {
    const pc = state.pending[0];
    const opts = pc.kind === 'regionPair' ? pairs(pc.options) : pc.options;
    return opts.map((choice) => A('CHOOSE', { pendingId: pc.id, choice }));
  }
  switch (state.phase) {
    case 'setup': return p.assetOptions.map((assetId) => A('PICK_ASSET', { assetId }));
    case 'plan': {
      const acts = planCombos(state, faction).map((cards) => A('PLAN', { cards }));
      if (p.strategicAsset && !p.usedAsset) acts.push(A('USE_ASSET'));
      return acts;
    }
    case 'shop': {
      const ix = indexData(data);
      const buys = buyable(state, faction).filter((c) => !(ix.growth[c] && p.growth.includes(c))
        && cardCost(state, data, faction, c) <= p.resources.capital).map((cardId) => A('BUY', { cardId }));
      return [...buys, A('END_SHOP')];
    }
    default: return [];
  }
}
