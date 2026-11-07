// 라운드 리듀서. reduce(state, action) → {ok, state, events, reason?}. 순수 함수: 입력 상태는 바뀌지 않는다.
// 단계: setup → (event → plan → reveal → resolve → upkeep → shop) × 라운드 → end. advance가 입력이 필요한 곳까지 자동 진행한다.
import { deepClone, indexData, snapState } from './util.js';
import { createGame, drawToHandSize, resolveOrder, planSlotsOf, pickAsset, validateInvariants } from './state.js';
import { applyEvent, playCard, runEffects, resolveChoice, clearRoundEffects, isDeferredEvent } from './effects.js';
import { scoreRound, finalScores, applyCatchUp } from './score.js';
import { refill, buy } from './market.js';
import { payIncome } from './income.js';
import { waitingFor, phaseOf, legalActions } from './legal.js';
import { getData } from './data.js';
import { localize, seatName } from './countries.js';

export { waitingFor, phaseOf, legalActions };

const PHASE_KO = { setup: '준비', event: '이벤트', plan: '계획', reveal: '공개', resolve: '해결', upkeep: '정비', shop: '상점', end: '종료' };
const RES_KO = { capital: '💰', energy: '🛢', industry: '🏭', prestige: '⭐' };
const say = (s, actor, text) => s.log.push({ round: s.round, phase: s.phase, actor, text: localize(s, text) });
const enter = (s, phase, ev) => {
  s.phase = phase; s.flow = {};
  say(s, 'system', `[${s.round}라운드] ${PHASE_KO[phase]} 단계`);
  ev.push({ type: 'phase', phase, round: s.round });
};
const name = (ix, id) => ix.cards[id]?.name ?? ix.growth[id]?.name ?? id;

/** 이벤트 한 장 공개. 결과 상태를 반환 (선택 대기가 생길 수 있다) */
function drawEvent(s, data, ev) {
  const ix = indexData(data), id = s.eventDeck.shift();
  s.currentEvent = id ?? null; s.deferredEvent = null;
  if (!id) return s;
  const e = ix.events[id];
  ev.push({ type: 'event', id });
  if (isDeferredEvent(e)) {
    s.deferredEvent = id;
    say(s, 'event', `이벤트 공개: ${e.name} (카드 해결 뒤 적용)`);
    return s;
  }
  return applyEvent(s, e, { data }).state;
}

function finish(s, data, ev) {
  const fs = finalScores(s, data);
  const top = fs.ranking[0], key = (f) => [fs.scores[f].total, s.players[f].prestige, s.players[f].resources.capital].join();
  const winners = fs.ranking.filter((f) => key(f) === key(top));
  s.result = { winner: top, winners, tie: winners.length > 1, ranking: fs.ranking, scores: fs.scores, unknownMetrics: fs.unknownMetrics };
  enter(s, 'end', ev);
  say(s, 'system', fs.ranking.map((f, i) => `${i + 1}위 ${seatName(s, f, data)} ${fs.scores[f].total}점`).join(', '));
  say(s, 'system', winners.length > 1 ? `공동 승리: ${winners.join(', ')}` : `승자: ${seatName(s, top, data)}`);
  ev.push({ type: 'end', winner: top, winners, ranking: fs.ranking });
}

