import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../src/engine/node-data.js';
import { RULES } from '../src/engine/index.js';
import { BASE_INCOME } from '../src/engine/income.js';
import { CHAPTERS, rulesDoc, rulesMarkdown, PHASES } from '../src/ui/rules.js';

const data = loadData();
const doc = rulesDoc(data);
const flat = (c) => c.blocks.flatMap((b) => [b.text, b.sub, ...(b.items || []).flat(), ...(b.rows || []).flat(), ...(b.head || []), b.caption]).filter(Boolean).join('\n');
const all = doc.map(flat).join('\n');

test('규칙서: 차례의 모든 장에 본문이 있다', () => {
  assert.deepEqual(CHAPTERS.map((c) => c.title), ['게임 목표', '준비', '라운드 흐름', '자원', '지역과 점수', '카드 종류', '조약·방어·기지', '전략 자산과 비밀 목표', '승리 조건과 동점', '국가 20개와 성향 4종', '용어 사전']);
  assert.equal(new Set(CHAPTERS.map((c) => c.id)).size, CHAPTERS.length);
  for (const c of CHAPTERS) { const s = doc.find((d) => d.id === c.id); assert.ok(s?.blocks?.length, c.id); assert.ok(flat(s).length > 30, c.id); }
});

test('규칙서: undefined·NaN·빈 값이 없고 이모지를 쓰지 않는다', () => {
  assert.doesNotMatch(all, /undefined|NaN|null|\[object/);
  assert.doesNotMatch(all, /[\u{1F300}-\u{1FAFF}\u2B50]/u);
  assert.doesNotMatch(rulesMarkdown(data), /undefined|NaN|\[object/);
});

test('규칙서: 핵심 숫자가 데이터·상수와 같다', () => {
  const text = (id) => flat(doc.find((d) => d.id === id));
  const st = RULES.startResources;
  assert.match(text('setup'), new RegExp(`자본 ${st.capital} · 에너지 ${st.energy} · 산업 ${st.industry}`));
  assert.match(text('setup'), new RegExp(`${RULES.handSize}장`)); assert.match(text('setup'), new RegExp(`${RULES.planSlots}개`));
  assert.match(text('setup'), new RegExp(`공개 ${RULES.marketSlots}칸`));
  assert.match(text('regions'), new RegExp(`최대 ${RULES.maxInfluence}`));
  assert.match(text('resources'), new RegExp(`자본 \\+${BASE_INCOME.capital}`));
  const reg = doc.find((d) => d.id === 'regions').blocks.find((b) => b.t === 'table');
  assert.equal(reg.rows.length, data.regions.length);
  for (const r of data.regions) assert.deepEqual(reg.rows.find((x) => x[0] === r.name)?.[1], String(r.scoreValue + (r.scoreBonus || 0)), r.id);
  const total = data.regions.reduce((a, r) => a + r.scoreValue + (r.scoreBonus || 0), 0);
  assert.match(text('regions'), new RegExp(`${total}점입니다`));
  assert.equal(PHASES.map((p) => p[0]).join(''), '사건계획공개해결정산상점');
  assert.match(text('flow'), /마지막 라운드는 .*상점이 없습니다/); assert.match(text('flow'), /추격 보너스/);
});

test('규칙서: 국가 20개와 성향 4종이 모두 나온다', () => {
  assert.equal(data.countries.length, 20);
  const c = doc.find((d) => d.id === 'countries'), t = flat(c);
  for (const k of data.countries) { assert.ok(t.includes(k.nameKo), k.id); assert.ok(t.includes(k.trait.nameKo), k.id); }
  assert.equal(c.blocks.filter((b) => b.t === 'table').flatMap((b) => b.rows).length, 20);
  for (const n of ['외교형', '산업형', '군사형', '성장형']) assert.ok(t.includes(n), n);
  assert.match(t, /국가는 20개이고 성향\(유형\)은 4종/);
});

test('규칙서: 그림 세 개와 docs/RULES.md가 같은 내용', async () => {
  assert.deepEqual(doc.flatMap((d) => d.blocks.filter((b) => b.t === 'fig').map((b) => b.id)), ['flow', 'leader', 'score']);
  const { readFileSync } = await import('node:fs');
  assert.equal(readFileSync(new URL('../docs/RULES.md', import.meta.url), 'utf8'), rulesMarkdown(data));
});
