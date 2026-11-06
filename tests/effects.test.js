import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hashState, deepClone } from '../src/engine/util.js';
import { createGame, validateInvariants, getMod } from '../src/engine/state.js';
import { regionLeaders } from '../src/engine/score.js';
import {
  runEffects, resolveChoice, autoChoose, autoResolve, applyEvent, playCard, clearRoundEffects, getModifier, isDeferredEvent,
} from '../src/engine/effects.js';
import { CUSTOM } from '../src/engine/effects-custom.js';

const load = (n) => JSON.parse(readFileSync(new URL(`../src/data/${n}.json`, import.meta.url), 'utf8'));
const data = {
  cards: load('cards'), events: load('events'), assets: load('strategic-assets'), goals: load('secret-goals'),
  growth: load('growth-cards'), factions: load('factions'), regions: load('regions'),
};
const card = (id) => data.cards.find((c) => c.id === id) || data.assets.find((c) => c.id === id) || data.events.find((c) => c.id === id);
const [A, B, C, D] = ['atlas', 'redDragon', 'polarStar', 'emerald'];
const R = data.regions.map((r) => r.id);
const mk = (o = {}) => createGame({ data, seed: 7, humanFaction: A, ...o });
const inf = (s, r, f, n) => { s.regions[r].influence[f] = n; return s; };
const run = (s, f, effects, ctx = {}) => runEffects(s, f, effects, { data, ...ctx });
const E = (type, o = {}) => ({ type, ...o });
const ev = (id) => data.events.find((e) => e.id === id);
const sum = (s, r) => Object.values(s.regions[r].influence).reduce((a, b) => a + b, 0);

test('gain: 자원은 0 아래로 내려가지 않고 위신은 음수 가능', () => {
  const s = mk();
  const r = run(s, A, [E('gain', { res: 'capital', amount: 3 }), E('gain', { res: 'energy', amount: -9 }), E('gain', { res: 'prestige', amount: -2 })]);
  assert.equal(r.state.players[A].resources.capital, 7);
  assert.equal(r.state.players[A].resources.energy, 0);
  assert.equal(r.state.players[A].prestige, -2);
  assert.equal(s.players[A].resources.capital, 4, '입력 상태는 바뀌지 않는다');
  assert.ok(r.state.log.length >= 3 && r.state.log[0].text && r.state.log[0].actor === A);
  validateInvariants(r.state);
});

test('influence + 선택 대기: pending 생성 → resolveChoice → 남은 효과 이어서 실행', () => {
  const s = mk();
  const r = run(s, A, [E('influence', { amount: 2, target: 'regionChoice', filter: 'any' }), E('gain', { res: 'industry', amount: 1 })]);
  assert.equal(r.pending.length, 1);
  const p = r.pending[0];
  assert.equal(p.kind, 'region'); assert.equal(p.faction, A); assert.deepEqual(p.options, R);
  assert.equal(p.filter, 'any'); assert.equal(p.rest.length, 1);
  assert.equal(r.state.players[A].resources.industry, 2, '선택 전에는 나머지 효과가 실행되지 않는다');
  assert.equal(r.state.pending.length, 1);
  assert.equal(resolveChoice(r.state, p.id, 'nope').ok, false);
  assert.equal(resolveChoice(r.state, 'zzz', R[0]).reason, 'no-such-pending');
  const d = resolveChoice(r.state, p.id, R[1]);
  assert.ok(d.ok);
  assert.equal(d.state.regions[R[1]].influence[A], 2);
  assert.equal(d.state.players[A].resources.industry, 3);
  assert.equal(d.state.pending.length, 0);
});

test('influence owned: 내 영향력이 있는 지역만 선택지, 없으면 효과 없음', () => {
  const s = inf(mk(), R[2], A, 1); inf(s, R[4], A, 3);
  const r = run(s, A, [E('influence', { amount: 2, target: 'regionChoice', filter: 'owned' })]);
  assert.deepEqual(r.pending[0].options, [R[2], R[4]]);
  assert.equal(run(mk(), A, [E('influence', { amount: 2, target: 'regionChoice', filter: 'owned' })]).pending.length, 0);
});

