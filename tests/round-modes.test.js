import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../src/engine/node-data.js';
import { createGame, randomCountries, validateInvariants } from '../src/engine/index.js';
import { computeIncome } from '../src/engine/income.js';
import { playGame } from '../tools/simulate.js';
import { hashState } from '../src/engine/util.js';

const data = loadData();
const F = ['atlas', 'redDragon', 'polarStar', 'emerald'];
const level = Object.fromEntries(F.map((f) => [f, 'easy']));

test('M3 라운드별 표: 6·8·10이 있고 항목이 올바르다', () => {
  assert.deepEqual(Object.keys(data.roundModes).sort(), ['10', '6', '8']);
  for (const [r, m] of Object.entries(data.roundModes)) {
    assert.match(m.line, new RegExp(`^${r}라운드: `));
    assert.ok(m.name);
    for (const [f, list] of Object.entries(m.income)) {
      assert.ok(F.includes(f), f);
      for (const e of list) {
        assert.ok(['capital', 'energy', 'industry', 'prestige'].includes(e.res), e.res);
        assert.ok(Number.isInteger(e.amount) && Math.abs(e.amount) <= 2);
        assert.ok(!e.from || (e.from >= 1 && e.from <= +r));
      }
    }
  }
});

test('M3 표는 상태 설정에 복사되고 같은 시드는 같은 판이 된다', () => {
  for (const rounds of [6, 8, 10]) {
    const a = createGame({ data, rounds, seed: 5 }), b = createGame({ data, rounds, seed: 5 });
    assert.deepEqual(a.config.roundMode, data.roundModes[rounds]);
    assert.notEqual(a.config.roundMode, data.roundModes[rounds]);
    assert.equal(hashState(a), hashState(b));
  }
});

test('M3 수입 보정: 표에 적힌 만큼 정해진 라운드에만 더해진다', () => {
  const d = { ...data, roundModes: { ...data.roundModes, 6: { name: 't', line: '6라운드: t', income: { emerald: [{ res: 'capital', amount: 1, from: 2, to: 3 }], atlas: [{ res: 'prestige', amount: 1 }] } } } };
  const s = createGame({ data: d, rounds: 6, seed: 1 }), base = createGame({ data: { ...d, roundModes: {} }, rounds: 6, seed: 1 });
  for (const round of [1, 2, 3, 4]) {
    const x = { ...s, round }, y = { ...base, round };
    const want = round >= 2 && round <= 3 ? 1 : 0;
    assert.equal(computeIncome(x, 'emerald').capital - computeIncome(y, 'emerald').capital, want);
    assert.equal(computeIncome(x, 'atlas').prestige - computeIncome(y, 'atlas').prestige, 1);
    assert.equal(computeIncome(x, 'redDragon').capital, computeIncome(y, 'redDragon').capital);
  }
});

test('M3 퍼즈: 6·8·10라운드 각 20판이 무작위 국가로 오류 없이 끝나고 결정적이다', { timeout: 280000 }, () => {
  for (const rounds of [6, 8, 10]) {
    for (let g = 0; g < 20; g++) {
      const seed = 9000 + g, countries = randomCountries(data, seed);
      const r = playGame(data, { rounds, seed, levelOf: level, countries });
      assert.equal(r.state.phase, 'end');
      assert.equal(r.state.round, rounds);
      validateInvariants(r.state);
      assert.ok(r.result.winners.length >= 1);
      if (g < 2) assert.equal(hashState(playGame(data, { rounds, seed, levelOf: level, countries }).state), hashState(r.state));
    }
  }
});
