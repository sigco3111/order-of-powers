import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../src/engine/node-data.js';
import { hashState, deepClone } from '../src/engine/util.js';
import { validateInvariants } from '../src/engine/state.js';
import { regionLeaders } from '../src/engine/score.js';
import {
  createGame, reduce, legalActions, waitingFor, phaseOf, finalScores, autoPlay, randomPolicy,
} from '../src/engine/index.js';
import { planCombos } from '../src/engine/legal.js';
import { computeIncome } from '../src/engine/income.js';

const data = loadData();
const [A, B, C, D] = ['atlas', 'redDragon', 'polarStar', 'emerald'];
const F = [A, B, C, D];
const R = data.regions.map((r) => r.id);
const reg = (id) => data.regions.find((r) => r.id === id);
const mk = (o = {}) => createGame({ data, seed: 5, ...o });
const act = (s, a) => { const r = reduce(s, a); assert.ok(r.ok, `${a.type} ${a.faction}: ${r.reason}`); return r; };
const pickAll = (s) => F.reduce((st, f) => act(st, { type: 'PICK_ASSET', faction: f, assetId: st.players[f].assetOptions[0] }).state, s);
/** 준비를 마치고 1라운드 계획 단계에 있는 상태 (이벤트 효과 제거, 수정치 초기화) */
const ready = (o) => {
  const s = pickAll(mk(o));
  assert.equal(s.phase, 'plan');
  for (const p of Object.values(s.players)) { p.resources = { capital: 4, energy: 2, industry: 2 }; p.prestige = 0; p.regionScore = 0; }
  return s; // 1라운드 이벤트의 자원·위신 효과는 지워 둔다
};
const skipAll = (s) => F.reduce((st, f) => act(st, { type: 'SKIP_PLAN', faction: f }).state, s);
const endShop = (s) => F.reduce((st, f) => act(st, { type: 'END_SHOP', faction: f }).state, s);
/** 손패를 지정 카드로 교체 (불변식 유지: 덱/소유 목록 보정) */
function setHand(s, f, cards) {
  const p = s.players[f];
  p.deck.push(...p.hand); p.hand = [];
  for (const c of cards) {
    const i = p.deck.indexOf(c);
    if (i >= 0) p.deck.splice(i, 1);
    else { p.collection[c] = (p.collection[c] || 0) + 1; p.firstPurchase = p.firstPurchase.filter((x) => x !== c); }
    p.hand.push(c);
  }
}
const deepFreeze = (o) => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(deepFreeze); } return o; };
const scoresOf = (s) => Object.fromEntries(F.map((f) => [f, s.players[f].regionScore]));

test('단계 순서: setup → event → plan → reveal → resolve → upkeep → shop → 다음 라운드', () => {
  const s0 = mk();
  assert.equal(phaseOf(s0), 'setup');
  assert.deepEqual(waitingFor(s0), F);
  assert.equal(legalActions(s0, A).length, 2);
  const bad = reduce(s0, { type: 'PICK_ASSET', faction: A, assetId: s0.players[B].assetOptions[0] });
  assert.equal(bad.ok, false); assert.match(bad.reason, /전략 자산/); assert.equal(bad.state, s0);
  assert.equal(reduce(s0, { type: 'PLAN', faction: A, cards: [] }).ok, false, '준비 단계에서는 계획 불가');
  let s = s0;
  for (const f of F.slice(0, 3)) s = act(s, { type: 'PICK_ASSET', faction: f, assetId: s.players[f].assetOptions[1] }).state;
  assert.deepEqual(waitingFor(s), [D]); assert.equal(s.phase, 'setup');
  const last = act(s, { type: 'PICK_ASSET', faction: D, assetId: s.players[D].assetOptions[0] });
  s = last.state;
  assert.deepEqual(last.events.filter((e) => e.type === 'phase').map((e) => e.phase), ['event', 'plan']);
  assert.equal(s.phase, 'plan'); assert.equal(s.round, 1);
  assert.ok(s.currentEvent, '1라운드 이벤트 공개');
  for (const f of F) assert.equal(s.players[f].hand.length, 5);
  assert.deepEqual(waitingFor(s), F);
  const r = act(s, { type: 'SKIP_PLAN', faction: A });
  assert.deepEqual(waitingFor(r.state), [B, C, D]);
  s = skipAll(s);
  assert.equal(s.phase, 'shop');
  assert.deepEqual(waitingFor(s), F);
  const phases = [];
  const all = F.slice(0, 3).reduce((st, f) => act(st, { type: 'END_SHOP', faction: f }).state, s);
  const fin = act(all, { type: 'END_SHOP', faction: D });
  fin.events.filter((e) => e.type === 'phase').forEach((e) => phases.push(e.phase));
  assert.deepEqual(phases, ['event', 'plan']);
  assert.equal(fin.state.round, 2); assert.equal(fin.state.phase, 'plan');
  for (const t of ['이벤트 단계', '계획 단계', '공개 단계', '해결 단계', '정비 단계', '상점 단계']) {
    assert.ok(fin.state.log.some((l) => l.text.includes(t)), t + ' 로그');
  }
});