test('influence 상한 6: 초과분은 사라지고 한 지역에서 한 번만 고른 지역을 공유', () => {
  const s = inf(mk(), R[0], A, 5);
  const r = run(s, A, [E('influence', { amount: 3, target: 'regionChoice', filter: 'any' }), E('influence', { amount: 1, target: 'regionChoice', filter: 'any' })]);
  const d = resolveChoice(r.state, r.pending[0].id, R[0]);
  assert.equal(d.pending.length, 0, '같은 카드의 두 번째 regionChoice는 같은 지역');
  assert.equal(d.state.regions[R[0]].influence[A], 6);
  assert.ok(d.state.log.some((l) => l.text.includes('소실')));
  validateInvariants(d.state);
});

test('removeInfluence other: 상대가 둘이면 대상 세력 선택, 하나면 자동', () => {
  const s = inf(inf(inf(mk(), R[0], B, 3), R[0], C, 2), R[1], D, 4);
  const r = run(s, A, [E('removeInfluence', { amount: 2, target: 'regionChoice', from: 'other' })]);
  assert.deepEqual(r.pending[0].options, [R[0], R[1]]);
  const v = resolveChoice(r.state, r.pending[0].id, R[0]);
  assert.equal(v.pending[0].kind, 'faction'); assert.deepEqual(v.pending[0].options, [B, C]);
  const d = resolveChoice(v.state, v.pending[0].id, C);
  assert.equal(d.state.regions[R[0]].influence[C], 0);
  assert.equal(d.state.regions[R[0]].influence[B], 3);
  assert.equal(d.state.players[C].stats.influenceLost, 2);
  assert.equal(d.state.players[A].stats.influenceRemoved, 2);
  const one = resolveChoice(r.state, r.pending[0].id, R[1]);
  assert.equal(one.pending.length, 0); assert.equal(one.state.regions[R[1]].influence[D], 2);
});

test('removeInfluence leader: 최다 세력(동률은 모두)에서 제거', () => {
  const s = inf(inf(inf(mk(), R[0], B, 3), R[0], C, 3), R[0], D, 1);
  const r = run(s, A, [E('removeInfluence', { amount: 1, target: 'regionChoice', from: 'leader' })], { region: R[0] });
  assert.deepEqual([r.state.regions[R[0]].influence[B], r.state.regions[R[0]].influence[C], r.state.regions[R[0]].influence[D]], [2, 2, 1]);
});

test('방어 흡수: 방어 1점이 제거 1을 막고 소모된다 (region / allOwned)', () => {
  let s = inf(inf(mk(), R[0], B, 4), R[1], B, 4);
  s = run(s, B, [E('defense', { amount: 2, scope: 'region' })], { region: R[0] }).state;
  assert.equal(s.regions[R[0]].defense[B], 2);
  s = run(s, B, [E('defense', { amount: 1, scope: 'allOwned' })]).state;
  assert.deepEqual([s.regions[R[0]].defense[B], s.regions[R[1]].defense[B], s.regions[R[2]].defense[B]], [3, 1, 0]);
  const t = run(s, A, [E('removeInfluence', { amount: 5, target: 'regionChoice', from: 'other' })], { region: R[0] }).state;
  assert.equal(t.regions[R[0]].influence[B], 2, '5 중 3 흡수, 2 제거');
  assert.equal(t.regions[R[0]].defense[B], 0);
  assert.equal(t.players[B].stats.influenceLost, 2);
  const u = run(s, A, [E('removeInfluence', { amount: 1, target: 'regionChoice', from: 'other' })], { region: R[0] }).state;
  assert.equal(u.regions[R[0]].influence[B], 4, '방어가 전부 막는다');
  const c = clearRoundEffects(s);
  assert.ok(Object.values(c.regions).every((r) => Object.values(r.defense).every((n) => n === 0)));
});

