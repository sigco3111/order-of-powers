import { deepClone, indexData } from './util.js';
import { getMod } from './state.js';

export const marketSize = (state) => 6 + getMod(state, null, 'shop.extraSlots');

/** 빈 슬롯을 시장 덱에서 채운다. 새 상태 반환 */
export function refill(state) {
  const s = deepClone(state), m = s.market;
  while (m.slots.length < marketSize(s) && m.deck.length) m.slots.push(m.deck.shift());
  return s;
}

/** 구매 비용 = 기본비용 + shop.costDelta − (첫 구매면 shop.firstPurchaseDiscount), 최소 1 */
export function cardCost(state, data, faction, id) {
  const ix = indexData(data), base = (ix.cards[id] || ix.growth[id]).cost, p = state.players[faction];
  const disc = (p.purchases === 0 ? getMod(state, faction, 'shop.firstPurchaseDiscount') : 0)
    + (p.trait?.type === 'firstBuyDiscount' && !p.roundBuys ? p.trait.amount : 0); // 국가 특성: 라운드 첫 구매 할인
  return Math.max(1, base + getMod(state, faction, 'shop.costDelta') - disc);
}

/** 구매 가능한 id 목록: 공개 시장 + 내 첫 구매 슬롯 + 내가 안 가진 성장 카드 */
export function buyable(state, faction) {
  const p = state.players[faction];
  return [...state.market.slots, ...p.firstPurchase, ...state.market.growth.filter((g) => !p.growth.includes(g))];
}

/** 구매. 성공 { ok:true, state, cost }, 실패 { ok:false, reason, state(원본) } — 자본으로만 지불 */
export function buy(state, data, faction, id) {
  const ix = indexData(data), p = state.players[faction];
  if (!p) return { ok: false, reason: 'unknown-faction', state };
  const isGrowth = !!ix.growth[id];
  if (isGrowth && p.growth.includes(id)) return { ok: false, reason: 'growth-owned', state };
  if (!buyable(state, faction).includes(id)) return { ok: false, reason: 'not-available', state };
  const cost = cardCost(state, data, faction, id);
  if (p.resources.capital < cost) return { ok: false, reason: 'insufficient-capital', state };

  let s = deepClone(state);
  const q = s.players[faction];
  q.resources.capital -= cost;
  q.purchases += 1;
  q.roundBuys = (q.roundBuys || 0) + 1;
  if (isGrowth) {
    q.growth.push(id);
    for (const e of ix.growth[id].effects) if (e.type === 'modifier') q.modifiers[e.key] = (q.modifiers[e.key] || 0) + e.value;
  } else {
    const fp = q.firstPurchase.indexOf(id), ms = s.market.slots.indexOf(id);
    if (fp >= 0) q.firstPurchase.splice(fp, 1); else s.market.slots.splice(ms, 1);
    q.discard.push(id);
    q.collection[id] = (q.collection[id] || 0) + 1;
    if (fp < 0) s = refill(s);
  }
  return { ok: true, state: s, cost };
}
