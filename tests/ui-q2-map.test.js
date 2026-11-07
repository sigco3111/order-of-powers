// Q2-4: 북미·남미 라벨이 지도 그림 위에 겹치지 않도록 시작 위치를 바다 쪽으로 보정한다
import test from 'node:test';
import assert from 'node:assert/strict';
import { LABEL_NUDGE, SHORT } from '../src/ui/map.js';

test('북미는 위쪽, 남미는 아래쪽 바다로 밀려 있다 (라벨이 육지를 덮지 않음)', () => {
  assert.ok(LABEL_NUDGE.northAmerica[1] <= -30, '북미 위로');
  assert.ok(LABEL_NUDGE.southAmerica[1] >= 30, '남미 아래로');
  assert.ok(LABEL_NUDGE.northAmerica[0] < 0 && LABEL_NUDGE.southAmerica[0] < 0, '둘 다 서쪽(바다)으로');
});

test('보정 대상은 모두 실제 지역이다', () => {
  for (const id of Object.keys(LABEL_NUDGE)) assert.ok(SHORT[id], id);
});
