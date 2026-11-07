// 효과 문구 변환: 카드·전략 자산·성장 카드·이벤트 전부가 비지 않는 한국어 설명을 만든다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../src/engine/node-data.js';
import { effectsToKorean, effectToKorean, previewChips, timingTag, plainText } from '../src/ui/effect-text.js';

const data = loadData();
const BAD = /undefined|NaN|\[object|null|\{|\}/;
const EMOJI = /[\u{1F300}-\u{1FAFF}\uFE0F]/u;
const groups = { 카드: data.cards, '전략 자산': data.assets, 성장: data.growth, 이벤트: data.events };

for (const [kind, list] of Object.entries(groups)) {
  test(`${kind} ${list.length}개 모두 한국어 설명이 있다`, () => {
    assert.ok(list.length > 0);
    for (const x of list) {
      const lines = effectsToKorean(x.effects, x);
      assert.ok(lines.length > 0, `${x.id}: 설명이 비었다`);
      for (const t of lines) {
        assert.equal(typeof t, 'string', x.id);
        assert.ok(t.trim().length > 0, `${x.id}: 빈 문장`);
        assert.ok(/[가-힣]/.test(t), `${x.id}: 한글이 없다 — ${t}`);
        assert.ok(!BAD.test(t), `${x.id}: 이상한 글자 — ${t}`);
        assert.ok(!EMOJI.test(t), `${x.id}: 이모지 — ${t}`);
      }
      assert.ok(!BAD.test(plainText(x.text || '')) && !EMOJI.test(plainText(x.text || '')), `${x.id}: 본문`);
    }
  });
}

test('효과마다 직접 풀린다 (카드 문구로 대신하지 않는다)', () => {
  const miss = [];
  for (const list of Object.values(groups)) for (const x of list) for (const e of x.effects || []) {
    const t = effectToKorean(e);
    if (!t || BAD.test(t)) miss.push(`${x.id}:${e.type}`);
  }
  assert.deepEqual(miss, []);
});

test('손패 예상 칩과 타이밍 태그', () => {
  for (const c of data.cards) {
    const chips = previewChips(c);
    assert.ok(chips.length <= 4);
    for (const k of chips) assert.ok(k.text && !BAD.test(k.text), `${c.id}: ${k.text}`);
    assert.ok(['즉시', '지속', '라운드', '비밀'].includes(timingTag(c)), c.id);
  }
});

test('이모지는 글자로 바뀌고 같은 낱말이 겹치지 않는다', () => {
  assert.equal(plainText('💰 자본 +2'), '자본 +2');
  assert.equal(plainText('⭐ 위신 +1'), '위신 +1');
  assert.equal(plainText('🛢 에너지 +2 🏭 산업 +1'), '에너지 +2 산업 +1');
  assert.ok(!EMOJI.test(plainText('🛢🏭💰⭐ 테스트')));
});

test('가장 긴 카드 문구도 설명이 만들어진다', () => {
  const longest = data.cards.reduce((a, c) => ((c.text || '').length > (a.text || '').length ? c : a));
  assert.ok(longest.text.length >= 40, '가장 긴 카드 문구');
  assert.ok(effectsToKorean(longest.effects, longest).join(' ').length > 10);
});
