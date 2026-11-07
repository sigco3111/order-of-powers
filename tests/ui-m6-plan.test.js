// M6-1: 해결 때 두 번째 질문(피해 세력 · 기지 지역 · 추가 지불 · 버릴 카드 · 무시할 지역)도 계획 단계에서 묻고, 해결 때는 묻지 않는다
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../src/engine/node-data.js';
import { createGame } from '../src/engine/index.js';
import { createLoop } from '../src/ui/loop.js';
import { planSteps, stepDone, blockReason, missingChoices, missingRegions, prePicks, preState, takePre } from '../src/ui/plan-model.js';

const data = loadData(), ids = data.factions.map((f) => f.id), F = 'polarStar', OPP = ids.filter((x) => x !== F);
const cfg = { rounds: 6, factions: ids, humanFaction: F, seed: 11, aiLevel: 'normal' };
const card = (id) => data.cards.find((c) => c.id === id);
const fresh = () => structuredClone(createGame({ data, ...cfg }));
const keys = (c, s, picks, planned) => planSteps(card(c), s, F, picks, planned).map((x) => x.key);
const RID = Object.keys(fresh().regions);
const mock = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, String(v)), removeItem: (k) => void m.delete(k) }; };

test('피해 세력: 고른 지역에 상대가 둘 이상일 때만 묻는다 (dip-09 · mil-09 · mil-10 · mil-12)', () => {
  const s = fresh(); for (const r of RID) for (const o of OPP) s.regions[r].influence[o] = 0;
  s.regions[RID[0]].influence[OPP[0]] = 2; s.regions[RID[0]].influence[OPP[1]] = 1; s.regions[RID[1]].influence[OPP[2]] = 1;
  for (const c of ['dip-09', 'mil-09', 'mil-10', 'mil-12']) {
    assert.deepEqual(keys(c, s, {}), ['region'], `${c}: 지역을 고르기 전엔 지역 단계뿐`);
    assert.deepEqual(keys(c, s, { region: RID[0] }), ['region', 'victim'], c);
    assert.deepEqual(keys(c, s, { region: RID[1] }), ['region'], `${c}: 상대가 하나면 묻지 않는다`);
    const v = planSteps(card(c), s, F, { region: RID[0] }).find((x) => x.key === 'victim');
    assert.deepEqual(v.options.slice().sort(), [OPP[0], OPP[1]].sort());
    assert.equal(stepDone(v, { victim: OPP[0] }), true); assert.equal(stepDone(v, { victim: OPP[2] }), false);
    assert.equal(blockReason([{ card: card(c), region: RID[0] }], s, F) != null, true, `${c}: 피해 세력이 비면 확정 불가`);
    assert.equal(blockReason([{ card: card(c), region: RID[0], victim: OPP[1] }], s, F), null);
  }
});

test('기지 지역: 고른 세력의 기지가 두 곳 이상일 때만 (mil-14), 세력이 하나뿐이어도 단계가 생긴다', () => {
  const s = fresh(); for (const r of RID) for (const o of OPP) s.regions[r].bases[o] = 0;
  s.regions[RID[0]].bases[OPP[0]] = 1; s.regions[RID[1]].bases[OPP[0]] = 1; s.regions[RID[2]].bases[OPP[1]] = 1;
  assert.deepEqual(keys('mil-14', s, {}), ['target']);
  assert.deepEqual(keys('mil-14', s, { target: OPP[0] }), ['target', 'baseRegion']);
  assert.deepEqual(keys('mil-14', s, { target: OPP[1] }), ['target']);
  s.regions[RID[2]].bases[OPP[1]] = 0;
  assert.deepEqual(keys('mil-14', s, {}), ['baseRegion'], '상대가 하나뿐이면 세력은 묻지 않고 기지 지역만');
});

test('추가 지불(dip-03): 먼저 예/아니오, 아니오면 지역은 묻지 않는다', () => {
  const s = fresh();
  assert.deepEqual(keys('dip-03', s, {}), ['pay', 'region']);
  assert.deepEqual(keys('dip-03', s, { pay: false }), ['pay']);
  const st = planSteps(card('dip-03'), s, F, { pay: false });
  assert.equal(stepDone(st[0], { pay: false }), true, 'false도 채워진 값');
  assert.equal(blockReason([{ card: card('dip-03'), pay: false }], s, F), null);
  assert.notEqual(blockReason([{ card: card('dip-03'), pay: true }], s, F), null);
  assert.equal(missingRegions([{ card: card('dip-03'), pay: false }], s, F).length, 0);
  const pre = prePicks([{ card: card('dip-03'), pay: false }], s, F);
  assert.deepEqual(pre['dip-03'], [{ kind: 'confirm', v: false }]);
  assert.equal(preState(pre, { kind: 'confirm', stage: 'confirm', options: [true, false], ctx: { cardId: 'dip-03' } }), 'ok');
  assert.equal(takePre(pre, { kind: 'confirm', stage: 'confirm', options: [true, false], ctx: { cardId: 'dip-03' } }), false);
});

