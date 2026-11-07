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

// ── 스크립트된 사람: UI와 같은 경로(loop.submit = 합법 검사 + dispatch)로 무작위 합법 행동을 낸다 ──
import { planSlotsOf } from '../src/engine/state.js';
import { seedToState, nextInt } from '../src/engine/rng.js';

function scriptedHuman(seed) {
  let rng = seedToState(seed);
  const pick = (n) => { const r = nextInt(rng, n); rng = r.rng; return r.value; };
  return {
    pick,
    /** 지금 사람 차례에 UI가 낼 만한 행동 하나 */
    next(state, loop) {
      const me = state.config.humanFaction, p = state.players[me], pc = state.pending?.[0];
      if (pc) {
        const o = pc.options;
        if (pc.kind === 'regionPair') { const a = pick(o.length), b = (a + 1 + pick(o.length - 1)) % o.length; return { type: 'CHOOSE', faction: me, pendingId: pc.id, choice: [o[a], o[b]] }; } // 순서가 뒤바뀐 쌍도 받아야 한다
        if (pc.kind === 'confirm') return { type: 'CHOOSE', faction: me, pendingId: pc.id, choice: pick(2) === 0 };
        return { type: 'CHOOSE', faction: me, pendingId: pc.id, choice: o[pick(o.length)] };
      }
      switch (state.phase) {
        case 'setup': return { type: 'PICK_ASSET', faction: me, assetId: p.assetOptions[pick(p.assetOptions.length)] };
        case 'plan': {
          if (p.strategicAsset && !p.usedAsset && pick(5) === 0) return { type: 'USE_ASSET', faction: me };
          if (pick(8) === 0) return { type: 'SKIP_PLAN', faction: me };
          const slots = planSlotsOf(state, me), hand = p.hand.slice(), cards = [];
          for (let n = pick(slots + 1); n > 0 && hand.length; n--) cards.push(hand.splice(pick(hand.length), 1)[0]);
          return { type: 'PLAN', faction: me, cards };
        }
        case 'shop': return pick(3) === 0 ? { type: 'END_SHOP', faction: me } : loop.pick(me);
        default: return null;
      }
    },
  };
}

for (const rounds of [6, 8, 10]) {
  test(`스크립트된 사람 ${rounds}라운드: submit 경로로 PLAN/CHOOSE/USE_ASSET/SKIP_PLAN, 선택 대기 중 저장`, async () => {
    const storage = mockStorage(), loop = createLoop({ data, storage }), hu = scriptedHuman(`h${rounds}`);
    loop.start(cfg(rounds, { seed: 700 + rounds }));
    const seen = { PLAN: 0, SKIP_PLAN: 0, CHOOSE: 0, USE_ASSET: 0, PICK_ASSET: 0, pendingSaves: 0, rejected: 0 };
    for (let guard = 0; guard < 1500; guard++) {
      const why = await loop.run({ auto: false });
      if (why === 'end') break;
      assert.equal(why, 'human');
      const s = loop.state, me = s.config.humanFaction;
      assert.deepEqual(loop.waiting(), [me]);
      // 형식이 틀린 행동은 UI 검사에서 거절된다 (상태는 그대로)
      const before = hashState(s);
      const bad = s.pending?.length ? { type: 'CHOOSE', faction: me, pendingId: s.pending[0].id, choice: 'nowhere' }
        : s.phase === 'plan' ? { type: 'PLAN', faction: me, cards: ['no-such-card'] } : { type: 'PLAN', faction: me, cards: [] };
      if (s.pending?.length || s.phase === 'plan' || s.phase === 'shop') { assert.equal(loop.submit(bad).ok, false); seen.rejected++; }
      assert.equal(loop.submit({ type: 'PLAN', faction: 'nobody', cards: [] }).ok, false);
      assert.equal(hashState(loop.state), before);
      const a = hu.next(s, loop);
      assert.ok(a, `${s.phase}에서 낼 행동이 없다`);
      const r = loop.submit(a);
      assert.equal(r.ok, true, `${JSON.stringify(a)} → ${r.reason}`);
      seen[a.type] = (seen[a.type] || 0) + 1;
      validateInvariants(loop.state);
      const sv = readSave(storage);
      assert.equal(hashState(sv.state), hashState(loop.state), '매 행동 뒤 자동 저장');
      if (loop.state.pending?.length && loop.state.pending[0].faction === me) { // 선택 대기 중 저장 → 불러오기
        seen.pendingSaves++;
        const again = createLoop({ data, storage }); again.load();
        assert.deepEqual(again.state.pending, loop.state.pending);
        assert.deepEqual(again.waiting(), [me]);
      }
    }
    const s = loop.state;
    assert.equal(s.phase, 'end'); assert.equal(s.round, rounds);
    assert.equal(s.result.ranking.length, 4);
    assert.ok(seen.PLAN + seen.SKIP_PLAN >= rounds - 1, JSON.stringify(seen));
    assert.ok(seen.CHOOSE > 0 && seen.PICK_ASSET === 1 && seen.rejected > rounds, JSON.stringify(seen));
    assert.ok(seen.pendingSaves > 0, '선택 대기 중 저장을 한 번도 못 봤다: ' + JSON.stringify(seen));
  });
}

test('사람 행동 검사: 슬롯 초과·없는 카드·순서 뒤바뀐 지역 쌍', () => {
  const loop = createLoop({ data, storage: mockStorage() });
  loop.start(cfg(6));
  const run = async () => { await loop.run(); };
  return run().then(() => {
    const me = 'polarStar', s0 = loop.state;
    assert.equal(loop.submit({ type: 'PICK_ASSET', faction: me, assetId: 'nope' }).ok, false);
    assert.equal(loop.submit({ type: 'PICK_ASSET', faction: me, assetId: s0.players[me].assetOptions[0] }).ok, true);
    return loop.run().then(() => {
      const s = loop.state, hand = s.players[me].hand, slots = planSlotsOf(s, me);
      assert.equal(loop.submit({ type: 'PLAN', faction: me, cards: Array(slots + 1).fill(hand[0]) }).ok, false, '슬롯보다 많이');
      assert.equal(loop.submit({ type: 'PLAN', faction: me, cards: ['ghost'] }).ok, false, '없는 카드');
      assert.equal(loop.submit({ type: 'PLAN', faction: me, cards: hand.slice(0, slots) }).ok, true);
      assert.equal(loop.submit({ type: 'PLAN', faction: me, cards: [] }).ok, false, '이미 제출');
    });
  });
});