test('PLAN 검증: 손패에 없는 카드, 슬롯 초과, 중복 제출, 단계 오류, 입력 불변', () => {
  const s = deepFreeze(ready());
  const hand = s.players[A].hand;
  const other = s.players[B].hand.find((c) => !hand.includes(c));
  const cases = [
    [{ type: 'PLAN', faction: A, cards: ['no-such-card'] }, /손패에 없는/],
    [{ type: 'PLAN', faction: A, cards: [other ?? 'fac-atlas-1'] }, /손패에 없는/],
    [{ type: 'PLAN', faction: A, cards: [hand[0], hand[0], hand[0], hand[1]] }, /슬롯/],
    [{ type: 'PLAN', faction: 'nobody', cards: [] }, /알 수 없는 세력/],
    [{ type: 'BUY', faction: A, cardId: s.market.slots[0] }, /상점/],
    [{ type: 'CHOOSE', faction: A, choice: 'x' }, /선택/],
    [{ type: 'FLY', faction: A }, /알 수 없는 행동/],
    [null, /형식/],
  ];
  for (const [a, re] of cases) {
    const r = reduce(s, a);
    assert.equal(r.ok, false, JSON.stringify(a)); assert.match(r.reason, re); assert.equal(r.state, s); assert.deepEqual(r.events, []);
  }
  const ok = act(s, { type: 'PLAN', faction: A, cards: hand.slice(0, 3) });
  assert.deepEqual(ok.state.players[A].plan, hand.slice(0, 3));
  assert.deepEqual(s.players[A].plan, [], '입력 상태는 바뀌지 않는다');
  assert.equal(reduce(ok.state, { type: 'PLAN', faction: A, cards: [] }).reason, '이미 계획을 제출했습니다');
  assert.equal(reduce(ok.state, { type: 'USE_ASSET', faction: A }).ok, false, '제출 뒤 자산 사용 불가');
});

test('해결 순서 회전: 시작 인덱스 = (round-1) mod 4', () => {
  const orders = [];
  let s = ready({ rounds: 6 });
  for (let i = 0; i < 5; i++) {
    const a = act(s, { type: 'SKIP_PLAN', faction: A });
    const r = [B, C, D].reduce((x, f) => { const y = act(x.state, { type: 'SKIP_PLAN', faction: f }); y.events = x.events.concat(y.events); return y; }, a);
    orders.push(r.events.find((e) => e.type === 'order').order);
    s = endShop(r.state);
  }
  assert.deepEqual(orders[0], [A, B, C, D]);
  assert.deepEqual(orders[1], [B, C, D, A]);
  assert.deepEqual(orders[2], [C, D, A, B]);
  assert.deepEqual(orders[3], [D, A, B, C]);
  assert.deepEqual(orders[4], [A, B, C, D]);
});

