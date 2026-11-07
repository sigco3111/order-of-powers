// 게임 루프: 엔진 reduce를 감싸 저장하고, 사람이 아닌 세력의 차례를 브라우저를 막지 않고 진행한다. DOM 없음 (node 테스트 가능).
import { createGame, reduce, waitingFor, setData } from '../engine/index.js';
import { chooseAction, describeIntent } from '../ai/ai.js';

export const SAVE_KEY = 'oop-save-v1';
const humanCountry = (cfg) => cfg.countries?.[cfg.humanFaction];
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => globalThis.performance?.now?.() ?? Date.now();

/** 저장 데이터 모양 검사 (손상된 저장은 이어하기를 막는다) */
export function validSave(o) {
  const s = o?.state;
  return !!s && s.version === 1 && typeof s.phase === 'string' && Number.isInteger(s.round) && Array.isArray(s.turnOrder) && s.turnOrder.length === 4
    && !!s.config && Number.isInteger(s.config.rounds) && !!s.players && !!s.regions && Array.isArray(s.log)
    && s.turnOrder.every((f) => s.players[f] && Array.isArray(s.players[f].hand) && s.players[f].resources);
}
/** 저장을 읽는다. 없거나 손상됐으면 null (손상된 항목은 지운다) */
export function readSave(storage = globalThis.localStorage) {
  let raw;
  try { raw = storage.getItem(SAVE_KEY); } catch { return null; }
  if (raw == null) return null;
  try { const o = JSON.parse(raw); if (validSave(o)) return o; } catch { /* 손상 */ }
  try { storage.removeItem(SAVE_KEY); } catch { /* 무시 */ }
  return null;
}

/**
 * createLoop({ data, storage, humanLevel })
 * start/load → state, dispatch(action), run({ pace, auto }) — 사람이 할 차례에서 멈춘다 (auto면 사람 몫도 AI가 임시로 대신한다).
 */
export function createLoop({ data, storage = globalThis.localStorage, humanLevel = 'normal' } = {}) {
  setData(data);
  let state = null, ui = {}, runId = 0;
  const subs = new Set();
  const loop = {
    feed: [], acting: null, saveError: null, stats: { steps: 0, maxStepMs: 0 },
    get state() { return state; }, get ui() { return ui; },
    get running() { return runId > 0 && loop._busy === true; }, _busy: false,
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    _emit(kind) { for (const fn of subs) fn(state, kind); },

    start(cfg) {
      loop.stop(); loop.feed = [];
      ui = { faction: cfg.humanFaction, country: humanCountry(cfg), rounds: cfg.rounds, level: cfg.aiLevel, seed: cfg.seed };
      state = createGame({ data, ...cfg });
      loop.persist(); loop._emit('start');
      return state;
    },
    load() {
      const o = readSave(storage);
      if (!o) return null;
      loop.stop(); loop.feed = [];
      state = o.state; ui = o.ui || {};
      loop._emit('load');
      return state;
    },
    persist() {
      try { storage.setItem(SAVE_KEY, JSON.stringify({ v: 1, savedAt: Date.now(), ui, state })); loop.saveError = null; }
      catch (e) { loop.saveError = e.message; }
    },
    /** 행동 하나 적용 → 저장 → 알림. { ok, reason?, events } */
    dispatch(action) {
      const r = reduce(state, action, data);
      if (!r.ok) return r;
      state = r.state;
      loop.persist(); loop._emit('state');
      return r;
    },
    waiting: () => (state ? waitingFor(state) : []),
    humanWaiting: () => !!state && state.phase !== 'end' && waitingFor(state).includes(state.config.humanFaction),
    /** 이 세력의 다음 행동 (사람 몫이면 보통 AI가 대신 둔다). 상태는 바뀌지 않는다 */
    pick(faction) {
      const lv = faction === state.config.humanFaction ? humanLevel : state.config.aiLevel;
      return chooseAction(state, faction, { level: lv, rngSeed: state.seed, data });
    },
    /** 한 세력이 한 수를 둔다: 계산 → (pace ms 뒤) 적용. 걸린 시간(ms) 반환 */
    async act(faction, pace = 0, token = null) {
      const t0 = now(), action = loop.pick(faction);
      if (!action) throw new Error(`${faction}: 둘 수 있는 수가 없음 (${state.phase})`);
      const text = describeIntent(state, action, data), at = { round: state.round, phase: state.phase };
      loop.acting = { faction, text }; loop._emit('acting');
      const ms = now() - t0;
      if (pace) { await pause(pace); if (token != null && token !== runId) return ms; } // 멈춤 요청이면 적용하지 않는다
      const r = loop.dispatch(action);
      if (!r.ok) throw new Error(`${faction}: ${action.type} 실패 — ${r.reason}`);
      loop.feed.unshift({ ...at, faction, text }); loop.feed.length = Math.min(loop.feed.length, 60);
      loop.stats.steps++; loop.stats.maxStepMs = Math.max(loop.stats.maxStepMs, ms, now() - t0 - (pace || 0));
      return ms;
    },
    stop() { runId++; loop._busy = false; loop.acting = null; if (state) loop._emit('stop'); },
    /**
     * AI 차례를 이어서 진행한다. 사람 차례(또는 끝)에서 멈추고 이유를 돌려준다: 'human' | 'end' | 'stopped' | 'limit'.
     * opts: pace(ms, 단계 사이 대기), auto(true면 사람 몫도 임시로 대신 둠), untilRound(그 라운드가 되면 멈춤), maxSteps
     */
    async run(opts = {}) {
      const my = ++runId; loop._busy = true;
      try {
        for (let n = 0; n < (opts.maxSteps ?? 20000); n++) {
          if (my !== runId) return 'stopped';
          if (!state || state.phase === 'end') return 'end';
          if (opts.untilRound && state.round >= opts.untilRound) return 'limit';
          const human = state.config.humanFaction, who = waitingFor(state);
          const f = who.find((x) => x !== human) ?? (opts.auto && who.length ? who[0] : null);
          if (!f) return 'human';
          await loop.act(f, opts.pace || 0, my);
          loop.acting = null; loop._emit('acted');
          await pause(0); // 브라우저에 제어를 돌려준다
        }
        return 'limit';
      } finally { if (my === runId) { loop._busy = false; loop.acting = null; loop._emit('idle'); } }
    },
  };
  return loop;
}
