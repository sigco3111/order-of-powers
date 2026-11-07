import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { DEFAULTS, sanitize, loadSettings, saveSettings, SETTINGS_KEY, exportData, importData, clearSave, clearRecords, DATA_KEYS, TEXT_SIZES } from '../src/ui/settings.js';
import { createAudio } from '../src/ui/audio.js';
import { SAVE_KEY } from '../src/ui/loop.js';
import { RECORDS_KEY, META_KEY } from '../src/ui/records.js';

const mem = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => void m.set(k, String(v)), removeItem: (k) => void m.delete(k), m }; };
const goodSave = () => ({ v: 1, state: { version: 1, phase: 'plan', round: 1, turnOrder: ['a', 'b', 'c', 'd'], config: { rounds: 6 }, players: Object.fromEntries(['a', 'b', 'c', 'd'].map((f) => [f, { hand: [], resources: {} }])), regions: {}, log: [] } });

test('설정: 기본값과 저장/불러오기', () => {
  const st = mem();
  assert.deepEqual(loadSettings(st), DEFAULTS);
  assert.equal(DEFAULTS.sfxOn, true); assert.equal(DEFAULTS.sfxVol, 60); assert.equal(DEFAULTS.musicOn, false);
  assert.ok(saveSettings({ ...DEFAULTS, musicOn: true, musicVol: 20, textSize: 'xlarge' }, st));
  assert.deepEqual(loadSettings(st), { ...DEFAULTS, musicOn: true, musicVol: 20, textSize: 'xlarge' });
});
test('설정: 손상된 값은 항목별로 기본값', () => {
  const bad = { sfxOn: 'yes', sfxVol: 999, musicVol: 'x', muteAll: 1, textSize: 'huge', contrast: null, fast: true };
  assert.deepEqual(sanitize(bad), { ...DEFAULTS, sfxVol: 100, fast: true });
  assert.equal(sanitize({ sfxVol: -5 }).sfxVol, 0);
  for (const raw of ['{', 'null', '[]', '"x"', '12']) assert.deepEqual(loadSettings(mem({ [SETTINGS_KEY]: raw })), DEFAULTS);
  assert.deepEqual(loadSettings({ getItem() { throw new Error('막힘'); } }), DEFAULTS);
  assert.equal(saveSettings(DEFAULTS, { setItem() { throw new Error('가득'); } }), false);
});
test('설정: 옛 형식(sound, reduceMotion) 이전', () => {
  const s = loadSettings(mem({ [SETTINGS_KEY]: JSON.stringify({ reduceMotion: true, sound: false }) }));
  assert.equal(s.sfxOn, false); assert.equal(s.reduceMotion, true); assert.equal(s.v, 1);
});
test('글자 크기 배율', () => assert.deepEqual(TEXT_SIZES, { normal: 100, large: 115, xlarge: 130 }));

test('내보내기/가져오기 왕복', () => {
  const a = mem({ [SAVE_KEY]: JSON.stringify(goodSave()), [RECORDS_KEY]: JSON.stringify([{ id: 'r', score: 40 }]), [META_KEY]: JSON.stringify({ games: 1, wins: 1 }) });
  const text = exportData(a), b = mem();
  const r = importData(text, b);
  assert.ok(r.ok); assert.deepEqual(r.imported, DATA_KEYS);
  for (const k of DATA_KEYS) assert.deepEqual(JSON.parse(b.getItem(k)), JSON.parse(a.getItem(k)));
});
test('가져오기 검증: 잘못된 입력은 거부하고 저장하지 않는다', () => {
  const st = mem();
  assert.equal(importData('{', st).ok, false);
  assert.equal(importData('{"format":"x"}', st).ok, false);
  assert.equal(importData(JSON.stringify({ format: 'oop-export-v1', data: {} }), st).ok, false);
  const r = importData(JSON.stringify({ format: 'oop-export-v1', data: { [SAVE_KEY]: { state: {} }, [RECORDS_KEY]: [{ score: 1 }] } }), st);
  assert.equal(r.ok, false); assert.match(r.error, /oop-save-v1/); assert.equal(st.m.size, 0);
  assert.equal(importData(JSON.stringify({ format: 'oop-export-v1', data: { [META_KEY]: [] } }), st).ok, false);
});
test('저장 삭제 / 기록 삭제', () => {
  const st = mem({ [SAVE_KEY]: '1', [RECORDS_KEY]: '[]', [META_KEY]: '{}', other: 'x' });
  clearSave(st); assert.equal(st.getItem(SAVE_KEY), null); assert.equal(st.getItem(RECORDS_KEY), '[]');
  clearRecords(st); assert.equal(st.getItem(RECORDS_KEY), null); assert.equal(st.getItem(META_KEY), null); assert.equal(st.getItem('other'), 'x');
});

