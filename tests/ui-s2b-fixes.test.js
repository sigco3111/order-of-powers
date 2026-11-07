import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../src/engine/node-data.js';
import { createGame } from '../src/engine/index.js';
import { createLoop, SAVE_KEY, readSave } from '../src/ui/loop.js';
import { clearSave } from '../src/ui/settings.js';
import { previewChips } from '../src/ui/effect-text.js';
import { createAudio, canPlayAudio } from '../src/ui/audio.js';
import { readFileSync, existsSync } from 'node:fs';

const data = loadData();
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => void m.set(k, String(v)), removeItem: (k) => void m.delete(k), has: (k) => m.has(k) }; };
const cfg = { rounds: 6, factions: ['atlas', 'redDragon', 'polarStar', 'emerald'], humanFaction: 'atlas', seed: 7, aiLevel: 'normal' };

test('(c) 저장을 지우면 진행 중인 판이 다시 저장하지 않고, 새 판/이어하기에서 다시 저장한다', () => {
  const st = mem(), loop = createLoop({ data, storage: st });
  loop.start(cfg); assert.ok(st.has(SAVE_KEY));
  assert.ok(clearSave(st)); assert.equal(st.has(SAVE_KEY), false);
  loop.persist(); loop.dispatch({ type: 'SKIP_PLAN', faction: 'atlas' });
  assert.equal(st.has(SAVE_KEY), false, '지운 뒤 다시 저장됨');
  loop.start(cfg); assert.ok(st.has(SAVE_KEY), '새 판은 저장해야 함');
  clearSave(st); assert.equal(st.has(SAVE_KEY), false);
  st.setItem(SAVE_KEY, JSON.stringify({ v: 1, savedAt: 1, ui: {}, state: loop.state })); assert.ok(readSave(st));
  loop.load(); loop.persist(); assert.ok(st.has(SAVE_KEY), '이어하기 뒤에는 저장해야 함');
});
test('(c) 다른 저장소를 쓰는 루프(튜토리얼)는 영향이 없다', () => {
  const a = mem(), b = mem(), la = createLoop({ data, storage: a }), lb = createLoop({ data, storage: b });
  la.start(cfg); lb.start(cfg); clearSave(a); lb.persist();
  assert.ok(b.has(SAVE_KEY)); la.persist(); assert.equal(a.has(SAVE_KEY), false);
});

test('(d) 고를 지역이 없으면 "지역 선택 필요"를 붙이지 않는다', () => {
  const s = createGame({ data, ...cfg }), f = 'atlas';
  const owned = { id: 'x', effects: [{ type: 'influence', amount: 1, filter: 'owned' }] };
  const strike = { id: 'y', effects: [{ type: 'removeInfluence', amount: 1 }] };
  const any = { id: 'z', effects: [{ type: 'influence', amount: 1, filter: 'any' }] };
  const need = (c, st) => previewChips(c, st, f).some((k) => k.text === '지역 선택 필요');
  assert.ok(previewChips(owned).some((k) => k.text === '지역 선택 필요'), '상태 없이는 기존대로');
  assert.equal(need(owned, s), false, '내 영향력이 있는 지역이 없음');
  assert.equal(need(strike, s), false, '영향력을 가진 상대가 없음');
  assert.equal(need(any, s), true, '아무 지역이나 가능');
  const r = Object.values(s.regions)[0]; r.influence[f] = 2; r.influence.redDragon = 1;
  assert.equal(need(owned, s), true); assert.equal(need(strike, s), true);
  assert.ok(previewChips(owned, s, f).some((k) => k.text === '영향력 +1'), '결과 칩은 그대로');
});

test('(a) ogg를 못 읽는 기기는 mp3로 대체하고, 소리 파일이 모두 있다', async () => {
  const map = JSON.parse(readFileSync(new URL('../src/ui/sounds.json', import.meta.url), 'utf8'));
  for (const g of ['sfx', 'music']) for (const [n, d] of Object.entries(map[g])) for (const f of [d.file, d.mp3]) assert.ok(f && existsSync(new URL('../assets/audio/' + f, import.meta.url)), `${n}: ${f}`);
  const make = (ogg) => { const urls = []; const A = createAudio({ settings: () => ({ sfxOn: true, sfxVol: 50, musicOn: true, musicVol: 50, muteAll: false }), map, base: '', doc: { createElement: () => ({ canPlayType: (t) => (t.includes('ogg') ? ogg : 'maybe') }), addEventListener() {} },
    fetchFn: async (u) => { urls.push(u); return { ok: false }; }, AudioCtx: class { constructor() { this.state = 'running'; } createGain() { return { connect() {}, gain: {} }; } resume() {} } , AudioEl: class { constructor(u) { urls.push(u); } addEventListener() {} play() { return Promise.resolve(); } pause() {} } });
    A.unlock(); return { A, urls }; };
  const bad = make(''); await new Promise((r) => setTimeout(r, 20)); assert.ok(bad.urls.length && bad.urls.every((u) => u.endsWith('.mp3')), bad.urls[0]);
  const ok = make('probably'); await new Promise((r) => setTimeout(r, 20)); assert.ok(ok.urls.length && ok.urls.every((u) => u.endsWith('.ogg')));
  assert.equal(typeof canPlayAudio(), 'boolean');
});
