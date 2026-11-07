// F1-1: 계획 때 미리 고른 지역·대상이 저장에 들어가 새로고침 뒤에도 해결 때 다시 묻지 않는다 + 두 곳/대상 세력 카드는 계획 단계에서 묻는다
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../src/engine/node-data.js';
import { createGame } from '../src/engine/index.js';
import { createLoop, SAVE_KEY } from '../src/ui/loop.js';
import { planSteps, stepDone, blockReason, missingChoices, prePicks, preState, takePre, BLOCK_TARGET } from '../src/ui/plan-model.js';

const data = loadData(), ids = data.factions.map((f) => f.id), F = 'polarStar';
const cfg = { rounds: 6, factions: ids, humanFaction: F, seed: 11, aiLevel: 'normal' };
const state = createGame({ data, ...cfg });
const card = (id) => data.cards.find((c) => c.id === id);
const mock = () => { const m = new Map(); return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, String(v)), removeItem: (k) => void m.delete(k) }; };

test('두 곳 카드(dip-14)는 계획에서 지역 두 곳을 묻고, 서로 다른 두 곳이어야 채워진다', () => {
  const st = planSteps(card('dip-14'), state, F);
  assert.deepEqual(st.map((x) => x.kind), ['regionPair']);
  const [a, b] = st[0].options;
  assert.equal(stepDone(st[0], { pair: [a, b] }), true);
  assert.equal(stepDone(st[0], { pair: [a, a] }), false);
  assert.equal(stepDone(st[0], { pair: [a] }), false);
  assert.equal(blockReason([{ card: card('dip-14') }], state, F), BLOCK_TARGET);
  assert.equal(blockReason([{ card: card('dip-14'), pair: [a, b] }], state, F), null);
});

test('대상 세력 카드는 상대 세력 단계를 가진다 (조약은 조약 없는 상대만)', () => {
  for (const id of ['dip-05', 'dip-06', 'dip-07', 'dip-08', 'dip-15', 'mil-08']) {
    const st = planSteps(card(id), state, F);
    assert.deepEqual(st.map((x) => x.kind), ['faction'], id);
    assert.ok(st[0].options.length === 3 && !st[0].options.includes(F), id);
  }
  const t = structuredClone(state); t.treaties = [[F, t.turnOrder.find((x) => x !== F)]];
  assert.equal(planSteps(card('dip-06'), t, F)[0].options.length, 2);
  assert.deepEqual(planSteps(card('mil-14'), state, F), [], '기지가 있는 상대가 없으면 묻지 않는다');
  assert.deepEqual(planSteps(card('neu-01'), state, F), []);
  assert.equal(missingChoices([{ card: card('dip-06') }], state, F).length, 1);
});

test('prePicks → takePre: 단계가 맞는 질문에만 한 번씩 답한다', () => {
  const [a, b] = Object.keys(state.regions);
  const pre = prePicks([{ card: card('dip-14'), pair: [a, b] }, { card: card('dip-05'), target: 'atlas' }], state, F);
  assert.deepEqual(pre['dip-14'], [{ kind: 'regionPair', v: [a, b] }]);
  const pc = { kind: 'regionPair', stage: 'pair', options: Object.keys(state.regions), ctx: { cardId: 'dip-14' } };
  assert.equal(preState(pre, { ...pc, stage: 'x' }), null);
  assert.deepEqual(takePre(pre, pc), [a, b]);
  assert.equal(takePre(pre, pc), undefined, '한 번만');
  const fc = { kind: 'faction', stage: 'target', options: ['redDragon'], ctx: { cardId: 'dip-05' } };
  assert.equal(preState(pre, fc), 'stale'); assert.equal(takePre(pre, fc), undefined);
});

async function toPlan(loop) {
  loop.start(cfg);
  await loop.run();
  loop.dispatch(loop.pick(F)); // 전략 자산
  while (loop.state.phase !== 'plan' || !loop.humanWaiting()) { assert.ok(['human', 'end'].includes(await loop.run())); if (!loop.humanWaiting()) break; if (loop.state.phase === 'plan') break; loop.dispatch(loop.pick(F)); }
}

test('계획 확정 뒤 새로고침해도 미리 고른 선택으로 해결된다 (저장 oop-save-v1)', async () => {
  const storage = mock(), loop = createLoop({ data, storage });
  await toPlan(loop);
  const s = loop.state, hand = ['dip-14', 'dip-06', 'dip-05'];
  s.players[F].hand = hand.slice(); loop.persist();
  const rids = Object.keys(s.regions), opp = s.turnOrder.filter((x) => x !== F);
  const picks = { 'dip-14': { pair: [rids[2], rids[5]] }, 'dip-06': { target: opp[1] }, 'dip-05': { target: opp[2] } };
  const slots = hand.map((id) => ({ card: card(id), ...picks[id] }));
  assert.equal(blockReason(slots, s, F), null);
  loop.ui.pre = { round: s.round, q: prePicks(slots, s, F) };
  assert.equal(loop.submit({ type: 'PLAN', faction: F, cards: hand }).ok, true);
  const saved = JSON.parse(storage.getItem(SAVE_KEY));
  assert.equal(saved.ui.pre.round, s.round); assert.equal(saved.ui.pre.q['dip-14'][0].v.join(), picks['dip-14'].pair.join());

  const re = createLoop({ data, storage }); // 새로고침
  assert.ok(re.load());
  const answered = [];
  for (let g = 0; g < 40 && re.state.phase !== 'shop' && re.state.round === s.round; g++) {
    const why = await re.run();
    const pc = re.state.pending?.[0];
    if (why === 'human' && pc && pc.faction === F) {
      const v = takePre(re.ui.pre.q, pc);
      assert.notEqual(v, undefined, `해결 때 묻는 질문이 없어야 함: ${pc.kind}/${pc.stage}/${pc.ctx?.cardId}`);
      answered.push(pc.ctx.cardId);
      assert.equal(re.submit({ type: 'CHOOSE', faction: F, pendingId: pc.id, choice: v }).ok, true);
      const again = JSON.parse(storage.getItem(SAVE_KEY)); // 쓴 값은 저장에서도 빠진다
      assert.ok(!(again.ui.pre.q[pc.ctx.cardId] || []).some((e) => e.kind === pc.kind));
    } else if (why === 'human') break;
  }
  assert.ok(answered.includes('dip-14') && answered.includes('dip-06') && answered.includes('dip-05'), `자동 응답: ${answered}`);
  assert.equal(re.state.pending?.[0]?.faction === F, false);
});