const MAP = JSON.parse(readFileSync(new URL('../src/ui/sounds.json', import.meta.url)));
test('sounds.json: 모든 파일이 있고 효과음 합계가 작다', () => {
  let total = 0;
  for (const d of [...Object.values(MAP.sfx), ...Object.values(MAP.music)]) {
    const u = new URL('../' + MAP.base + d.file, import.meta.url); assert.ok(existsSync(u), d.file);
    if (MAP.sfx && Object.values(MAP.sfx).includes(d)) total += readFileSync(u).length;
  }
  assert.ok(total < 1_000_000, `효과음 ${total}B`);
});

test('오디오: AudioContext/Audio가 없어도 던지지 않는다', async () => {
  const s = { ...DEFAULTS, musicOn: true };
  const a = createAudio({ settings: () => s, map: MAP, AudioCtx: undefined, AudioEl: undefined, fetchFn: undefined, doc: undefined });
  assert.doesNotThrow(() => { a.unlock(); a.play('click'); a.play('없는소리'); a.click(); a.setMusic('menu'); a.refresh(); a.onVisibility(); });
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(a.track, null);
});
test('오디오: 소리 파일이 실패해도 던지지 않고 다시 시도하지 않는다', async () => {
  let fetches = 0, started = 0;
  class Ctx { constructor() { this.state = 'running'; this.destination = {}; } createGain() { return { gain: {}, connect() {} }; } createBufferSource() { return { playbackRate: {}, connect() {}, start() { started++; } }; } decodeAudioData(ab, ok, no) { no(new Error('디코딩 실패')); } resume() { return Promise.resolve(); } }
  for (const fetchFn of [async () => { fetches++; throw new Error('네트워크'); }, async () => { fetches++; return { ok: false }; }, async () => { fetches++; return { ok: true, arrayBuffer: async () => new ArrayBuffer(4) }; }]) {
    fetches = 0;
    const a = createAudio({ settings: () => DEFAULTS, map: MAP, AudioCtx: Ctx, fetchFn, AudioEl: undefined, doc: undefined });
    a.unlock(); a.play('stamp'); a.play('stamp');
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(started, 0); assert.ok(fetches >= 1);
    const n = fetches; a.play('stamp'); await new Promise((r) => setTimeout(r, 5)); assert.equal(fetches, n);
  }
});
test('오디오: 꺼짐·음소거·잠금 상태에서는 소리를 내지 않는다, 음악은 켠 뒤에만 만든다', async () => {
  let started = 0, created = 0;
  class Ctx { constructor() { this.state = 'running'; this.destination = {}; } createGain() { return { gain: {}, connect() {} }; } createBufferSource() { return { playbackRate: {}, connect() {}, start() { started++; } }; } decodeAudioData(ab, ok) { ok({}); } resume() { return Promise.resolve(); } }
  class El { constructor() { created++; this.paused = true; } play() { this.paused = false; return Promise.resolve(); } pause() { this.paused = true; } }
  const s = { ...DEFAULTS };
  const mk = () => createAudio({ settings: () => s, map: MAP, AudioCtx: Ctx, AudioEl: El, fetchFn: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) }), doc: undefined, tick: 5 });
  const a = mk();
  a.play('click'); await new Promise((r) => setTimeout(r, 10)); assert.equal(started, 0); // 아직 사용자 동작 전
  a.setMusic('menu'); assert.equal(created, 0);
  a.unlock(); a.play('click'); await new Promise((r) => setTimeout(r, 20)); assert.equal(started, 1);
  assert.equal(created, 0); // 음악이 꺼져 있어 곡을 만들지 않음
  s.muteAll = true; a.play('click'); await new Promise((r) => setTimeout(r, 10)); assert.equal(started, 1);
  s.muteAll = false; s.musicOn = true; a.refresh(); assert.equal(created, 1); assert.equal(a.track, 'menu');
  s.musicOn = false; a.refresh(); assert.equal(a.track, null);
});
