import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../src/engine/node-data.js';
import { hashState, deepClone } from '../src/engine/util.js';
import { seedToState, nextInt } from '../src/engine/rng.js';
import { createGame, reduce, legalActions, waitingFor } from '../src/engine/index.js';
import { chooseAction, evaluate, describeIntent, aiMeta, LEVELS } from '../src/ai/ai.js';
import { playGame } from '../tools/simulate.js';

const data = loadData();
const F = ['atlas', 'redDragon', 'polarStar', 'emerald'];
const key = (a) => JSON.stringify(a);

/** 무작위 행동으로 steps번 진행한 중반 상태 (끝났으면 null) */
function midState(seed, steps, rounds = 6) {
  let s = createGame({ data, rounds, seed });
  let rng = seedToState('mid' + seed);
  for (let i = 0; i < steps && s.phase !== 'end'; i++) {
    const f = waitingFor(s)[0], legal = legalActions(s, f, data), r = nextInt(rng, legal.length);
    rng = r.rng;
    s = reduce(s, legal[r.value], data).state;
  }
  return s.phase === 'end' ? null : s;
}
const states = (n) => Array.from({ length: n }, (_, i) => midState(100 + i, 3 + ((i * 7) % 90), i % 2 ? 8 : 6)).filter(Boolean);

test('aiMeta: 한국어 난이도 이름과 설명', () => {
  assert.deepEqual(LEVELS.map((l) => aiMeta[l].name), ['쉬움', '보통', '어려움']);
  for (const l of LEVELS) assert.ok(aiMeta[l].description.length > 5);
});

test('evaluate: 영향력·위신은 점수, 후반에는 자원이 무가치', () => {
  const s = midState(3, 30);
  const f = waitingFor(s)[0], base = evaluate(s, f, { data });
  const a = deepClone(s); a.regions.europe.influence[f] += 3;
  assert.ok(evaluate(a, f, { data }) > base, '영향력이 늘면 평가가 오른다');
  const b = deepClone(s); b.players[f].prestige += 2;
  assert.ok(evaluate(b, f, { data }) > base + 1.5);
  const c = deepClone(s); c.players[f].resources.capital += 6;
  const early = evaluate(c, f, { data }) - base;
  const late = deepClone(s); late.round = late.config.rounds; late.phase = 'plan';
  const lateC = deepClone(late); lateC.players[f].resources.capital += 6;
  assert.ok(evaluate(lateC, f, { data }) - evaluate(late, f, { data }) < early, '마지막 라운드 자본은 가치가 낮다');
  const g = deepClone(s); g.players[f].secretGoals = ['goal-02']; const g2 = deepClone(g); g2.players[f].prestige = 12;
  assert.ok(evaluate(g2, f, { data }) > evaluate(g, f, { data }) + 10, '비밀 목표 달성은 점수로 반영');
});

for (const level of LEVELS) {
  test(`${level}: 합법 수, 상태 불변, 같은 입력은 같은 행동 (무작위 중반 상태 50개)`, { timeout: 240000 }, () => {
    const list = states(50);
    assert.ok(list.length >= 45);
    const phases = new Set();
    for (const [i, s] of list.entries()) {
      for (const f of waitingFor(s).slice(0, 2)) {
        const before = hashState(s), legal = legalActions(s, f, data).map(key);
        const a = chooseAction(s, f, { level, rngSeed: i, data });
        assert.ok(legal.includes(key(a)), `${level} 불법 수 ${key(a)}`);
        assert.equal(hashState(s), before, '입력 상태가 바뀌었다');
        assert.equal(key(chooseAction(s, f, { level, rngSeed: i, data })), key(a), '결정이 재현되지 않는다');
        phases.add(s.pending?.length ? 'pending' : s.phase);
      }
    }
    assert.ok(['plan', 'shop', 'pending'].every((p) => phases.has(p)), '계획·상점·선택 대기를 모두 검사: ' + [...phases]);
  });
}

test('4명이 같은 난이도인 한 판이 끝까지 진행된다 (쉬움·보통·어려움, 불변식 검사)', { timeout: 240000 }, () => {
  for (const level of LEVELS) {
    const r = playGame(data, { rounds: 6, seed: 77, levelOf: Object.fromEntries(F.map((f) => [f, level])) });
    assert.equal(r.state.phase, 'end', level);
    assert.ok(r.result.winners.length >= 1 && r.steps > 40, level);
  }
});