test('선택 대기: CHOOSE로 이어서 진행, 다른 세력·잘못된 값·다른 행동은 거부', () => {
  const s = ready();
  setHand(s, C, ['fac-polarStar-1', 'st-common-3']);
  setHand(s, A, ['st-common-1']);
  let st = act(s, { type: 'PLAN', faction: C, cards: ['fac-polarStar-1', 'st-common-3'] }).state;
  for (const f of [A, B, D]) st = act(st, { type: 'PLAN', faction: f, cards: f === A ? ['st-common-1'] : [] }).state;
  assert.equal(st.phase, 'resolve');
  assert.equal(st.pending.length, 1);
  const pc = st.pending[0];
  assert.deepEqual(waitingFor(st), [C]);
  assert.equal(pc.kind, 'region');
  assert.equal(st.players[C].resources.energy, 4, '선택 전까지 첫 카드의 에너지 +2만 적용, 나머지 카드는 대기');
  assert.equal(legalActions(st, A).length, 0);
  const legal = legalActions(st, C);
  assert.deepEqual(legal.map((a) => a.choice), R);
  assert.ok(legal.every((a) => a.type === 'CHOOSE' && a.pendingId === pc.id && a.faction === C));
  assert.equal(reduce(st, { type: 'CHOOSE', faction: A, pendingId: pc.id, choice: R[0] }).ok, false);
  assert.equal(reduce(st, { type: 'CHOOSE', faction: C, pendingId: pc.id, choice: 'atlantis' }).ok, false);
  assert.equal(reduce(st, { type: 'CHOOSE', faction: C, pendingId: 'zz', choice: R[0] }).ok, false);
  assert.match(reduce(st, { type: 'BUY', faction: C, cardId: st.market.slots[0] }).reason, /선택/);
  const done = act(st, { type: 'CHOOSE', faction: C, pendingId: pc.id, choice: R[3] });
  assert.equal(done.state.regions[R[3]].influence[C], 1);
  assert.equal(done.state.pending.length, 0);
  assert.equal(done.state.phase, 'shop', '선택 뒤 남은 카드까지 해결하고 상점으로');
  assert.equal(done.state.players[C].resources.energy, 7, '에너지 비축 +2 후 러시아·중앙아시아(🛢) 주도 수입 +1');
  assert.deepEqual(done.state.players[C].played, []);
  assert.ok(done.state.players[C].discard.includes('fac-polarStar-1') && done.state.players[C].discard.includes('st-common-3'));
});

test('전략 자산: USE_ASSET (계획 단계, 1회), PLAN.assetUse', () => {
  const s = ready();
  setHand(s, A, ['st-common-1']);
  s.players[A].strategicAsset = 'sa-02'; s.players[B].strategicAsset = 'sa-08';
  const u = act(s, { type: 'USE_ASSET', faction: A });
  assert.equal(u.state.players[A].resources.capital, 12);
  assert.equal(u.state.players[A].usedAsset, true);
  assert.equal(reduce(u.state, { type: 'USE_ASSET', faction: A }).ok, false);
  assert.ok(!legalActions(u.state, A).some((a) => a.type === 'USE_ASSET'));
  const p = act(s, { type: 'PLAN', faction: B, cards: [], assetUse: {} });
  assert.equal(p.state.players[B].prestige, s.players[B].prestige + 5);
  assert.ok(legalActions(s, A).some((a) => a.type === 'USE_ASSET'));
});

test('지연 이벤트: 해결 단계 뒤에 적용', () => {
  const s0 = mk();
  s0.eventDeck[0] = 'evt-07'; // 외교 카드를 낸 세력 위신 +1
  let s = pickAll(s0);
  assert.equal(s.currentEvent, 'evt-07'); assert.equal(s.deferredEvent, 'evt-07');
  assert.equal(s.players[A].prestige, 0);
  setHand(s, A, ['st-common-4']);
  s = act(s, { type: 'PLAN', faction: A, cards: ['st-common-4'] }).state;
  for (const f of [B, C, D]) s = act(s, { type: 'SKIP_PLAN', faction: f }).state;
  assert.equal(s.phase, 'shop');
  assert.deepEqual(F.map((f) => s.players[f].prestige), [1, 0, 0, 0]);
});

