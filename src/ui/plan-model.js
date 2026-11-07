// 계획 단계 모델: 어떤 카드가 지역을 정해야 하는지, 고를 수 있는 지역, 확정을 막는 이유. DOM 없음 (node 테스트 가능).
import { previewChips } from './effect-text.js';

export const NEED_REGION_TAG = '지역 선택 필요';
export const BLOCK_REASON = '지역을 정하지 않은 카드가 있어요';
const TYPES = ['influence', 'removeInfluence', 'defense', 'base'];

/** 카드의 첫 지역 효과 (조건부 효과 안쪽 포함). 없으면 null */
function firstRegionEffect(effects = []) {
  for (const e of effects) {
    if (TYPES.includes(e.type) && !(e.type === 'defense' && e.scope === 'allOwned')) return e;
    if (e.type === 'conditional') { const x = firstRegionEffect(e.then); if (x) return x; }
  }
  return null;
}

/** 지금 상태에서 이 카드를 낼 때 해결 단계에서 고르게 될 지역 후보 (엔진 effects.js와 같은 규칙) */
export function regionOptions(card, state, faction) {
  const e = firstRegionEffect(card.effects);
  if (!e) return [];
  const ids = Object.keys(state.regions), R = state.regions, foes = Object.keys(state.players).filter((o) => o !== faction);
  let out;
  if (e.type === 'influence') out = ids.filter((r) => e.filter !== 'owned' || R[r].influence[faction] > 0);
  else if (e.type === 'removeInfluence') out = ids.filter((r) => (e.from === 'leader' ? Object.values(R[r].influence).some((v) => v > 0) : foes.some((o) => R[r].influence[o] > 0)));
  else out = ids;
  if ((card.effects || []).some((x) => x.filter === 'owned')) { const mine = out.filter((r) => R[r].influence[faction] > 0); if (mine.length) out = mine; }
  return out;
}

/** 이 카드는 계획 때 지역을 정해야 하는가 (고를 곳이 하나라도 있을 때만) */
export const needsRegion = (card, state, faction) => previewChips(card, state, faction).some((c) => c.text === NEED_REGION_TAG) && regionOptions(card, state, faction).length > 0;

/** 계획 칸 내용 [{ card, region }] 중 지역이 필요한데 정해지지 않았거나 더는 고를 수 없는 것 */
export function missingRegions(slots, state, faction) {
  return slots.filter(({ card, region }) => needsRegion(card, state, faction) && !(region && regionOptions(card, state, faction).includes(region)));
}
/** 확정을 막는 이유 (없으면 null) */
export const blockReason = (slots, state, faction) => (missingRegions(slots, state, faction).length ? BLOCK_REASON : null);
/** 비어 있는 첫 계획 칸 번호 (모두 찼으면 -1) */
export const firstFreeSlot = (plan, slotCount) => (plan.length < slotCount ? plan.length : -1);
/** 지역 선택 문구용: 첫 지역 효과의 종류 (influence 등) */
export const regionEffectType = (card) => firstRegionEffect(card.effects)?.type ?? null;