test('base: 영향력 +1, 방어 +1, 지역별 기지 기록 / gr-05 보너스 / destroyBase', () => {
  let s = run(mk(), C, [E('base', { amount: 1 })], { region: R[3] }).state;
  assert.deepEqual([s.regions[R[3]].bases[C], s.regions[R[3]].influence[C], s.regions[R[3]].defense[C]], [1, 1, 1]);
  s.players[C].modifiers.baseDefenseBonus = 1;
  s = run(s, C, [E('base', { amount: 1 })], { region: R[3] }).state;
  assert.deepEqual([s.regions[R[3]].bases[C], s.regions[R[3]].influence[C], s.regions[R[3]].defense[C]], [2, 2, 3]);
  s = run(s, C, [E('base', { amount: 1 })], { region: R[5] }).state;
  const r = run(s, A, [E('destroyBase', { target: 'factionChoice' })]);
  assert.equal(r.pending.length, 1, '대상 세력이 하나뿐이면 자동, 기지가 둘 이상 지역이면 지역 선택');
  assert.deepEqual(r.pending[0].options, [R[3], R[5]]);
  assert.equal(r.pending[0].kind, 'region');
  const d = resolveChoice(r.state, r.pending[0].id, R[3]);
  assert.equal(d.state.regions[R[3]].bases[C], 1);
  assert.equal(run(mk(), A, [E('destroyBase', { target: 'factionChoice' })]).pending.length, 0);
});

test('draw / discard self(카드 선택) / discard target(가장 싼 카드 자동)', () => {
  let s = mk(); s.players[A].hand = ['dom-12', 'dom-04']; s.players[A].plan = ['dom-04'];
  s.players[B].hand = ['mil-12', 'dom-04', 'dom-07'];
  let r = run(s, A, [E('discard', { amount: 1, who: 'self' }), E('draw', { amount: 2 })]);
  assert.equal(r.pending[0].kind, 'card'); assert.deepEqual(r.pending[0].options, ['dom-12', 'dom-04']);
  r = resolveChoice(r.state, r.pending[0].id, 'dom-04');
  assert.deepEqual(r.state.players[A].plan, []); assert.ok(r.state.players[A].discard.includes('dom-04'));
  assert.equal(r.state.players[A].hand.length, 3);
  const t = run(s, A, [E('discard', { amount: 1, who: 'target' })]);
  assert.equal(t.pending[0].kind, 'faction');
  const d = resolveChoice(t.state, t.pending[0].id, B, data);
  assert.deepEqual(d.state.players[B].hand, ['mil-12', 'dom-07'], 'dom-04(비용 가장 낮음)을 버림');
});

test('treaty: 상대 선택, 이번 라운드 기록, 통계, 무역 분쟁이면 무효, 라운드 끝에 소멸', () => {
  const r = run(mk(), A, [E('treaty', { count: 1 })]);
  assert.equal(r.pending[0].kind, 'faction'); assert.deepEqual(r.pending[0].options, [B, C, D]);
  const d = resolveChoice(r.state, r.pending[0].id, B);
  assert.deepEqual(d.state.treaties, [[A, B]]);
  assert.equal(d.state.players[A].stats.treatiesMade, 1); assert.equal(d.state.players[B].stats.treatiesMade, 1);
  assert.deepEqual(clearRoundEffects(d.state).treaties, []);
  const v = applyEvent(mk(), ev('evt-14'), { data }).state;
  assert.equal(run(v, A, [E('treaty', { count: 1 })]).pending.length, 0);
  assert.deepEqual(run(v, A, [E('treaty', { count: 1 })]).state.treaties, []);
});

test('peek: 손패(상대 선택, 무작위 확인)와 이벤트 덱', () => {
  const s = mk(); s.players[B].hand = ['dom-01', 'dom-02', 'dom-03'];
  const r = run(s, A, [E('peek', { what: 'hand', amount: 2 })]);
  const d = resolveChoice(r.state, r.pending[0].id, B);
  const pk = d.state.peeked[A][0];
  assert.equal(pk.kind, 'hand'); assert.equal(pk.target, B); assert.equal(pk.cards.length, 2);
  const e = run(s, A, [E('peek', { what: 'eventDeck', amount: 2 })]).state.peeked[A][0];
  assert.deepEqual(e.cards, s.eventDeck.slice(0, 2));
});

test('drain: 대상 선택, 자원 하한 0, 위신은 음수 가능, sanctionsReceived', () => {
  const r = run(mk(), A, [E('drain', { res: 'capital', amount: 9, target: 'factionChoice' }), E('drain', { res: 'prestige', amount: 2, target: 'factionChoice' })]);
  let d = resolveChoice(r.state, r.pending[0].id, B);
  assert.equal(d.state.players[B].resources.capital, 0);
  d = resolveChoice(d.state, d.pending[0].id, B);
  assert.equal(d.state.players[B].prestige, -2);
  assert.equal(d.state.players[B].stats.sanctionsReceived, 2);
});

