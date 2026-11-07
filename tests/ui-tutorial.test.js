// 튜토리얼 코어: 단계표, 가드, 처음부터 끝까지 스크립트 진행(디스패치 계층), 저장에서 이어하기. DOM 없음.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../src/engine/node-data.js';
import { SAVE_KEY } from '../src/ui/loop.js';
import { shopView } from '../src/ui/shop-model.js';
import { readMeta, readRecords, ACHIEVEMENTS } from '../src/ui/records.js';
import { STEPS, TUT_CONFIG, TUT_KEY, HINT_KEY, ME, CARD, createTutorial, readProgress, hasProgress, resumeStep } from '../src/ui/tutorial.js';

const data = loadData();
const mock = () => { const m = new Map(); return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, String(v)), removeItem: (k) => void m.delete(k) }; };
const fresh = async () => { const storage = mock(), core = createTutorial({ data, storage }); await core.start(); await core.loop.run(); return { storage, core, loop: core.loop }; };
const chooseAll = (loop) => { for (let n = 0; n < 5 && loop.state.pending?.[0]?.faction === ME; n++) { const pc = loop.state.pending[0]; assert.equal(loop.submit({ type: 'CHOOSE', faction: ME, pendingId: pc.id, choice: pc.kind === 'regionPair' ? pc.options.slice(0, 2) : pc.options[0] }).ok, true); } };
const toPlanStep = (core) => { while (core.step < 5) assert.ok(core.next()); core.flag('placed'); core.flag('region'); assert.equal(core.cur.id, 8); };

