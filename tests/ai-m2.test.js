import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../src/engine/node-data.js';
import { createGame, reduce, legalActions, waitingFor } from '../src/engine/index.js';
import { chooseAction } from '../src/ai/ai.js';
import { playGame } from '../tools/simulate.js';
import { deepClone } from '../src/engine/util.js';

const data = loadData();
const F = ['atlas', 'redDragon', 'polarStar', 'emerald'];
const key = (a) => JSON.stringify(a);

/** 첫 상점 단계까지 보통 AI로 진행 */
function toShop(seed, rounds = 6) {
  let s = createGame({ data, rounds, seed });
  for (let i = 0; i < 400 && s.phase !== 'shop'; i++) {
    const f = waitingFor(s)[0];
    s = reduce(s, chooseAction(s, f, { level: 'easy', rngSeed: i, data }), data).state;
  }
  return s;
}

test('M2 구매: 같은 시드는 같은 선택, 여러 판에서 다양한 카드', () => {
  for (const level of ['normal', 'hard']) {
    const picks = new Set();
    for (let g = 5; g < 11; g++) {
      const s = toShop(g), f = waitingFor(s)[0];
      s.players[f].resources.capital = 12;
      assert.equal(key(chooseAction(s, f, { level, rngSeed: 3, data })), key(chooseAction(s, f, { level, rngSeed: 3, data })));
      for (let i = 0; i < 12; i++) { const a = chooseAction(s, f, { level, rngSeed: i, data }); picks.add(a.type + (a.cardId ?? '')); }
    }
    assert.ok(picks.size >= 3, `${level}: 다양한 구매가 나와야 한다 (${picks.size})`);
  }
});

test('M2 구매: 이미 많이 가진 카드는 반복 구매를 덜 한다', () => {
  const s = toShop(6), f = waitingFor(s)[0], p = s.players[f];
  p.resources.capital = 12;
  const buys = legalActions(s, f, data).filter((a) => a.type === 'BUY' && data.cards.some((c) => c.id === a.cardId));
  if (buys.length < 2) return;
  const id = buys[0].cardId, count = (st) => { let n = 0; for (let i = 0; i < 60; i++) { const a = chooseAction(st, f, { level: 'normal', rngSeed: i, data }); if (a.type === 'BUY' && a.cardId === id) n++; } return n; };
  const fresh = count(s), dup = deepClone(s);
  dup.players[f].collection[id] = 4;
  assert.ok(count(dup) <= fresh, '중복 보유 카드는 덜 선택된다');
});

test('M2 퍼즈: 50판이 합법 수만으로 끝난다 (난이도·라운드 섞기)', { timeout: 280000 }, () => {
  const L = ['easy', 'normal', 'hard'];
  for (let g = 0; g < 50; g++) {
    const levelOf = Object.fromEntries(F.map((f, i) => [f, i === 0 && g % 3 === 0 ? 'hard' : L[(g + i) % 2]])); // 쉬움·보통 위주, 어려움은 3판에 1번 한 자리
    const r = playGame(data, { rounds: 6, seed: 7000 + g, levelOf });
    assert.equal(r.state.phase, 'end');
    assert.ok(r.steps < 4000);
  }
});

test('M2 결정성: 같은 시드의 한 판은 같은 결과', () => {
  const levelOf = { atlas: 'hard', redDragon: 'normal', polarStar: 'normal', emerald: 'easy' };
  const a = playGame(data, { rounds: 6, seed: 77, levelOf }), b = playGame(data, { rounds: 6, seed: 77, levelOf });
  assert.deepEqual(a.result.scores, b.result.scores);
  assert.equal(a.steps, b.steps);
});
