import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../src/engine/node-data.js';
import { createGame, randomCountries, validateInvariants } from '../src/engine/index.js';
import { computeIncome } from '../src/engine/income.js';
import { playGame } from '../tools/simulate.js';
import { hashState } from '../src/engine/util.js';

const data = loadData();
const F = ['atlas', 'redDragon', 'polarStar', 'emerald'];
const mk = (o = {}) => createGame({ data, rounds: 8, seed: 3, factions: F, ...o });

test('난이도 표: easy·normal·hard가 있고 모양이 올바르다', () => {
  assert.deepEqual(Object.keys(data.difficulty).sort(), ['easy', 'hard', 'normal']);
  for (const [k, d] of Object.entries(data.difficulty)) {
    assert.ok(d.name && d.line.startsWith(d.name), k);
    assert.ok(Array.isArray(d.income), k);
    for (const e of d.income) {
      assert.ok(['capital', 'energy', 'industry', 'prestige'].includes(e.res), k);
      assert.ok(Number.isInteger(e.amount) && e.amount !== 0, k);
      assert.ok((e.from ?? 1) <= (e.to ?? Infinity), k);
    }
  }
  assert.equal(data.difficulty.normal.income.length, 0);
  assert.ok(data.difficulty.hard.income.length > 0);
  assert.ok(data.difficulty.hard.income.every((e) => e.amount > 0));
});

test('어려움 보정은 컴퓨터 자리에만, 사람 자리·튜토리얼에는 없다', () => {
  const s = mk({ humanFaction: 'atlas', aiLevel: 'hard' }), base = mk({ humanFaction: 'atlas', aiLevel: 'normal' });
  assert.equal(s.config.difficulty.atlas, undefined);
  assert.deepEqual(computeIncome(s, 'atlas'), computeIncome(base, 'atlas'));
  for (const f of F.slice(1)) {
    const d = computeIncome(s, f), b = computeIncome(base, f);
    for (const e of data.difficulty.hard.income) assert.equal(d[e.res] - b[e.res], e.amount, f);
  }
  assert.equal(base.config.difficulty, undefined);
  const t = createGame({ data, rounds: 4, seed: 3, factions: F, humanFaction: 'atlas', tutorial: true, aiLevel: 'hard' });
  assert.equal(t.config.difficulty, undefined);
});

test('좌석별 난이도: seatLevels에 적힌 어려움 자리만 보정을 받는다', () => {
  const s = mk({ seatLevels: { atlas: 'hard', redDragon: 'normal', polarStar: 'normal', emerald: 'easy' } });
  assert.deepEqual(Object.keys(s.config.difficulty), ['atlas']);
});

test('보정 기간(from/to)과 결정성: 같은 시드는 같은 결과, 표는 상태에 복사된다', () => {
  const d = { ...data, difficulty: { ...data.difficulty, hard: { ...data.difficulty.hard, income: [{ res: 'capital', amount: 2, from: 2, to: 3 }] } } };
  const s = createGame({ data: d, rounds: 8, seed: 3, factions: F, aiLevel: 'hard' });
  const b = createGame({ data: d, rounds: 8, seed: 3, factions: F, aiLevel: 'normal' });
  const extra = (r) => computeIncome({ ...s, round: r }, 'atlas').capital - computeIncome({ ...b, round: r }, 'atlas').capital;
  assert.deepEqual([1, 2, 3, 4].map(extra), [0, 2, 2, 0]);
  assert.notEqual(s.config.difficulty.atlas, d.difficulty.hard.income);
  const lv = { atlas: 'hard', redDragon: 'normal', polarStar: 'normal', emerald: 'easy' };
  const run = () => playGame(data, { rounds: 6, seed: 77, levelOf: lv, countries: randomCountries(data, 'x') });
  assert.equal(hashState(run().state), hashState(run().state));
});

for (const level of ['easy', 'normal', 'hard']) {
  test(`퍼즈: ${level} 4명 10판이 끝까지 합법적으로 진행된다`, () => {
    const lv = Object.fromEntries(F.map((f) => [f, level]));
    for (let g = 0; g < 10; g++) {
      const r = playGame(data, { rounds: 6, seed: 900 + g, levelOf: lv, countries: randomCountries(data, `fz${level}:${g}`) });
      assert.equal(r.state.phase, 'end');
      assert.ok(validateInvariants(r.state));
      assert.ok(r.result.winners.length >= 1);
    }
  });
}
