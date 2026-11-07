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

/** 지역을 정하는 효과. 전략 폭격기(mil-12)는 커스텀이지만 해결 때 '상대 영향력 줄이기'를 끼워 넣으므로 같은 규칙으로 본다 */
const MIL12 = { type: 'removeInfluence', from: 'other' };
const regionFx = (card) => firstRegionEffect(card.effects) ?? ((card.effects || []).some((e) => e.type === 'custom' && e.id === 'mil-12') ? MIL12 : null);

/** 지금 상태에서 이 카드를 낼 때 해결 단계에서 고르게 될 지역 후보 (엔진 effects.js와 같은 규칙) */
export function regionOptions(card, state, faction) {
  const e = regionFx(card);
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
export const needsRegion = (card, state, faction) => (previewChips(card, state, faction).some((c) => c.text === NEED_REGION_TAG) || regionFx(card) === MIL12) && regionOptions(card, state, faction).length > 0;

/** 계획 칸 내용 [{ card, region }] 중 지역이 필요한데 정해지지 않았거나 더는 고를 수 없는 것 */
export function missingRegions(slots, state, faction) {
  return slots.filter((slot) => { const { card, ...picks } = slot; return stepsOf(slot, slots, state, faction).some((st) => st.key === 'region' && !stepDone(st, picks)); });
}
/** 확정을 막는 이유 (없으면 null) */
export const blockReason = (slots, state, faction) => (missingRegions(slots, state, faction).length ? BLOCK_REASON : missingChoices(slots, state, faction).length ? BLOCK_TARGET : null);
/** 비어 있는 첫 계획 칸 번호 (모두 찼으면 -1) */
export const firstFreeSlot = (plan, slotCount) => (plan.length < slotCount ? plan.length : -1);
/** 지역 선택 문구용: 첫 지역 효과의 종류 (influence 등) */
export const regionEffectType = (card) => regionFx(card)?.type ?? null;

// ── 계획 때 미리 고르는 선택. 해결 때 같은 순서로 자동 응답한다 ──
// 단계 = { kind(엔진 선택 종류), key(picks 이름), stage(엔진 단계), options, fx }.
//  지역(region) · 지역 두 곳(pair) · 대상 세력(target) · 피해 세력(victim, 고른 지역에 상대가 둘 이상일 때) ·
//  기지 지역(baseRegion, 고른 세력의 기지가 두 곳 이상일 때) · 추가 지불(pay) · 버릴 카드(drop) · 무시할 지역(ignore)
const TARGET_FX = (e) => e.type === 'treaty' || e.type === 'drain' || e.type === 'destroyBase' || (e.type === 'peek' && e.what !== 'eventDeck') || (e.type === 'discard' && e.who !== 'self') || (e.type === 'custom' && e.id === 'dip-15');
const isPair = (card) => (card.effects || []).some((e) => e.type === 'custom' && e.id === 'dip-14');
const uniq = (a) => [...new Set(a)];
const count = (a, x) => a.filter((y) => y === x).length;
/** 대상 세력 단계: 후보가 둘 이상일 때만 (하나뿐이면 엔진이 묻지 않는다). sole = 후보가 하나뿐일 때 그 세력 */
function factionStep(card, state, faction) {
  const e = (card.effects || []).find(TARGET_FX);
  if (!e) return { step: null, sole: null, e: null };
  const foes = opponents(state, faction);
  const options = e.type === 'treaty' ? foes.filter((o) => !hasTreaty(state, faction, o))
    : e.type === 'destroyBase' ? foes.filter((o) => Object.values(state.regions).some((r) => r.bases[o] > 0)) : foes;
  return { step: options.length > 1 ? { kind: 'faction', key: 'target', stage: 'target', options, fx: e.type === 'custom' ? 'custom' : e.type } : null, sole: options.length === 1 ? options[0] : null, e };
}
const valid = (st, v) => (st.kind === 'regionPair' ? Array.isArray(v) && v.length === 2 && v[0] !== v[1] && v.every((x) => st.options.includes(x)) : st.options.includes(v));
const inOpts = (st, v) => v != null && valid(st, v);
/** 카드를 계획에 넣을 때 순서대로 물을 단계. picks = 지금까지 고른 값(뒤 단계의 후보가 앞 선택에 달려 있다), planned = 계획에 든 카드 id들(버릴 카드 후보에서 뺀다) */
export function planSteps(card, state, faction, picks = {}, planned = []) {
  const out = [], fx = card.effects || [], R = state.regions, foes = opponents(state, faction), inPlan = planned.length ? planned : [card.id];
  const pay = fx.find((e) => e.type === 'conditional' && e.if?.payOptional);
  if (pay) out.push({ kind: 'confirm', key: 'pay', stage: 'confirm', options: [true, false], fx: 'pay', pay: pay.if.payOptional });
  let rs = null;
  if (picks.pay !== false && needsRegion(card, state, faction)) { rs = { kind: 'region', key: 'region', stage: 'region', options: regionOptions(card, state, faction), fx: regionEffectType(card) }; out.push(rs); }
  const rf = regionFx(card);
  if (rs && rf?.type === 'removeInfluence' && rf.from !== 'leader' && inOpts(rs, picks.region)) { // 고른 지역에 상대가 둘 이상이면 누구의 영향력을 줄일지 (엔진: stage 'victim')
    const victims = foes.filter((o) => R[picks.region].influence[o] > 0);
    if (victims.length > 1) out.push({ kind: 'faction', key: 'victim', stage: 'victim', options: victims, fx: 'removeInfluence' });
  }
  if (isPair(card)) out.push({ kind: 'regionPair', key: 'pair', stage: 'pair', options: Object.keys(R), fx: 'influence' });
  const f = factionStep(card, state, faction);
  if (f.step) out.push(f.step);
  if (f.e?.type === 'destroyBase') { // 고른(또는 하나뿐인) 세력의 기지가 두 곳 이상이면 어느 지역의 기지인지
    const v = f.step ? (inOpts(f.step, picks.target) ? picks.target : null) : f.sole;
    const rids = v ? Object.keys(R).filter((r) => R[r].bases[v] > 0) : [];
    if (rids.length > 1) out.push({ kind: 'region', key: 'baseRegion', stage: 'baseRegion', options: rids, fx: 'destroyBase' });
  }
  if (fx.some((e) => e.type === 'discard' && e.who === 'self')) { // 버릴 손패: 계획에 넣은 카드는 뺀다
    const hand = state.players[faction].hand, options = uniq(hand).filter((c) => count(hand, c) > count(inPlan, c));
    if (options.length > 1) out.push({ kind: 'card', key: 'drop', stage: 'card', options, fx: 'discard' });
  }
  if (fx.some((e) => e.type === 'modifier' && e.key === 'ignoreEventEffectInRegion')) { // 이번 라운드 사건으로 잃은 영향력이 있는 지역이 둘 이상일 때
    const options = uniq((state.eventLosses || []).filter((l) => l.f === faction).map((l) => l.region));
    if (options.length > 1) out.push({ kind: 'region', key: 'ignore', stage: 'ignore', options, fx: 'ignoreEvent' });
  }
  return out;
}
/** 단계가 이미 채워졌는가 (picks: { region, pair, target, victim, baseRegion, pay, drop, ignore }) */
export const stepDone = (st, picks = {}) => (st.kind === 'confirm' ? typeof picks[st.key] === 'boolean' : valid(st, picks[st.key]));
const stepsOf = (slot, slots, state, faction) => { const { card, ...picks } = slot; return planSteps(card, state, faction, picks, slots.map((x) => x.card.id)); };
/** 아직 정하지 않은(또는 더는 고를 수 없는) 단계가 있는 계획 칸 [{ card, region, pair, target, ... }] */
export function missingChoices(slots, state, faction) {
  return slots.filter((slot) => { const { card, ...picks } = slot; return stepsOf(slot, slots, state, faction).some((st) => !stepDone(st, picks)); });
}
const DEFAULT_STAGE = { region: 'region', regionPair: 'pair', faction: 'target', confirm: 'confirm', card: 'card' };
/** 계획 칸 → 해결 때 쓸 미리 고른 값 { [cardId]: [{ kind, v, stage? }] } (카드가 같으면 계획 순서대로). stage는 기본과 다를 때만 적는다 */
export function prePicks(slots, state, faction) {
  const out = {};
  for (const slot of slots) {
    const { card, ...picks } = slot;
    for (const st of stepsOf(slot, slots, state, faction)) if (stepDone(st, picks)) (out[card.id] ||= []).push({ kind: st.kind, ...(st.stage === DEFAULT_STAGE[st.kind] ? {} : { stage: st.stage }), v: picks[st.key] });
  }
  return out;
}
const findPre = (pre, pc) => (pre?.[pc?.ctx?.cardId] || []).findIndex((e) => e.kind === pc.kind && (e.stage ?? DEFAULT_STAGE[e.kind]) === pc.stage);
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
