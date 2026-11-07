// UI 스모크: DOM 없이 src/ui/loop.js로 한 판을 끝까지 돌린다 (사람 몫은 임시 자동 계획). 저장/이어하기 왕복과 손상 저장도 확인.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../src/engine/node-data.js';
import { validateInvariants, hashState } from '../src/engine/index.js';
import { createLoop, readSave, validSave, SAVE_KEY } from '../src/ui/loop.js';

const data = loadData();
const mockStorage = () => { const m = new Map(); return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, String(v)), removeItem: (k) => void m.delete(k) }; };
const ids = data.factions.map((f) => f.id);
const cfg = (rounds, extra = {}) => ({ rounds, factions: ids, humanFaction: 'polarStar', seed: 100 + rounds, aiLevel: 'normal', ...extra });

for (const rounds of [6, 8, 10]) {
  test(`${rounds}라운드 한 판: 끝까지 진행, 불변식, 저장 왕복`, async () => {
    const storage = mockStorage(), loop = createLoop({ data, storage });
    loop.start(cfg(rounds));
    assert.equal(loop.state.phase, 'setup');
    assert.equal(await loop.run(), 'human', '사람 차례에서 멈춘다');
    assert.ok(loop.humanWaiting());
    assert.equal(loop.state.players.polarStar.strategicAsset, null, '사람은 아직 고르지 않았다');
    let changes = 0, humanStops = 0; const unsub = loop.subscribe((s, k) => { if (k === 'state') { changes++; validateInvariants(s); } });
    for (let guard = 0; loop.state.phase !== 'end'; guard++) {
      assert.ok(guard < 400, '무한 루프');
      const why = await loop.run({ auto: false });
      if (why === 'end') break;
      assert.equal(why, 'human');
      humanStops++;
      assert.ok(loop.waiting().every((f) => f === 'polarStar'), '사람 차례에는 사람만 기다린다');
      assert.equal(loop.dispatch(loop.pick('polarStar')).ok, true); // 자동 계획(임시)과 같은 경로
      // 저장 왕복: 방금 저장된 상태를 읽으면 해시가 같다
      const saved = readSave(storage);
      assert.equal(hashState(saved.state), hashState(loop.state));
    }
    unsub();
    const s = loop.state;
    assert.equal(s.phase, 'end'); assert.equal(s.round, rounds);
    assert.equal(s.result.ranking.length, 4);
    assert.ok(s.result.scores[s.result.winner].total >= s.result.scores[s.result.ranking[3]].total);
    assert.ok(changes > rounds * 4 && humanStops > rounds, `단계 수 ${changes}, 사람 차례 ${humanStops}`);
    validateInvariants(s);
    // 끝난 판도 이어하기가 된다
    const again = createLoop({ data, storage }); again.load();
    assert.equal(hashState(again.state), hashState(s));
    assert.ok(loop.stats.maxStepMs < 400, `한 단계 ${loop.stats.maxStepMs.toFixed(0)}ms`);
  });
}

test('auto 모드: 사람 몫까지 대신 두어 한 판 완주 + 중간 저장에서 이어하기하면 같은 결과', async () => {
  const storage = mockStorage(), a = createLoop({ data, storage });
  a.start(cfg(6, { aiLevel: 'easy' }));
  // 2라운드가 되면 멈추고 저장을 복제해 둔다
  assert.equal(await a.run({ auto: true, untilRound: 3 }), 'limit');
  const mid = JSON.parse(storage.getItem(SAVE_KEY));
  assert.equal(hashState(mid.state), hashState(a.state));
  assert.equal(await a.run({ auto: true }), 'end');
  const st2 = mockStorage(); st2.setItem(SAVE_KEY, JSON.stringify(mid));
  const c = createLoop({ data, storage: st2 }); assert.ok(c.load());
  assert.equal(c.state.round, 3);
  assert.equal(await c.run({ auto: true }), 'end');
  assert.equal(hashState(c.state), hashState(a.state), '같은 저장에서 같은 결과 (결정적)');
});

test('손상된 저장은 null이고 지워진다', () => {
  const storage = mockStorage();
  for (const bad of ['', '{', 'null', '[]', '{"state":{}}', JSON.stringify({ state: { version: 1 } })]) {
    storage.setItem(SAVE_KEY, bad);
    assert.equal(readSave(storage), null, bad);
    assert.equal(storage.getItem(SAVE_KEY), null, '손상된 항목은 지운다');
  }
  assert.equal(validSave(null), false);
  const loop = createLoop({ data, storage });
  assert.equal(loop.load(), null);
  assert.equal(readSave({ getItem() { throw new Error('막힘'); } }), null);
});

test('저장소가 가득 차도 게임은 계속된다', async () => {
  const storage = { getItem: () => null, setItem() { throw new Error('quota'); }, removeItem() {} };
  const loop = createLoop({ data, storage });
  loop.start(cfg(6, { humanFaction: null }));
  assert.equal(await loop.run(), 'end');
  assert.match(loop.saveError, /quota/);
});

test('멈춤 요청 뒤에는 더 진행하지 않는다', async () => {
  const loop = createLoop({ data, storage: mockStorage() });
  loop.start(cfg(6));
  const p = loop.run({ auto: true, pace: 5 });
  await new Promise((r) => setTimeout(r, 40)); loop.stop();
  assert.equal(await p, 'stopped');
  const h = hashState(loop.state);
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(hashState(loop.state), h);
});
