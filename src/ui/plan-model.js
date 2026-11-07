// 계획 단계 모델: 어떤 카드가 지역을 정해야 하는지, 고를 수 있는 지역, 확정을 막는 이유. DOM 없음 (node 테스트 가능).
import { previewChips } from './effect-text.js';
import { opponents } from '../engine/effects.js';
import { hasTreaty } from '../engine/score.js';

export const NEED_REGION_TAG = '지역 선택 필요';
export const BLOCK_REASON = '지역을 정하지 않은 카드가 있어요';
export const BLOCK_TARGET = '대상을 정하지 않은 카드가 있어요';
export const NEED_TARGET_TAG = '대상 선택 필요';
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
export const blockReason = (slots, state, faction) => (missingRegions(slots, state, faction).length ? BLOCK_REASON : missingChoices(slots, state, faction).length ? BLOCK_TARGET : null);
/** 비어 있는 첫 계획 칸 번호 (모두 찼으면 -1) */
export const firstFreeSlot = (plan, slotCount) => (plan.length < slotCount ? plan.length : -1);
/** 지역 선택 문구용: 첫 지역 효과의 종류 (influence 등) */
export const regionEffectType = (card) => firstRegionEffect(card.effects)?.type ?? null;

// ── 계획 때 미리 고르는 선택 (지역 · 지역 두 곳 · 대상 세력). 해결 때 같은 순서로 자동 응답한다 ──
const TARGET_FX = (e) => e.type === 'treaty' || e.type === 'drain' || e.type === 'destroyBase' || (e.type === 'peek' && e.what !== 'eventDeck') || (e.type === 'discard' && e.who !== 'self') || (e.type === 'custom' && e.id === 'dip-15');
const isPair = (card) => (card.effects || []).some((e) => e.type === 'custom' && e.id === 'dip-14');
/** 대상 세력 단계: 후보가 둘 이상일 때만 (하나뿐이면 엔진이 묻지 않는다) */
function factionStep(card, state, faction) {
  const e = (card.effects || []).find(TARGET_FX);
  if (!e) return null;
  const foes = opponents(state, faction);
  const options = e.type === 'treaty' ? foes.filter((o) => !hasTreaty(state, faction, o))
    : e.type === 'destroyBase' ? foes.filter((o) => Object.values(state.regions).some((r) => r.bases[o] > 0)) : foes;
  return options.length > 1 ? { kind: 'faction', options, fx: e.type === 'custom' ? 'custom' : e.type } : null;
}
/** 카드를 계획에 넣을 때 순서대로 물을 단계 [{ kind: 'region'|'regionPair'|'faction', options, fx }] */
export function planSteps(card, state, faction) {
  const out = [];
  if (needsRegion(card, state, faction)) out.push({ kind: 'region', options: regionOptions(card, state, faction), fx: regionEffectType(card) });
  if (isPair(card)) out.push({ kind: 'regionPair', options: Object.keys(state.regions), fx: 'influence' });
  const f = factionStep(card, state, faction);
  if (f) out.push(f);
  return out;
}
const KEY = { region: 'region', regionPair: 'pair', faction: 'target' };
const valid = (st, v) => (st.kind === 'regionPair' ? Array.isArray(v) && v.length === 2 && v[0] !== v[1] && v.every((x) => st.options.includes(x)) : st.options.includes(v));
/** 단계가 이미 채워졌는가 (picks: { region, pair, target }) */
export const stepDone = (st, picks = {}) => valid(st, picks[KEY[st.kind]]);
/** 아직 정하지 않은(또는 더는 고를 수 없는) 단계가 있는 계획 칸 [{ card, region, pair, target }] */
export function missingChoices(slots, state, faction) {
  return slots.filter(({ card, ...picks }) => planSteps(card, state, faction).some((st) => !stepDone(st, picks)));
}
/** 계획 칸 → 해결 때 쓸 미리 고른 값 { [cardId]: [{ kind, v }] } (카드가 같으면 계획 순서대로) */
export function prePicks(slots, state, faction) {
  const out = {};
  for (const { card, ...picks } of slots) for (const st of planSteps(card, state, faction)) if (stepDone(st, picks)) (out[card.id] ||= []).push({ kind: st.kind, v: picks[KEY[st.kind]] });
  return out;
}
const STAGE = { region: 'region', regionPair: 'pair', faction: 'target' };
const findPre = (pre, pc) => (STAGE[pc?.kind] === pc?.stage ? (pre?.[pc?.ctx?.cardId] || []).findIndex((e) => e.kind === pc.kind) : -1);
/** 대기 선택(pc)에 미리 고른 값이 있는가 (있으면 'ok' 또는 '못씀'(더는 고를 수 없음), 없으면 null) */
export function preState(pre, pc) {
  const i = findPre(pre, pc);
  if (i < 0) return null;
  const v = pre[pc.ctx.cardId][i].v;
  return pc.kind === 'regionPair' ? (valid({ kind: 'regionPair', options: pc.options }, v) ? 'ok' : 'stale') : pc.options.includes(v) ? 'ok' : 'stale';
}
/** 미리 고른 값을 꺼낸다 (한 번만 쓰이며 저장에도 반영된다). 없으면 undefined */
export function takePre(pre, pc) {
  const i = findPre(pre, pc);
  if (i < 0) return undefined;
  const st = preState(pre, pc), [e] = pre[pc.ctx.cardId].splice(i, 1);
  return st === 'ok' ? e.v : undefined;
}
