// 엔진 공개 API.
import { createGame as create } from './state.js';
import { nextInt, seedToState } from './rng.js';
import { reduce, legalActions, waitingFor, phaseOf, advance } from './reducer.js';
import { setData, getData } from './data.js';

export { reduce, legalActions, waitingFor, phaseOf, advance, setData, getData };
export { finalScores } from './score.js';
export { validateInvariants, resolveOrder, RULES } from './state.js';
export { hashState } from './util.js';

/** 새 게임 (data를 기본 데이터로 등록한다) */
export function createGame(opts) {
  setData(opts.data);
  return create(opts);
}

/**
 * policy(state, faction, legal) → 행동 또는 null(그 세력은 맡지 않음).
 * 맡지 않는 세력의 입력을 기다리게 되면 멈춘다. { state, events, steps, stopped } 반환
 */
export function autoPlay(state, policy, { data, maxSteps = 5000 } = {}) {
  let s = state, steps = 0, events = [];
  for (;;) {
    if (s.phase === 'end') return { state: s, events, steps, stopped: 'end' };
    const who = waitingFor(s);
    let act = null;
    for (const f of who) { act = policy(s, f, legalActions(s, f, data)); if (act) break; }
    if (!act) return { state: s, events, steps, stopped: 'waiting' };
    if (steps++ >= maxSteps) throw new Error(`autoPlay: ${maxSteps}번 안에 끝나지 않음 (단계 ${s.phase}, ${s.round}라운드)`);
    const r = reduce(s, act, data);
    if (!r.ok) throw new Error('autoPlay: 불가능한 행동 ' + JSON.stringify(act) + ' — ' + r.reason);
    s = r.state; events = events.concat(r.events);
  }
}

/** 합법 수 중 균등 무작위 선택. factions를 주면 그 세력만 맡는다 */
export function randomPolicy(rngSeed, { factions = null } = {}) {
  let rng = seedToState(rngSeed);
  return (state, faction, legal) => {
    if ((factions && !factions.includes(faction)) || !legal.length) return null;
    const r = nextInt(rng, legal.length);
    rng = r.rng;
    return legal[r.value];
  };
}
