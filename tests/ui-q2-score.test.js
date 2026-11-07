// Q2-2: 보드 머리 점수 합계 == 점수 엔진 합계
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../src/engine/node-data.js';
import { finalScores } from '../src/engine/score.js';
import { createLoop } from '../src/ui/loop.js';
import { scoreLine } from '../src/ui/score-view.js';

const data = loadData();
const storage = { getItem: () => null, setItem() {}, removeItem() {} };
const ids = data.factions.map((f) => f.id);

test('게임 중: 합계 = 엔진 합계에서 비밀 목표를 뺀 값, 문구는 "지역 · 위신 · 합계"', async () => {
  const loop = createLoop({ data, storage });
  loop.start({ rounds: 6, factions: ids, humanFaction: 'polarStar', seed: 7, aiLevel: 'normal' });
  for (let n = 0; n < 40 && loop.state.phase !== 'end'; n++) {
    await loop.run({ auto: true, untilRound: loop.state.round + 1 });
    const s = loop.state;
    if (s.phase === 'end') break;
    const eng = finalScores(s, data).scores;
    for (const f of ids) {
      const v = scoreLine(s, f, data);
      assert.equal(v.total, eng[f].total - eng[f].goalPoints, `${f} R${s.round}`);
      assert.equal(v.text, `지역 ${eng[f].regions} · 위신 ${eng[f].prestige} · 합계 ${v.total}`);
      assert.equal(v.settled, false);
    }
  }
});

test('종료 뒤: 합계 = 결과 화면(엔진) 합계, 비밀 목표 포함', async () => {
  const loop = createLoop({ data, storage });
  loop.start({ rounds: 6, factions: ids, humanFaction: 'polarStar', seed: 11, aiLevel: 'normal' });
  await loop.run({ auto: true });
  const s = loop.state;
  assert.equal(s.phase, 'end');
  const eng = finalScores(s, data).scores;
  for (const f of ids) {
    const v = scoreLine(s, f, data);
    assert.equal(v.total, eng[f].total); assert.equal(v.total, s.result.scores[f].total);
    assert.equal(v.total, v.regions + v.prestige + v.goal); assert.ok(v.settled && v.text.includes('비밀 목표'));
  }
});