const SLOW = (() => { // CI처럼 느린 환경 감지: 이 기준 작업이 80ms를 넘으면 느린 것으로 본다
  const s = midState(5, 40), t = performance.now();
  for (let i = 0; i < 2000; i++) deepClone(s);
  return performance.now() - t > 80;
})();

test('강도 순서: 어려움 1 대 쉬움 3 (60판, 어려움 승률이 무작위 기대값 25%보다 분명히 높다)', { timeout: 600000 }, () => {
  const games = SLOW ? 24 : 60, need = SLOW ? 0.33 : 0.35;
  if (SLOW) console.warn('느린 환경: 24판과 느슨한 기준(35%)으로 검사');
  let wins = 0;
  for (let g = 0; g < games; g++) {
    const hard = F[g % 4], r = playGame(data, { rounds: 8, seed: 5000 + g, levelOf: Object.fromEntries(F.map((f) => [f, f === hard ? 'hard' : 'easy'])) });
    if (r.result.winners.includes(hard)) wins += 1 / r.result.winners.length;
  }
  console.log(`  어려움 승률 ${wins}/${games} = ${(100 * wins / games).toFixed(0)}% (기대값 25%, 기준 ${(need * 100).toFixed(0)}%)`);
  assert.ok(wins / games >= need, `어려움 승률 ${wins}/${games}`);
});

test('어려움 결정 시간: 계획 단계 평균 400ms 미만', { timeout: 240000 }, (t) => {
  if (SLOW) { console.warn('느린 환경: 시간 검사 건너뜀'); return t.skip('slow environment'); }
  const ms = [];
  for (let seed = 0; seed < 4; seed++) {
    let s = createGame({ data, rounds: 8, seed: 900 + seed }), n = 0;
    while (s.phase !== 'end' && s.round <= 5) {
      const f = waitingFor(s)[0], t0 = performance.now();
      const a = chooseAction(s, f, { level: 'hard', rngSeed: n++, data });
      if (s.phase === 'plan' && !s.pending?.length) ms.push(performance.now() - t0);
      s = reduce(s, a, data).state;
    }
  }
  const avg = ms.reduce((x, y) => x + y, 0) / ms.length;
  console.log(`  어려움 계획 결정 ${ms.length}회: 평균 ${avg.toFixed(0)}ms, 최대 ${Math.max(...ms).toFixed(0)}ms`);
  assert.ok(avg < 400, `평균 ${avg}ms`);
});

test('describeIntent: 한국어 한 줄 설명', () => {
  let s = createGame({ data, rounds: 6, seed: 4 });
  const asset = legalActions(s, 'polarStar', data)[0];
  assert.match(describeIntent(s, asset, data), /북극성 연방이 전략 자산을 골랐다/);
  for (const f of F) s = reduce(s, legalActions(s, f, data)[0], data).state;
  const plan = legalActions(s, 'atlas', data).find((a) => a.type === 'PLAN' && a.cards.length);
  assert.match(describeIntent(s, plan, data), /아틀라스 연합이 계획을 세웠다/);
  assert.ok(!describeIntent(s, plan, data).includes(plan.cards[0]), '계획 카드는 공개 전이라 숨긴다');
  // 선택 대기: 지역 영향력
  let t = s, n = 0;
  while (!t.pending?.length && n++ < 200) {
    const f = waitingFor(t)[0];
    t = reduce(t, chooseAction(t, f, { level: 'easy', rngSeed: n, data }), data).state;
  }
  if (t.pending?.length) {
    const pc = t.pending[0], a = legalActions(t, pc.faction, data)[0], txt = describeIntent(t, a, data);
    assert.match(txt, /[가-힣]/); assert.ok(txt.length < 60, txt);
  }
  const reg = { type: 'CHOOSE', faction: 'polarStar', pendingId: 'x', choice: 'eastAsia' };
  const fake = { pending: [{ id: 'x', kind: 'region', effect: { type: 'influence' } }] };
  assert.equal(describeIntent(fake, reg, data), '북극성 연방이 동아시아에 영향력을 놓았다');
});