test('정비 단계: 지역 점수와 수입 (손으로 만든 상태)', () => {
  const s = ready();
  s.modifiers = { round: {}, game: {} };
  for (const r of Object.values(s.regions)) for (const f of F) { r.influence[f] = 0; r.defense[f] = 0; }
  s.regions.northAmerica.influence[A] = 2;                 // 💰 산출, 단독 주도
  s.regions.eastAsia.influence[A] = 1; s.regions.eastAsia.influence[B] = 1; // 동률, 조약 없음 → 주도 없음
  s.regions.europe.influence[B] = 3; s.regions.europe.influence[C] = 3;     // 동률 + 조약 → 공동 주도
  s.regions.middleEastNorthAfrica.influence[D] = 1;                          // 🛢 산출
  s.regions.subSaharanAfrica.influence[D] = 5;                               // 산출 없음
  s.regions.subSaharanAfrica.scoreBonus = 2;
  s.treaties = [[B, C]];
  s.players[B].modifiers['income.industry'] = 2; // 성장 카드 수정치
  s.modifiers.round['income.energy'] = -5;       // 이벤트: 수입은 0 미만이 되지 않음
  s.modifiers.round['income.prestige'] = 1;
  const before = deepClone(s);
  assert.deepEqual(computeIncome(s, A), { capital: 3, energy: 0, industry: 0, prestige: 1 });
  const out = skipAll(s);
  assert.equal(out.phase, 'shop');
  const v = (id) => reg(id).scoreValue;
  assert.deepEqual(scoresOf(out), {
    [A]: v('northAmerica'), [B]: v('europe'), [C]: v('europe'), [D]: v('middleEastNorthAfrica') + v('subSaharanAfrica') + 2,
  });
  const res = (f) => out.players[f].resources;
  assert.deepEqual(res(A), { capital: 4 + 3, energy: 2, industry: 2 });
  assert.deepEqual(res(B), { capital: 4 + 2 + 1, energy: 2, industry: 2 + 2 }, 'B: 💰 +2, 유럽(💰) 주도 +1, 🏭 성장 수정치 +2');
  assert.deepEqual(res(C), { capital: 4 + 2 + 1, energy: 2, industry: 2 });
  assert.deepEqual(res(D), { capital: 4 + 2, energy: 2, industry: 2 });
  assert.deepEqual(F.map((f) => out.players[f].prestige), [1, 1, 1, 1]);
  assert.ok(out.log.some((l) => l.text.startsWith('수입:')));
  assert.ok(out.log.some((l) => l.text.includes('europe 주도')));
  assert.deepEqual(before.treaties, [[B, C]]);
  for (const f of F) assert.deepEqual(out.players[f].played, []);
  validateInvariants(out);
});

test('상점: 구매(비용·버린 더미·시장 보충), 자본 부족, END_SHOP 뒤 다음 라운드와 손패 유지', () => {
  let s = skipAll(ready({ rounds: 6 }));
  const handBefore = deepClone(s.players[A].hand);
  assert.equal(s.market.slots.length, 6);
  const slot = s.market.slots[0], top = s.market.deck[0];
  s.players[A].resources.capital = 20; s.players[B].resources.capital = 0;
  const a = legalActions(s, A).filter((x) => x.type === 'BUY').map((x) => x.cardId);
  assert.ok(a.includes(slot));
  assert.deepEqual(legalActions(s, B).map((x) => x.type), ['END_SHOP'], '자본 0이면 구매 불가');
  assert.equal(reduce(s, { type: 'BUY', faction: B, cardId: slot }).reason, '자본이 부족합니다');
  assert.equal(reduce(s, { type: 'BUY', faction: A, cardId: 'nope' }).ok, false);
  const b = act(s, { type: 'BUY', faction: A, cardId: slot });
  const cost = b.events.find((e) => e.type === 'buy').cost;
  assert.equal(b.state.players[A].resources.capital, 20 - cost);
  assert.ok(b.state.players[A].discard.includes(slot));
  assert.ok(!b.state.market.slots.includes(slot) && b.state.market.slots.length === 6 && b.state.market.slots.includes(top), '시장 보충');
  const b2 = act(b.state, { type: 'BUY', faction: A, cardId: b.state.market.slots[0] });
  assert.equal(b2.state.players[A].purchases, 2, '한 단계에 여러 번 구매');
  s = endShop(b2.state);
  assert.equal(s.round, 2); assert.equal(s.phase, 'plan');
  assert.deepEqual(s.players[A].hand, handBefore, '내지 않은 손패는 유지 (5장이라 추가 드로우 없음)');
  assert.equal(reduce(b2.state, { type: 'END_SHOP', faction: A }).ok, true);
  const done = act(b2.state, { type: 'END_SHOP', faction: A }).state;
  assert.equal(reduce(done, { type: 'BUY', faction: A, cardId: done.market.slots[0] }).reason, '이미 상점을 마쳤습니다');
});