test('modifier: 카드는 세력별, 이벤트는 전역, .all은 전역, game은 세력 영구, nextRound 승계', () => {
  let s = run(mk(), A, [E('modifier', { scope: 'round', key: 'planSlots', value: 1 }), E('modifier', { scope: 'game', key: 'handSize', value: 1 }),
    E('modifier', { scope: 'round', key: 'influenceLossReduction.all', value: 1 })]).state;
  assert.equal(getModifier(s, A, 'planSlots'), 1); assert.equal(getModifier(s, B, 'planSlots'), 0);
  assert.equal(getMod(s, A, 'planSlots'), 1);
  assert.equal(getModifier(s, A, 'handSize'), 1); assert.equal(getModifier(s, B, 'handSize'), 0);
  assert.equal(getModifier(s, B, 'influenceLossReduction.all'), 1);
  s = applyEvent(s, ev('evt-02'), { data }).state;
  assert.equal(getModifier(s, D, 'income.capital'), 2);
  s = applyEvent(s, ev('evt-20'), { data }).state;
  assert.equal(getModifier(s, B, 'nextRound.planSlots'), 1);
  s = clearRoundEffects(s);
  assert.equal(getModifier(s, B, 'planSlots'), 1, 'nextRound.planSlots → 다음 라운드 planSlots');
  assert.equal(getModifier(s, A, 'planSlots'), 1);
  assert.equal(getModifier(s, A, 'handSize'), 1, 'game 수정치는 유지');
  assert.equal(getModifier(s, B, 'income.capital'), 0); assert.equal(getModifier(s, A, 'influenceLossReduction.all'), 0);
  assert.equal(applyEvent(mk(), ev('evt-14'), { data }).state.modifiers.round.treatiesVoid, 1, 'boolean 값은 1로 저장');
});

test('conditional: payOptional(확인 → 지불 → then), 불가하면 생략', () => {
  const eff = [{ type: 'conditional', if: { payOptional: { res: 'capital', amount: 2 } }, then: [E('gain', { res: 'prestige', amount: 5 })] }];
  const r = run(mk(), A, eff);
  assert.equal(r.pending[0].kind, 'confirm'); assert.deepEqual(r.pending[0].options, [true, false]);
  const yes = resolveChoice(r.state, r.pending[0].id, true).state, no = resolveChoice(r.state, r.pending[0].id, false).state;
  assert.deepEqual([yes.players[A].resources.capital, yes.players[A].prestige], [2, 5]);
  assert.deepEqual([no.players[A].resources.capital, no.players[A].prestige], [4, 0]);
  const poor = mk(); poor.players[A].resources.capital = 1;
  assert.equal(run(poor, A, eff).pending.length, 0);
});

test('conditional: 데이터에 있는 모든 if 형태 (이벤트, 세력별 판정)', () => {
  const play = (s, f, cat, n = 1) => { s.players[f].roundPlays = { [cat]: n }; return s; };
  let s = play(play(mk(), A, 'diplomatic'), B, 'diplomatic');
  assert.deepEqual(applyEvent(s, ev('evt-07'), { data }).state.turnOrder.map((f) => applyEvent(s, ev('evt-07'), { data }).state.players[f].prestige), [1, 1, 0, 0]);
  s = play(mk(), C, 'military');
  const m = applyEvent(s, ev('evt-08'), { data }).state;
  assert.deepEqual([m.players[C].prestige, m.players[C].resources.capital, m.players[A].prestige], [1, 3, 0]);
  s = play(mk(), A, 'domestic', 3); s.players[A].hand = ['dom-01', 'dom-04']; s.players[B].roundPlays = { military: 1 };
  const h = applyEvent(s, ev('evt-09'), { data });
  assert.equal(h.pending[0].faction, A); assert.equal(h.pending[0].kind, 'card');
  assert.equal(resolveChoice(h.state, h.pending[0].id, 'dom-04').state.players[A].hand.length, 1);
  s = mk(); s.players[A].prestige = 5; s.players[B].prestige = 5; s.players[C].prestige = -1;
  const p13 = applyEvent(s, ev('evt-13'), { data }).state, p19 = applyEvent(s, ev('evt-19'), { data }).state;
  assert.deepEqual(p13.turnOrder.map((f) => p13.players[f].prestige), [4, 4, -1, 0], '최고 동률은 모두');
  assert.equal(p19.players[C].prestige, 1);
  s = mk(); s.players[A].resources.capital = 1; s.players[B].resources.energy = 0;
  assert.equal(applyEvent(s, ev('evt-16'), { data }).state.players[A].resources.capital, 4);
  assert.equal(applyEvent(s, ev('evt-17'), { data }).state.players[B].resources.energy, 3);
  // treatyMadeThisRound (fac-atlas-1)
  const base = run(mk(), A, [], {}).state; base.treaties = [[A, B]];
  const t = resolveChoice(run(base, A, card('fac-atlas-1').effects).state, 'pc1', R[0]);
  assert.equal(t.state.regions[R[0]].influence[A], 2);
  assert.ok(isDeferredEvent(ev('evt-07')) && isDeferredEvent(ev('evt-09')) && !isDeferredEvent(ev('evt-13')));
});

