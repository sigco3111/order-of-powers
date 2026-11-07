// Q2-6: AI 해결 연출 시간 상한
import test from 'node:test';
import assert from 'node:assert/strict';
import { aiStepMs, AI_STEP_MS, AI_ROUND_MS } from '../src/ui/presenter.js';

test('AI 행동 하나는 기본 250ms, 보드가 안 바뀌면 더 짧다', () => {
  assert.equal(aiStepMs({ aiCount: 3 }), AI_STEP_MS);
  assert.ok(aiStepMs({ aiCount: 3, changes: false }) < AI_STEP_MS);
});

test('기본 속도에서 AI 몫은 한 라운드 4초 이내 (행동 수가 많아도)', () => {
  for (const n of [1, 3, 9, 16, 30]) assert.ok(aiStepMs({ aiCount: n }) * n <= AI_ROUND_MS + n, `n=${n}`);
});

test('빠른 진행은 기본보다 빠르다', () => {
  for (const n of [3, 9, 30]) assert.ok(aiStepMs({ fast: true, aiCount: n }) <= aiStepMs({ aiCount: n }));
  assert.ok(aiStepMs({ fast: true, aiCount: 9 }) * 9 <= AI_ROUND_MS / 2 + 9 * 40);
});
