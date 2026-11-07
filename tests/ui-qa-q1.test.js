// Q1 실플레이 점검에서 나온 문구 수정 확인
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { josa } from '../src/engine/countries.js';

test('화면 문구에 조사 "을(를)"을 그대로 쓰지 않는다', () => {
  for (const f of readdirSync('src/ui').filter((n) => n.endsWith('.js'))) {
    assert.ok(!readFileSync(`src/ui/${f}`, 'utf8').includes('을(를)'), f);
  }
});

test('josa: 받침 유무에 따라 을/를', () => {
  assert.equal(josa('복지 확대', '을', '를'), '복지 확대를');
  assert.equal(josa('순찰', '을', '를'), '순찰을');
});