test('게임 종료: 최종 점수·비밀 목표·동점 처리 (점수 → 위신 → 자본 → 공동 승리)', () => {
  const finalRound = (setup) => {
    const s = ready({ rounds: 6 });
    s.round = 6; s.modifiers = { round: {}, game: {} };
    for (const f of F) { s.players[f].secretGoals = []; s.players[f].resources.capital = 4; }
    setup(s);
    return endShop(skipAll(s));
  };
  const prestigeWin = finalRound((s) => { s.players[A].regionScore = 5; s.players[B].regionScore = 3; s.players[B].prestige = 2; s.players[C].regionScore = 0; });
  assert.equal(prestigeWin.phase, 'end');
  assert.equal(prestigeWin.result.winner, B, '총점 동률(5)은 위신이 높은 쪽');
  assert.deepEqual(prestigeWin.result.ranking.slice(0, 2), [B, A]);
  assert.equal(prestigeWin.result.tie, false);
  const capitalWin = finalRound((s) => { s.players[C].regionScore = 4; s.players[D].regionScore = 4; s.players[D].resources.capital = 9; });
  assert.equal(capitalWin.result.winner, D, '총점·위신 동률이면 자본');
  const shared = finalRound((s) => { s.players[A].regionScore = 4; s.players[B].regionScore = 4; });
  assert.equal(shared.result.tie, true);
  assert.deepEqual(shared.result.winners, [A, B]);
  assert.match(shared.log.at(-1).text, /공동 승리/);
  assert.equal(shared.result.scores[A].total, finalScores(shared, data).scores[A].total);
  assert.deepEqual(reduce(shared, { type: 'END_SHOP', faction: A }).reason, '이미 끝난 게임입니다');
  assert.deepEqual(legalActions(shared, A), []);
  // 비밀 목표가 점수에 반영된다
  const g = data.goals[0];
  const withGoal = finalRound((s) => { s.players[A].secretGoals = [g.id]; });
  assert.equal(withGoal.result.scores[A].goals.length, 1);
  assert.equal(withGoal.result.scores[A].total, withGoal.result.scores[A].regions + withGoal.result.scores[A].prestige + withGoal.result.scores[A].goalPoints);
});

test('legalActions: PLAN 열거(순서열)·표본 추출 상한 200, 모두 합법', () => {
  const s = ready();
  const acts = legalActions(s, A);
  const plans = acts.filter((a) => a.type === 'PLAN');
  assert.ok(plans.some((a) => a.cards.length === 0), '빈 계획 포함');
  assert.ok(plans.length > 1 && plans.length <= 200);
  assert.equal(new Set(plans.map((a) => a.cards.join('|'))).size, plans.length, '중복 없음');
  for (const a of acts) assert.ok(reduce(s, a).ok, JSON.stringify(a));
  // 손패 8장, 슬롯 4개 → 표본 200개
  const t = ready();
  setHand(t, A, ['st-common-1', 'st-common-2', 'st-common-3', 'st-common-4', 'st-common-5', 'st-atlas-1', 'st-atlas-2', 'st-common-1']);
  t.players[A].modifiers.planSlots = 1;
  const big = planCombos(t, A);
  assert.equal(big.length, 200);
  assert.deepEqual(planCombos(t, A), big, '같은 상태면 같은 표본');
  assert.ok(big.some((c) => c.length === 0) && big.some((c) => c.length === 4));
  const hand = t.players[A].hand;
  for (const c of big) assert.ok(c.length <= 4 && c.every((x, i) => c.indexOf(x) !== i ? c.filter((y) => y === x).length <= hand.filter((y) => y === x).length : hand.includes(x)));
  assert.ok(reduce(t, { type: 'PLAN', faction: A, cards: big[100] }).ok);
  assert.equal(reduce(t, { type: 'PLAN', faction: A, cards: [1, 2] }).ok, false);
  // 상점·선택 합법 수는 모두 통과
  const shop = skipAll(t);
  for (const f of F) for (const a of legalActions(shop, f)) assert.ok(reduce(shop, a).ok, JSON.stringify(a));
});