/** 입력이 필요한 곳(선택 대기, 계획·상점 입력, 게임 끝)까지 자동 진행. state는 호출자가 소유한 복제본 */
export function advance(state, data = getData()) {
  let s = state;
  const ev = [], ix = indexData(data);
  for (let guard = 0; guard < 10000; guard++) {
    if (s.pending?.length) break;
    const f = s.flow || (s.flow = {});
    if (s.phase === 'setup') {
      if (waitingFor(s).length) break;
      enter(s, 'event', ev);
    } else if (s.phase === 'event') {
      if (!f.drawn) { f.drawn = true; s = drawEvent(s, data, ev); continue; }
      enter(s, 'plan', ev);
      applyCatchUp(s);
      for (const x of s.turnOrder) s = drawToHandSize(s, x);
      s.flow.submitted = {};
      s.turnOrder.forEach((x) => { s.players[x].plan = []; });
    } else if (s.phase === 'plan') {
      if (waitingFor(s).length) break;
      enter(s, 'reveal', ev);
      for (const x of s.turnOrder) {
        const cards = s.players[x].plan;
        say(s, x, `계획 공개: ${cards.length ? cards.map((c) => name(ix, c)).join(' → ') : '없음'}`);
        ev.push({ type: 'reveal', faction: x, cards: cards.slice() });
      }
    } else if (s.phase === 'reveal') {
      const order = resolveOrder(s);
      enter(s, 'resolve', ev);
      s.flow = { order, idx: 0, deferredDone: false };
      say(s, 'system', `해결 순서: ${order.map((x) => seatName(s, x, data)).join(' → ')}`);
      ev.push({ type: 'order', order, snap: snapState(s) });
    } else if (s.phase === 'resolve') {
      if (f.idx < f.order.length) {
        const x = f.order[f.idx], p = s.players[x];
        if (!p.plan.length) { f.idx++; continue; }
        const cardId = p.plan[0], r = playCard(s, x, cardId, { data });
        if (!r.ok) { say(s, x, `카드 사용 불가: ${cardId}`); p.plan.shift(); continue; }
        s = r.state;
        ev.push({ type: 'play', faction: x, cardId, snap: snapState(s) });
      } else if (!f.deferredDone) {
        f.deferredDone = true;
        if (s.deferredEvent) {
          const id = s.deferredEvent;
          say(s, 'event', `이벤트 적용: ${ix.events[id].name}`); s = applyEvent(s, ix.events[id], { data }).state;
          ev.push({ type: 'deferred', id, snap: snapState(s) });
        }
      } else enter(s, 'upkeep', ev);
    } else if (s.phase === 'upkeep') {
      s = scoreRound(s);
      for (const x of s.turnOrder) ev.push({ type: 'score', faction: x, regionScore: s.players[x].regionScore });
      for (const { faction: x, income } of payIncome(s)) {
        say(s, x, '수입: ' + Object.entries(income).filter(([, n]) => n).map(([k, n]) => `${RES_KO[k]} +${n}`).join(' '));
        ev.push({ type: 'income', faction: x, income });
      }
      for (const x of s.turnOrder) { const p = s.players[x]; p.discard.push(...p.played); p.played = []; p.plan = []; }
      s = refill(s);
      if (s.round >= s.config.rounds) { finish(s, data, ev); break; } // 마지막 라운드는 상점 없이 바로 최종 점수
      enter(s, 'shop', ev);
      s.flow.done = {};
    } else if (s.phase === 'shop') {
      if (waitingFor(s).length) break;
      s = clearRoundEffects(s);
      s.eventDiscard.push(s.currentEvent); s.currentEvent = null; s.deferredEvent = null;
      s.round += 1;
      enter(s, 'event', ev);
    } else break;
  }
  return { state: s, events: ev };
}

