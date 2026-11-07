import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../src/engine/node-data.js';
import { randomCountries } from '../src/engine/index.js';
import { playGame } from '../tools/simulate.js';
import { tune } from '../src/ai/ai.js';

const data = loadData();
const levelOf = { atlas: 'hard', redDragon: 'normal', polarStar: 'normal', emerald: 'easy' };

test('M4 결정성: 같은 시드의 어려움 한 판은 같은 결과와 같은 행동 수', () => {
  const countries = randomCountries(data, 'm4');
  const a = playGame(data, { rounds: 6, seed: 4401, levelOf, countries }), b = playGame(data, { rounds: 6, seed: 4401, levelOf, countries });
  assert.deepEqual(a.result.scores, b.result.scores);
  assert.equal(a.steps, b.steps);
});

test('M4 퍼즈: 어려움 AI가 6·8·10라운드 30판을 합법 수만으로 끝낸다 (결정당 400ms 이내)', { timeout: 600000 }, () => {
  const T = { ms: 0, n: 0 };
  for (const rounds of [6, 8, 10]) {
    for (let g = 0; g < 10; g++) {
      const seed = 4500 + rounds * 100 + g;
      const r = playGame(data, { rounds, seed, levelOf, countries: randomCountries(data, seed) }); // 불가능한 행동이면 playGame이 던진다
      assert.equal(r.state.phase, 'end');
      assert.ok(r.steps < 4000);
      T.ms += r.timing.hard.ms; T.n += r.timing.hard.n;
    }
  }
  assert.ok(T.ms / T.n < 400, `어려움 결정당 평균 ${(T.ms / T.n).toFixed(0)}ms`);
});

test('M4 길이: 보통 AI 8라운드가 선택 감점으로 142회보다 확연히 짧다', { timeout: 120000 }, () => {
  assert.ok(tune.choiceCost >= 0.5);
  let n = 0, g = 0;
  for (; g < 6; g++) n += playGame(data, { rounds: 8, seed: 4600 + g, levelOf: { atlas: 'normal', redDragon: 'normal', polarStar: 'normal', emerald: 'normal' }, countries: randomCountries(data, 4600 + g) }).steps;
  assert.ok(n / g < 138, `평균 ${(n / g).toFixed(0)}회`);
});