test('단계표: 14단계, 대상 선택자와 문구가 있다', () => {
  assert.equal(STEPS.length, 14);
  STEPS.forEach((s, i) => {
    assert.equal(s.id, i + 1);
    for (const k of ['title', 'text', 'target']) { assert.equal(typeof s[k], 'string', `${s.id}.${k}`); assert.ok(s[k].length > 0); assert.ok(!/undefined|null|\[object/.test(s[k]), `${s.id}.${k}`); }
    assert.ok(['info', 'action'].includes(s.kind)); assert.equal(typeof s.ready, 'function');
    if (s.kind === 'action') { assert.equal(typeof s.done, 'function'); assert.ok(s.ask && !/undefined/.test(s.ask)); }
  });
  assert.deepEqual(STEPS.map((s) => s.title).slice(0, 3), ['목표', '지도와 영향력', '자원']);
  assert.equal(TUT_CONFIG.rounds, 4); assert.equal(TUT_CONFIG.countries.redDragon, 'kor'); assert.equal(TUT_CONFIG.aiLevel, 'easy');
});

test('시작: 한국 vs 쉬움 AI 셋, 4라운드, 튜토리얼 덱, 계획 단계에서 사람 차례', async () => {
  const { core, loop } = await fresh(), s = loop.state;
  assert.equal(s.config.rounds, 4); assert.equal(s.config.tutorial, true); assert.equal(s.config.humanFaction, ME);
  assert.equal(s.config.countries.redDragon, 'kor'); assert.equal(s.config.aiLevel, 'easy');
  assert.equal(s.phase, 'plan'); assert.ok(loop.humanWaiting());
  assert.equal(s.players[ME].deck.length + s.players[ME].hand.length, 10);
  assert.ok(s.players[ME].hand.includes(CARD), '지정 카드가 첫 손패에 있다');
  assert.equal(core.cur.id, 1); assert.ok(core.ready());
});

test('가드: 안내된 행동만 통과, AI 행동은 통과', async () => {
  const { core, loop, storage } = await fresh();
  const plan = (cards) => ({ type: 'PLAN', faction: ME, cards });
  assert.equal(loop.submit(plan([CARD])).ok, false, '1단계(설명)에서는 사람 행동 불가');
  toPlanStep(core);
  assert.equal(loop.submit({ type: 'SKIP_PLAN', faction: ME }).ok, false, '건너뛰기 불가');
  const other = loop.state.players[ME].hand.find((c) => c !== CARD);
  assert.equal(loop.submit(plan([other])).ok, false, '다른 카드 불가');
  assert.equal(loop.submit(plan([CARD, other])).ok, false, '두 장 불가');
  assert.equal(loop.dispatch(plan([CARD])).ok, true, 'dispatch에서도 같은 가드');
  assert.equal(readRecords(storage).length, 0);
});

test('처음부터 끝까지: 스크립트 진행 → 수료 업적, 일반 저장·기록은 건드리지 않음', async () => {
  const { core, loop, storage } = await fresh();
  storage.setItem(SAVE_KEY, 'KEEP');
  toPlanStep(core);
  assert.equal(loop.submit({ type: 'PLAN', faction: ME, cards: [CARD] }).ok, true);
  assert.equal(core.cur.id, 9);
  assert.equal(loop.submit({ type: 'BUY', faction: ME, cardId: 'x' }).ok, false, '9단계에서 구매 불가');
  for (let n = 0; n < 6 && loop.state.phase !== 'shop'; n++) { await loop.run(); chooseAll(loop); }
  assert.equal(loop.state.phase, 'shop'); assert.equal(loop.state.round, 1);
  assert.equal(core.cur.id, 10, '정산 설명'); assert.ok(core.ready());
  assert.equal(loop.submit({ type: 'END_SHOP', faction: ME }).ok, false);
  assert.ok(core.next());
  assert.equal(core.cur.id, 11); assert.equal(core.canNext(), core.stuck());
  assert.equal(loop.submit({ type: 'END_SHOP', faction: ME }).ok, false, '구매 전 상점 마치기 불가');
  const buy = shopView(loop.state, data, ME); const it = [...buy.market, ...buy.first].find((x) => x.afford);
  assert.ok(it, '살 수 있는 카드가 있다');
  assert.equal(loop.submit({ type: 'BUY', faction: ME, cardId: it.id }).ok, true);
  assert.equal(core.cur.id, 12);
  assert.ok(!readMeta(storage).achievements.tutorial, '아직 수료 전');
  assert.ok(core.next()); assert.equal(core.cur.id, 13);
  assert.ok(core.next()); assert.equal(core.cur.id, 14); assert.ok(core.done);
  assert.ok(readMeta(storage).achievements.tutorial, '튜토리얼 수료 업적');
  assert.equal(storage.getItem(HINT_KEY), '1');
  assert.equal(core.next(), false, '마지막 단계에서 더 못 넘어감');
  assert.equal(storage.getItem(SAVE_KEY), 'KEEP', '일반 저장은 그대로');
  assert.equal(readRecords(storage).length, 0);
  assert.ok(ACHIEVEMENTS.some((a) => a.id === 'tutorial' && a.name === '튜토리얼 수료'));
  assert.equal(hasProgress(storage), false, '수료한 판은 이어하기 대상이 아님');
});

test('이어하기: 저장된 단계와 판에서 다시 시작, 임시 계획은 6단계부터', async () => {
  const { core, loop, storage } = await fresh();
  core.next(); core.next(); core.next();
  assert.equal(core.cur.id, 4); assert.ok(hasProgress(storage));
  const raw = JSON.parse(storage.getItem(TUT_KEY)); assert.equal(raw.step, 3); assert.equal(raw.save.state.phase, 'plan');
  const b = createTutorial({ data, storage, resume: true });
  assert.ok(b.resume()); await b.loop.run();
  assert.equal(b.cur.id, 4); assert.equal(b.loop.state.phase, 'plan'); assert.equal(b.loop.state.seed, loop.state.seed);
  assert.equal(b.loop.submit({ type: 'PLAN', faction: ME, cards: [CARD] }).ok, false, '이어한 뒤에도 가드');
  toPlanStep(b); assert.equal(b.loop.submit({ type: 'PLAN', faction: ME, cards: [CARD] }).ok, true);
  const c = createTutorial({ data, storage, resume: true });
  assert.ok(c.resume()); assert.equal(c.cur.id, 9, '계획 제출 뒤에는 9단계에서 이어짐');
  assert.equal(resumeStep(7, { phase: 'plan', round: 1 }), 5);
  assert.equal(resumeStep(2, { phase: 'shop', round: 1 }), 9);
  b.exit(); assert.equal(readProgress(storage), null, '건너뛰면 진행 기록을 지운다');
});
