// Q2-1·5: 계획 확정 막기(지역 미정 카드)와 카드 한 번 누르기 모델
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../src/engine/node-data.js';
import { createGame } from '../src/engine/index.js';
import { needsRegion, regionOptions, missingRegions, blockReason, firstFreeSlot, BLOCK_REASON, NEED_REGION_TAG } from '../src/ui/plan-model.js';
import { STEPS } from '../src/ui/tutorial.js';

const data = loadData(), ids = data.factions.map((f) => f.id), F = 'atlas';
const state = createGame({ data, rounds: 6, factions: ids, humanFaction: F, seed: 3, aiLevel: 'normal' });
const card = (pred) => data.cards.find(pred);
const infl = card((c) => c.effects.length === 1 && c.effects[0].type === 'influence' && c.effects[0].filter !== 'owned');
const gain = card((c) => c.effects.length && c.effects.every((e) => e.type === 'gain'));

test('지역이 필요한 카드만 needsRegion, 후보는 지역 목록', () => {
  assert.ok(infl && gain);
  assert.equal(needsRegion(infl, state, F), true);
  assert.equal(needsRegion(gain, state, F), false);
  assert.equal(regionOptions(infl, state, F).length, Object.keys(state.regions).length);
});

test('지역을 정하지 않은 카드가 있으면 확정을 막고 한 줄 이유를 준다', () => {
  assert.equal(BLOCK_REASON, '지역을 정하지 않은 카드가 있어요');
  assert.equal(NEED_REGION_TAG, '지역 선택 필요');
  const rid = Object.keys(state.regions)[0];
  assert.equal(blockReason([{ card: infl, region: undefined }], state, F), BLOCK_REASON);
  assert.equal(missingRegions([{ card: infl }, { card: gain }], state, F).length, 1);
  assert.equal(blockReason([{ card: infl, region: rid }, { card: gain }], state, F), null);
  assert.equal(blockReason([{ card: gain }], state, F), null, '지역이 필요 없는 카드는 막지 않는다');
  assert.equal(blockReason([{ card: infl, region: 'nowhere' }], state, F), BLOCK_REASON, '고를 수 없는 지역은 미정으로 본다');
  assert.equal(blockReason([], state, F), null);
});

test('카드 한 번 누르면 첫 빈 칸 (지역 없는 카드 1번, 지역 카드 2번 누름)', () => {
  assert.equal(firstFreeSlot([], 3), 0); assert.equal(firstFreeSlot([4, 1], 3), 2); assert.equal(firstFreeSlot([0, 1, 2], 3), -1);
  const clicks = (c) => (needsRegion(c, state, F) ? 2 : 1);
  assert.equal(clicks(gain), 1); assert.equal(clicks(infl), 2);
});

test('튜토리얼 6~9단계 안내가 새 조작(카드 누르기 → 지역 칩)을 가리킨다', () => {
  const t = Object.fromEntries(STEPS.map((s) => [s.id, s]));
  assert.ok(!t[6].ask.includes('계획에 넣기'));
  assert.ok(t[6].target.includes('.hand__c') && t[7].target.includes('.rpick'));
  assert.ok(t[7].ask.includes('지역'));
  assert.ok(!t[9].ask.includes('확정하세요'));
});