// ---- 커스텀 15종 ----
test('커스텀 효과 15종이 모두 등록되어 있고 데이터의 custom id와 일치', () => {
  const ids = [...data.cards, ...data.events, ...data.assets, ...data.growth].flatMap((c) => c.effects.filter((e) => e.type === 'custom').map((e) => e.id));
  assert.equal(ids.length, 15);
  assert.deepEqual(Object.keys(CUSTOM).sort(), [...ids].sort());
});
const eff = (id) => [...data.cards, ...data.events, ...data.assets].find((c) => c.effects.some((e) => e.id === id)).effects;

test('custom dip-10: 조약 세력 위신 +2 (본인 +2 포함)', () => {
  const s = mk(); s.treaties = [[A, B], [C, A]];
  const r = run(s, A, eff('dip-10')).state;
  assert.deepEqual([A, B, C, D].map((f) => r.players[f].prestige), [2, 2, 2, 0]);
});
test('custom dip-14: 서로 다른 지역 둘 (regionPair)', () => {
  const r = run(mk(), A, eff('dip-14'));
  assert.equal(r.pending[0].kind, 'regionPair');
  assert.equal(resolveChoice(r.state, r.pending[0].id, [R[0], R[0]]).ok, false);
  const d = resolveChoice(r.state, r.pending[0].id, [R[0], R[3]]).state;
  assert.deepEqual([d.regions[R[0]].influence[A], d.regions[R[3]].influence[A]], [1, 1]);
});
test('custom dip-15: 대상 세력의 다음 라운드 계획 카드 공개 표시', () => {
  const r = run(mk(), A, eff('dip-15'));
  const d = resolveChoice(r.state, r.pending[0].id, C).state;
  assert.equal(d.players[C].roundModifiers['nextRound.revealPlanCard'], 1);
  assert.equal(getModifier(clearRoundEffects(d), C, 'revealPlanCard'), 1);
  assert.equal(getModifier(clearRoundEffects(d), B, 'revealPlanCard'), 0);
});
test('custom mil-12: 상대 영향력 −3, 대상에게 기지가 있으면 −1', () => {
  const s = inf(inf(mk(), R[0], B, 5), R[1], B, 5); s.regions[R[1]].bases[B] = 1;
  const r = run(s, A, eff('mil-12'));
  const a = resolveChoice(r.state, r.pending[0].id, R[0]).state, b = resolveChoice(r.state, r.pending[0].id, R[1]).state;
  assert.equal(a.regions[R[0]].influence[B], 2); assert.equal(b.regions[R[1]].influence[B], 4);
  assert.equal(a.players[A].stats.influenceRemoved, 3);
});
test('custom fac-atlas-2: 💰 + 이번 라운드 낸 외교 카드 수 × 2', () => {
  const s = mk(); s.players[A].roundPlays = { diplomatic: 3 };
  assert.equal(run(s, A, eff('fac-atlas-2')).state.players[A].resources.capital, 10);
});
test('custom fac-redDragon-2: 🏭 + 내가 영향력을 둔 지역 수', () => {
  const s = inf(inf(inf(mk(), R[0], B, 1), R[2], B, 4), R[3], A, 2);
  assert.equal(run(s, B, eff('fac-redDragon-2')).state.players[B].resources.industry, 4);
});
test('custom fac-emerald-2: 조약 세력과 내 방어 각각 +1', () => {
  const s = inf(inf(inf(mk(), R[0], D, 1), R[1], B, 1), R[2], C, 1); s.treaties = [[D, B]];
  const r = run(s, D, eff('fac-emerald-2')).state;
  assert.deepEqual([r.regions[R[0]].defense[D], r.regions[R[1]].defense[B], r.regions[R[2]].defense[C]], [1, 1, 0]);
});
test('custom evt-06: 각 지역 최다 영향력 세력 −1 (동률은 모두)', () => {
  const s = inf(inf(inf(mk(), R[0], A, 3), R[0], B, 1), R[1], C, 2); inf(s, R[1], D, 2);
  const r = applyEvent(s, ev('evt-06'), { data }).state;
  assert.deepEqual([r.regions[R[0]].influence[A], r.regions[R[0]].influence[B], r.regions[R[1]].influence[C], r.regions[R[1]].influence[D]], [2, 1, 1, 1]);
  assert.equal(applyEvent(mk(), ev('evt-06'), { data }).state.players[A].stats.influenceLost, 0);
});
test('custom evt-10: 무작위 지역 하나에서 모든 세력 −1 (결정적)', () => {
  const s = mk(); for (const r of R) for (const f of [A, B, C, D]) inf(s, r, f, 2);
  const x = applyEvent(s, ev('evt-10'), { data }).state, y = applyEvent(s, ev('evt-10'), { data }).state;
  assert.equal(hashState(x), hashState(y));
  assert.equal(R.filter((r) => sum(x, r) === 4).length, 1);
  assert.equal(R.filter((r) => sum(x, r) === 8).length, 7);
});
test('custom evt-11: 무작위 지역 점수 가치 +1 (게임 끝까지)', () => {
  const s = mk(), x = applyEvent(s, ev('evt-11'), { data }).state;
  const diff = R.filter((r) => x.regions[r].scoreValue !== s.regions[r].scoreValue);
  assert.equal(diff.length, 1); assert.equal(x.regions[diff[0]].scoreValue, s.regions[diff[0]].scoreValue + 1);
  assert.equal(clearRoundEffects(x).regions[diff[0]].scoreValue, x.regions[diff[0]].scoreValue);
});
test('custom evt-12: 무작위 지역의 주도 세력 −2 (주도 없으면 없음)', () => {
  const s = mk(); for (const r of R) inf(s, r, B, 4);
  const x = applyEvent(s, ev('evt-12'), { data }).state;
  assert.equal(R.filter((r) => x.regions[r].influence[B] === 2).length, 1);
  assert.equal(applyEvent(mk(), ev('evt-12'), { data }).state.players[B].stats.influenceLost, 0);
  assert.deepEqual(regionLeaders(x)[R.find((r) => x.regions[r].influence[B] === 2)], [B]);
});
test('custom evt-18: 방어가 없는 지역(세력별)에서 영향력 −1', () => {
  const s = inf(inf(mk(), R[0], A, 3), R[0], B, 3); s.regions[R[0]].defense[A] = 1;
  const x = applyEvent(s, ev('evt-18'), { data }).state;
  assert.deepEqual([x.regions[R[0]].influence[A], x.regions[R[0]].influence[B]], [3, 2]);
});
test('custom sa-05: 서로 다른 지역 둘에 영향력 +1씩, 위신 +2', () => {
  const r = run(mk(), A, eff('sa-05'));
  const d = resolveChoice(r.state, r.pending[0].id, [R[1], R[2]]).state;
  assert.deepEqual([d.regions[R[1]].influence[A], d.regions[R[2]].influence[A], d.players[A].prestige], [1, 1, 2]);
});
test('custom sa-10: 조약 두 세력과 각자 위신 +1 (본인 +1 포함)', () => {
  let r = run(mk(), A, eff('sa-10'));
  r = resolveChoice(r.state, r.pending[0].id, B);
  assert.deepEqual(r.pending[0].options, [C, D], '두 번째 조약은 이미 맺은 상대 제외');
  r = resolveChoice(r.state, r.pending[0].id, D);
  assert.deepEqual([A, B, C, D].map((f) => r.state.players[f].prestige), [1, 1, 0, 1]);
  assert.equal(r.state.players[A].stats.treatiesMade, 2);
});
test('custom sa-12: 모든 세력 손패 1장씩 확인 + 이벤트 덱 2장', () => {
  const s = mk(); for (const f of [B, C, D]) s.players[f].hand = ['dom-01', 'dom-02'];
  const r = run(s, A, eff('sa-12')).state.peeked[A];
  assert.deepEqual(r.filter((p) => p.kind === 'hand').map((p) => p.target), [B, C, D]);
  assert.deepEqual(r.find((p) => p.kind === 'eventDeck').cards, s.eventDeck.slice(0, 2));
});