// ---------- 액션 처리: (s 복제본, action, data, ev) → 실패 사유 문자열 또는 새 상태 ----------
const ACTIONS = {
  PICK_ASSET(s, a, data, ev) {
    if (s.phase !== 'setup') return '전략 자산은 게임 시작 전에만 고를 수 있습니다';
    const r = pickAsset(s, a.faction, a.assetId);
    if (!r.ok) return '선택할 수 없는 전략 자산입니다';
    say(r.state, a.faction, `전략 자산 선택 완료`);
    ev.push({ type: 'pickAsset', faction: a.faction });
    return r.state;
  },
  PLAN(s, a, data, ev) {
    if (s.phase !== 'plan') return '지금은 계획 단계가 아닙니다';
    if (s.flow.submitted[a.faction]) return '이미 계획을 제출했습니다';
    const cards = a.cards ?? [];
    if (!Array.isArray(cards) || cards.some((c) => typeof c !== 'string')) return '계획 카드 목록이 올바르지 않습니다';
    const slots = planSlotsOf(s, a.faction);
    if (cards.length > slots) return `계획 슬롯은 ${slots}개입니다 (${cards.length}장 제출)`;
    const rest = s.players[a.faction].hand.slice();
    for (const c of cards) {
      const i = rest.indexOf(c);
      if (i < 0) return `손패에 없는 카드입니다: ${c}`;
      rest.splice(i, 1);
    }
    s.players[a.faction].plan = cards.slice();
    s.flow.submitted[a.faction] = true;
    say(s, a.faction, `계획 제출 (${cards.length}장)`);
    ev.push({ type: 'plan', faction: a.faction, count: cards.length });
    return a.assetUse ? useAsset(s, { faction: a.faction, target: a.assetUse.target }, data, ev, true) : s;
  },
  SKIP_PLAN: (s, a, ...r) => ACTIONS.PLAN(s, { ...a, cards: [] }, ...r),
  USE_ASSET: (s, a, data, ev) => useAsset(s, a, data, ev, false),
  CHOOSE(s, a, data, ev) {
    const pc = s.pending?.[0];
    if (!pc) return '대기 중인 선택이 없습니다';
    if (a.pendingId != null && a.pendingId !== pc.id) return '대기 중인 선택 번호가 다릅니다';
    if (pc.faction !== a.faction) return '다른 세력이 선택할 차례입니다';
    const r = resolveChoice(s, pc.id, a.choice, data);
    if (!r.ok) return '선택할 수 없는 값입니다';
    say(r.state, a.faction, `선택: ${JSON.stringify(a.choice)}`);
    ev.push({ type: 'choose', faction: a.faction, choice: a.choice, snap: snapState(r.state) });
    return r.state;
  },
  BUY(s, a, data, ev) {
    if (s.phase !== 'shop') return '지금은 상점 단계가 아닙니다';
    if (s.flow.done[a.faction]) return '이미 상점을 마쳤습니다';
    const r = buy(s, data, a.faction, a.cardId);
    if (!r.ok) return { 'insufficient-capital': '자본이 부족합니다', 'growth-owned': '이미 가진 성장 카드입니다', 'not-available': '구매할 수 없는 카드입니다' }[r.reason] || '구매할 수 없습니다';
    say(r.state, a.faction, `구매: ${name(indexData(data), a.cardId)} (💰 −${r.cost})`);
    ev.push({ type: 'buy', faction: a.faction, cardId: a.cardId, cost: r.cost });
    return r.state;
  },
  END_SHOP(s, a, data, ev) {
    if (s.phase !== 'shop') return '지금은 상점 단계가 아닙니다';
    if (s.flow.done[a.faction]) return '이미 상점을 마쳤습니다';
    s.flow.done[a.faction] = true;
    say(s, a.faction, '상점 종료');
    ev.push({ type: 'endShop', faction: a.faction });
    return s;
  },
};

function useAsset(s, a, data, ev, inPlan) {
  const p = s.players[a.faction], asset = indexData(data).assets[p.strategicAsset];
  if (s.phase !== 'plan') return '전략 자산은 계획 단계에서만 사용할 수 있습니다';
  if (!asset) return '선택한 전략 자산이 없습니다';
  if (p.usedAsset) return '전략 자산을 이미 사용했습니다';
  if (!inPlan && s.flow.submitted[a.faction]) return '계획 제출 뒤에는 전략 자산을 쓸 수 없습니다';
  p.usedAsset = true;
  say(s, a.faction, `전략 자산 사용: ${asset.name}`);
  ev.push({ type: 'asset', faction: a.faction, assetId: asset.id });
  let st = runEffects(s, a.faction, asset.effects, { data, source: 'asset' }).state;
  const pc = st.pending?.[0];
  if (pc && a.target !== undefined) {
    const r = resolveChoice(st, pc.id, a.target, data);
    if (r.ok) st = r.state;
  }
  return st;
}

/** 순수 리듀서. data 생략 시 setData/createGame으로 등록된 데이터를 쓴다 */
export function reduce(state, action, data) {
  const bad = (reason) => ({ ok: false, state, events: [], reason });
  if (!action || typeof action.type !== 'string') return bad('행동 형식이 올바르지 않습니다');
  try {
    data ??= getData();
    if (action.type === 'NEW_GAME') return { ok: true, state: createGame({ data, ...action.config }), events: [{ type: 'newGame' }] };
    if (!state || state.phase === 'end') return bad('이미 끝난 게임입니다');
    const h = ACTIONS[action.type];
    if (!h) return bad('알 수 없는 행동: ' + action.type);
    if (!state.players[action.faction]) return bad('알 수 없는 세력: ' + action.faction);
    if (state.pending?.length && action.type !== 'CHOOSE') return bad('먼저 대기 중인 선택을 해결해야 합니다');
    const ev = [], r = h(deepClone(state), action, data, ev);
    if (typeof r === 'string') return bad(r);
    const adv = advance(r, data);
    if (adv.state.config.debug) validateInvariants(adv.state);
    return { ok: true, state: adv.state, events: ev.concat(adv.events) };
  } catch (e) {
    if (state?.config?.debug) throw e;
    return bad('내부 오류: ' + e.message);
  }
}