test('버릴 카드(neu-01): 계획에 넣은 다른 카드는 후보에서 빠진다', () => {
  const s = fresh(), hand = ['neu-01', 'dom-02', 'dom-02', 'dom-04', 'dom-01']; s.players[F].hand = hand;
  const st = planSteps(card('neu-01'), s, F, {}, ['neu-01', 'dom-04']).find((x) => x.key === 'drop');
  assert.deepEqual(st.options.slice().sort(), ['dom-01', 'dom-02']);
  const slots = [{ card: card('neu-01'), drop: 'dom-04' }, { card: card('dom-04') }];
  assert.equal(missingChoices(slots, s, F).length, 1, '다른 칸에 넣은 카드를 버리려 하면 다시 고르게 한다');
  assert.equal(missingChoices([{ card: card('neu-01'), drop: 'dom-02' }, { card: card('dom-04') }], s, F).length, 0);
  const pre = prePicks([{ card: card('neu-01'), drop: 'dom-02' }], s, F);
  assert.deepEqual(pre['neu-01'], [{ kind: 'card', v: 'dom-02' }]);
});

test('무시할 지역(dom-15): 사건으로 잃은 지역이 둘 이상일 때만', () => {
  const s = fresh();
  assert.deepEqual(keys('dom-15', s, {}), []);
  s.eventLosses = [{ f: F, region: RID[0], amount: 1 }, { f: OPP[0], region: RID[1], amount: 1 }];
  assert.deepEqual(keys('dom-15', s, {}), [], '내 손실이 한 곳뿐이면 엔진이 묻지 않는다');
  s.eventLosses.push({ f: F, region: RID[3], amount: 1 });
  assert.deepEqual(keys('dom-15', s, {}), ['ignore']);
  assert.deepEqual(prePicks([{ card: card('dom-15'), ignore: RID[3] }], s, F)['dom-15'], [{ kind: 'region', stage: 'ignore', v: RID[3] }]);
});

async function toPlan(loop) {
  loop.start(cfg); await loop.run(); loop.dispatch(loop.pick(F));
  while (loop.state.phase !== 'plan' || !loop.humanWaiting()) { assert.ok(['human', 'end'].includes(await loop.run())); if (!loop.humanWaiting() || loop.state.phase === 'plan') break; loop.dispatch(loop.pick(F)); }
}

test('해결 단계: 계획 때 모두 고르면 사람 카드가 한 번도 묻지 않는다 (피해 세력 · 기지 지역 · 지불 · 버릴 카드 · 폭격기 지역)', async () => {
  const storage = mock(), loop = createLoop({ data, storage });
  await toPlan(loop);
  const s = loop.state, hand = ['mil-10', 'mil-12', 'mil-14', 'dip-03', 'neu-01'];
  s.players[F].hand = hand.concat(['dom-01', 'dom-04']); s.players[F].resources.capital = 9;
  for (const r of Object.keys(s.regions)) for (const o of OPP) { s.regions[r].influence[o] = 0; s.regions[r].bases[o] = 0; }
  const [r0, r1, r2] = Object.keys(s.regions);
  for (const o of OPP) { s.regions[r0].influence[o] = 2; s.regions[r1].influence[o] = 2; }
  s.regions[r2].bases[OPP[0]] = 1; s.regions[r0].bases[OPP[0]] = 1; s.regions[r1].bases[OPP[1]] = 1;
  loop.persist();
  const picks = { 'mil-10': { region: r0, victim: OPP[0] }, 'mil-12': { region: r1, victim: OPP[1] }, 'mil-14': { target: OPP[0], baseRegion: r2 }, 'dip-03': { pay: true, region: r2 }, 'neu-01': { drop: 'dom-04' } };
  const slots = hand.slice(0, 3).map((id) => ({ card: card(id), ...picks[id] })); // 칸은 3개
  assert.equal(blockReason(slots, s, F), null, String(blockReason(slots, s, F)));
  const plan = hand.slice(0, 3);
  loop.ui.pre = { round: s.round, q: prePicks(slots, s, F) };
  assert.deepEqual(loop.ui.pre.q['mil-10'].map((e) => e.kind + '/' + (e.stage || '')), ['region/', 'faction/victim']);
  assert.equal(loop.submit({ type: 'PLAN', faction: F, cards: plan }).ok, true);
  const re = createLoop({ data, storage }); assert.ok(re.load()); // 새로고침
  const asked = [], answered = [];
  for (let g = 0; g < 60 && re.state.phase !== 'shop' && re.state.round === s.round; g++) {
    const why = await re.run(), pc = re.state.pending?.[0];
    if (why === 'human' && pc && pc.faction === F) {
      const v = takePre(re.ui.pre.q, pc);
      if (v === undefined) { asked.push(`${pc.ctx?.cardId}/${pc.stage}`); break; }
      answered.push(`${pc.ctx.cardId}/${pc.stage}`);
      assert.equal(re.submit({ type: 'CHOOSE', faction: F, pendingId: pc.id, choice: v }).ok, true);
    } else if (why === 'human') break;
  }
  assert.deepEqual(asked, [], `해결 때 물은 질문: ${asked}`);
  for (const k of ['mil-10/region', 'mil-10/victim', 'mil-12/region', 'mil-12/victim', 'mil-14/baseRegion']) assert.ok(answered.includes(k), `${k} 자동 응답: ${answered}`);
});

test('계획 뒤 후보가 사라지면 stale — 직접 다시 고르게 된다 (preState)', () => {
  const s = fresh(); for (const r of RID) for (const o of OPP) s.regions[r].influence[o] = 0;
  s.regions[RID[0]].influence[OPP[0]] = 1; s.regions[RID[0]].influence[OPP[1]] = 1;
  const pre = prePicks([{ card: card('mil-10'), region: RID[0], victim: OPP[0] }], s, F);
  const pc = { kind: 'faction', stage: 'victim', options: [OPP[1]], ctx: { cardId: 'mil-10' } };
  assert.equal(preState(pre, pc), 'stale'); assert.equal(takePre(pre, pc), undefined);
});