// ---- 카드/이벤트/보조 ----
test('playCard: 손패→사용 더미, 통계, 카드 효과, 잘못된 입력', () => {
  const s = mk(); s.players[A].hand = ['dip-01', 'dom-12']; s.players[A].plan = ['dip-01'];
  assert.equal(playCard(s, A, 'dom-04', { data }).reason, 'not-in-hand');
  let r = playCard(s, A, 'dip-01', { data });
  assert.ok(r.ok); assert.equal(r.pending[0].kind, 'region');
  let p = r.state.players[A];
  assert.deepEqual([p.hand, p.plan, p.played], [['dom-12'], [], ['dip-01']]);
  assert.equal(p.stats.cardsPlayed.diplomatic, 1); assert.equal(p.roundPlays.diplomatic, 1);
  r = resolveChoice(r.state, r.pending[0].id, R[0], data);
  assert.equal(r.state.regions[R[0]].influence[A], 1); assert.equal(r.state.players[A].prestige, 1);
  r = playCard(r.state, A, 'dom-12', { data });
  assert.equal(r.state.players[A].resources.capital, 10); assert.equal(r.state.players[A].stats.cardsPlayed.domestic, 1);
  assert.equal(s.players[A].played.length, 0);
  assert.equal(playCard(s, A, 'nope', { data }).reason, 'unknown-card');
});
test('수정치 연동: 평화 협상(군사 절반 올림), 팬데믹(내정 💰 +1), 외교 네트워크(첫 외교 영향력 +1)', () => {
  let s = applyEvent(mk(), ev('evt-15'), { data }).state; s.players[A].hand = ['mil-15', 'mil-09'];
  inf(s, R[0], B, 5);
  let r = playCard(s, A, 'mil-15', { data }); r = resolveChoice(r.state, r.pending[0].id, R[1], data);
  assert.deepEqual([r.state.regions[R[1]].influence[A], r.state.players[A].prestige], [2, -1]);
  r = playCard(r.state, A, 'mil-09', { data });
  assert.equal(r.pending.length, 0, '선택지가 하나면 자동 진행');
  assert.equal(r.state.regions[R[0]].influence[B], 4);
  s = applyEvent(mk(), ev('evt-05'), { data }).state; s.players[A].hand = ['dom-01'];
  assert.equal(playCard(s, A, 'dom-01', { data }).state.players[A].resources.capital, 9);
  s = mk(); s.players[A].modifiers.firstDiplomaticInfluenceBonus = 1; s.players[A].hand = ['dip-11', 'dip-11'];
  let g = playCard(s, A, 'dip-11', { data }); g = resolveChoice(g.state, g.pending[0].id, R[0], data);
  g = playCard(g.state, A, 'dip-11', { data }); g = resolveChoice(g.state, g.pending[0].id, R[1], data);
  assert.deepEqual([g.state.regions[R[0]].influence[A], g.state.regions[R[1]].influence[A]], [2, 1]);
});
test('영향력 감소 수정치(공동 규범 .all / 자기 .self)와 대상 무효(사이버 방벽)', () => {
  let s = inf(mk(), R[0], B, 4); s = run(s, D, [E('modifier', { scope: 'round', key: 'influenceLossReduction.all', value: 1 })]).state;
  assert.equal(run(s, A, [E('removeInfluence', { amount: 2, target: 'regionChoice', from: 'other' })], { region: R[0] }).state.regions[R[0]].influence[B], 3);
  s = run(inf(mk(), R[0], B, 4), B, [E('modifier', { scope: 'round', key: 'influenceLossReduction.self', value: 1 })]).state;
  assert.equal(run(s, A, [E('removeInfluence', { amount: 2, target: 'regionChoice', from: 'other' })], { region: R[0] }).state.regions[R[0]].influence[B], 3);
  s = run(inf(mk(), R[0], B, 4), B, [E('modifier', { scope: 'round', key: 'negateTargetedEffect', value: 1 })]).state;
  const a = run(s, A, [E('removeInfluence', { amount: 2, target: 'regionChoice', from: 'other' }), E('removeInfluence', { amount: 2, target: 'regionChoice', from: 'other' })], { region: R[0] }).state;
  assert.equal(a.regions[R[0]].influence[B], 2, '첫 번째 효과만 무효');
});
test('이벤트 무시: 불리한 이벤트로 잃은 영향력을 한 지역에서 복구 (gr-09, dom-15)', () => {
  const s = mk(); for (const r of R) inf(s, r, A, 3);
  s.players[A].modifiers.ignoreEventEffectInRegionPerRound = 1;
  const e = applyEvent(s, ev('evt-18'), { data });
  assert.equal(e.pending[0].kind, 'region'); assert.deepEqual(e.pending[0].options, R);
  assert.equal(resolveChoice(e.state, e.pending[0].id, R[2]).state.regions[R[2]].influence[A], 3);
  const t = mk(); for (const r of R) inf(t, r, B, 3);
  const x = applyEvent(t, ev('evt-18'), { data }).state;
  const d = run(x, B, [E('modifier', { scope: 'round', key: 'ignoreEventEffectInRegion', value: 1 })]);
  assert.equal(resolveChoice(d.state, d.pending[0].id, R[0]).state.regions[R[0]].influence[B], 3);
});
test('autoChoose: 정책 함수 / 기본 무작위 합법 선택(시드 재현)', () => {
  const r = run(mk(), A, [E('influence', { amount: 1, target: 'regionChoice', filter: 'any' })]);
  const p = r.pending[0];
  assert.equal(autoChoose(r.state, p, () => R[4]).choice, R[4]);
  const x = autoChoose(r.state, p), y = autoChoose(r.state, p);
  assert.deepEqual(x, y); assert.ok(p.options.includes(x.choice)); assert.notEqual(x.rng, r.state.rng);
  assert.equal(resolveChoice(autoResolve(r.state), p.id, R[0]).reason, 'no-such-pending');
  assert.equal(autoResolve(r.state, () => R[4]).regions[R[4]].influence[A], 1);
});
test('무작위 이벤트 결정성: 같은 시드·같은 상태 → 같은 결과, 다른 시드 → 다를 수 있음', () => {
  const play = (seed) => {
    let s = mk({ seed }); for (const r of R) inf(s, r, B, 3);
    for (const id of ['evt-10', 'evt-11', 'evt-12']) s = applyEvent(s, ev(id), { data }).state;
    return hashState(s);
  };
  assert.equal(play(5), play(5));
  assert.equal(new Set([1, 2, 3, 4, 5, 6].map(play)).size > 1, true);
});
test('전수: 모든 카드·전략 자산·이벤트·성장 카드 효과가 오류 없이 끝나고 불변식 유지', () => {
  let n = 0;
  for (const seed of [1, 2, 3]) {
    const base = mk({ seed }); for (const [i, r] of R.entries()) { inf(base, r, [A, B, C, D][i % 4], 3); inf(base, r, [A, B, C, D][(i + 1) % 4], 2); }
    for (const f of [A, B, C, D]) { base.players[f].hand = base.players[f].deck.splice(0, 5); base.players[f].resources.capital = 6; }
    for (const c of [...data.cards, ...data.assets, ...data.growth]) {
      if (!c.effects?.length) continue;
      for (const f of [A, C]) {
        const s = deepClone(base), before = hashState(s);
        const r = runEffects(s, f, c.effects, { data });
        assert.equal(hashState(s), before);
        validateInvariants(autoResolve(r.state, null, data)); n++;
      }
    }
    for (const e of data.events) { validateInvariants(autoResolve(applyEvent(base, e, { data }).state, null, data)); n++; }
  }
  assert.ok(n > 300);
});
