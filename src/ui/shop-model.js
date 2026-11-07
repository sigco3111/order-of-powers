// 상점 화면의 순수 계산: 가격·구매 가능 여부·비용 수정 표시·덱 요약 (DOM 없음)
import { cardCost } from '../engine/market.js';
import { indexData } from '../engine/util.js';

export const CAT_LABEL = { domestic: '내정', diplomatic: '외교', military: '군사', economy: '경제' };
const KIND_ORDER = ['market', 'first', 'growth'];
export const KIND_LABEL = { market: '시장', first: '첫 구매(고유)', growth: '성장' };

/** 가격 수정 문구: −1 → "할인 −1", +2 → "인상 +2", 0 → null */
export const costNote = (delta) => (delta < 0 ? `할인 −${-delta}` : delta > 0 ? `인상 +${delta}` : null);

/** 한 장의 구매 정보 */
export function shopItem(state, data, faction, id, kind) {
  const ix = indexData(data), card = ix.cards[id] || ix.growth[id], cap = state.players[faction].resources.capital;
  const cost = cardCost(state, data, faction, id), delta = cost - card.cost, short = Math.max(0, cost - cap);
  return { id, kind, card, base: card.cost, cost, delta, note: costNote(delta), afford: short === 0, short, reason: short ? `자본 부족 (−${short})` : null };
}

/** { capital, market[], first[], growth[] } — 사람이 상점에서 보는 전부 */
export function shopView(state, data, faction) {
  const p = state.players[faction], row = (k) => (id) => shopItem(state, data, faction, id, k);
  return {
    capital: p.resources.capital,
    market: state.market.slots.map(row('market')),
    first: p.firstPurchase.map(row('first')),
    growth: state.market.growth.filter((g) => !p.growth.includes(g)).map(row('growth')),
  };
}

/** 덱 요약: 덱 N장 · 손패 · 버린 더미 · 성장 카드 이름, 분류별 구성 목록(내 나라 자료) */
export function deckSummary(state, data, faction) {
  const ix = indexData(data), p = state.players[faction], groups = {};
  for (const [id, n] of Object.entries(p.collection)) {
    const c = ix.cards[id]; if (!c || !n) continue;
    (groups[c.category] ??= []).push({ id, name: c.name, n, cost: c.cost });
  }
  const order = Object.keys(CAT_LABEL).filter((k) => groups[k]);
  return {
    deck: p.deck.length, hand: p.hand.length, discard: p.discard.length, played: p.played.length,
    total: Object.values(p.collection).reduce((a, n) => a + n, 0),
    growth: p.growth.map((g) => ix.growth[g]?.name ?? g),
    groups: order.map((k) => ({ cat: k, label: CAT_LABEL[k], count: groups[k].reduce((a, x) => a + x.n, 0), items: groups[k].sort((a, b) => a.name.localeCompare(b.name, 'ko')) })),
  };
}

/** 이번 라운드 다른 세력의 구매 기록 [{faction, text}] — state.log 기준 ("구매: 이름 (💰 −N)") */
export function rivalBuys(state, faction, nameOf = (f) => f) {
  return state.log.filter((e) => e.round === state.round && e.phase === 'shop' && e.actor !== faction && e.actor !== 'system' && /^구매:/.test(e.text))
    .map((e) => ({ faction: e.actor, text: `${nameOf(e.actor)}: ${e.text.replace(/^구매:\s*/, '').replace(/\s*\(💰\s*−(\d+)\)/, ' (자본 −$1)')}` }));
}
export { KIND_ORDER };