test('결정론: 같은 시드와 같은 무작위 정책이면 최종 상태 해시 동일 (6/8/10 라운드)', () => {
  for (const rounds of [6, 8, 10]) {
    const run = (seed, pol) => { const s = createGame({ data, rounds, seed }); s.config.debug = true; return autoPlay(s, randomPolicy(pol)); };
    const a = run(11, 4), b = run(11, 4), c = run(11, 5);
    assert.equal(a.state.phase, 'end');
    assert.equal(hashState(a.state), hashState(b.state), rounds + '라운드');
    assert.deepEqual(a.events, b.events);
    assert.notEqual(hashState(a.state), hashState(c.state));
    assert.equal(a.steps, b.steps);
  }
});

test('autoPlay는 정책이 맡지 않은 세력의 입력에서 멈춘다', () => {
  const s = createGame({ data, seed: 2 });
  const r = autoPlay(s, randomPolicy(1, { factions: [B, C, D] }));
  assert.equal(r.stopped, 'waiting');
  assert.deepEqual(waitingFor(r.state), [A]);
  assert.equal(r.state.phase, 'setup');
  const h = act(r.state, legalActions(r.state, A)[0]);
  const r2 = autoPlay(h.state, randomPolicy(1, { factions: [B, C, D] }));
  assert.equal(r2.stopped, 'waiting'); assert.equal(r2.state.phase, 'plan'); assert.deepEqual(waitingFor(r2.state), [A]);
  assert.throws(() => autoPlay(createGame({ data, seed: 2 }), randomPolicy(1), { maxSteps: 3 }), /끝나지 않음/);
});

for (const rounds of [6, 8, 10]) {
  test(`퍼즈: ${rounds}라운드 무작위 200판 (불변식 검사, 예외 없음, 5000회 이내 종료)`, { timeout: 180000 }, () => {
    let total = 0, max = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const s = createGame({ data, rounds, seed: seed * 31 + rounds });
      s.config.debug = true;
      const r = autoPlay(s, randomPolicy(seed), { maxSteps: 5000 });
      assert.equal(r.state.phase, 'end', `seed ${seed}`);
      assert.equal(r.state.round, rounds);
      assert.ok(r.steps < 5000);
      const res = r.state.result;
      assert.ok(res && F.includes(res.winner) && res.winners.includes(res.winner));
      assert.deepEqual(res.unknownMetrics, []);
      for (const f of F) assert.ok(Number.isFinite(res.scores[f].total), `seed ${seed} ${f}`);
      validateInvariants(r.state);
      total += r.steps; max = Math.max(max, r.steps);
    }
    console.log(`  fuzz ${rounds}R: 200판, 평균 ${(total / 200).toFixed(1)}회, 최대 ${max}회`);
  });
}

test('회귀: 징집령(방어 + owned 영향력)은 영향력 없는 지역에 영향력을 만들지 못한다', () => {
  const play = (setup) => {
    const s = ready();
    setup(s);
    setHand(s, C, ['st-polarStar-1']);
    let st = act(s, { type: 'PLAN', faction: C, cards: ['st-polarStar-1'] }).state;
    for (const f of [A, B, D]) st = act(st, { type: 'SKIP_PLAN', faction: f }).state;
    return st;
  };
  const none = play(() => {});
  assert.equal(none.pending.length, 1);
  assert.equal(none.pending[0].options.length, R.length, '영향력이 없으면 방어는 어느 지역이든');
  const done = act(none, { type: 'CHOOSE', faction: C, choice: R[0] }).state;
  assert.equal(done.regions[R[0]].influence[C], 0, '영향력은 생기지 않는다');
  const some = play((s) => { s.regions[R[2]].influence[C] = 1; s.regions[R[5]].influence[C] = 2; });
  assert.deepEqual(some.pending[0].options, [R[2], R[5]], '내 영향력이 있는 지역만 선택지');
  const d2 = act(some, { type: 'CHOOSE', faction: C, choice: R[5] }).state;
  assert.equal(d2.regions[R[5]].influence[C], 3);
});
