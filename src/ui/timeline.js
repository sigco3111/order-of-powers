// 해결 연출용 순수 로직: 엔진 이벤트(snap 포함)를 단계·요약으로 바꾼다. DOM 없음 (node 테스트 가능).
import { snapState } from '../engine/util.js';
import { plainText } from './effect-text.js';

/** 두 스냅샷의 지역 변화 → { rid: { faction: { dir, prev, now, kind } } } (영향력·기지·방어) */
export function diffSnap(a, b) {
  const fx = {};
  for (const [rid, r] of Object.entries(b.regions)) for (const kind of ['influence', 'bases', 'defense']) for (const [f, now] of Object.entries(r[kind])) {
    const prev = a.regions[rid]?.[kind]?.[f] ?? 0;
    if (prev !== now) ((fx[rid] ||= {})[f] ||= []).push({ kind, prev, now, dir: now > prev ? 'up' : 'down' });
  }
  return fx;
}
const KIND_KO = { influence: '영향력', bases: '기지', defense: '방어' };
/** 변화 목록 → 한 줄 문장 */
export function fxLines(fx, name, regionName) {
  return Object.entries(fx).flatMap(([rid, byF]) => Object.entries(byF).flatMap(([f, list]) => list.map((c) => `${regionName(rid)} · ${name(f)} ${KIND_KO[c.kind]} ${c.now > c.prev ? '+' : '−'}${Math.abs(c.now - c.prev)}`)));
}

/**
 * 배치({ events, before, after }) → 단계 목록. 단계 = 카드 하나(또는 선택 하나)의 결과.
 * { kind, faction, cardId, source, snap, fx, lines }  lines = 로그에서 뽑은 결과 문장(지역 id → 이름)
 */
export function stepsOf(batch, { regionName = (x) => x } = {}) {
  const { events, before, after } = batch, steps = [];
  let prev = snapState(before), logPos = before.log.length;
  const src = before.pending?.[0]?.ctx;
  let cur = src ? { source: src.source, cardId: src.cardId, eventId: src.eventId } : null;
  for (const ev of events) {
    if (!ev.snap) continue;
    const isMove = ev.type === 'play' || ev.type === 'choose' || ev.type === 'deferred';
    if (ev.type === 'play') cur = { source: 'card', cardId: ev.cardId };
    if (ev.type === 'deferred') cur = { source: 'event', eventId: ev.id };
    if (isMove) {
      const fx = diffSnap(prev, ev.snap);
      const lines = after.log.slice(logPos, ev.snap.log).filter((l) => !/^\[|^선택:|^계획|^카드 사용:|^해결 순서/.test(l.text))
        .map((l) => plainText(l.text).replace(/\b[a-z][a-zA-Z]+\b/g, (w) => regionName(w)));
      steps.push({ kind: ev.type, faction: ev.faction ?? null, ...cur, snap: ev.snap, fx, lines });
    }
    prev = ev.snap; logPos = ev.snap.log;
  }
  return steps;
}

/** 공개된 계획 목록: [{ faction, cards, rank }] (해결 순서) */
export function revealOf(events) {
  const order = events.find((e) => e.type === 'order')?.order, plans = Object.fromEntries(events.filter((e) => e.type === 'reveal').map((e) => [e.faction, e.cards]));
  return order ? order.map((faction, i) => ({ faction, cards: plans[faction] || [], rank: i + 1 })) : [];
}

/** 정비 요약: [{ faction, delta, income, total, prestige }] — 점수는 이번 라운드 증가분 */
export function summaryOf(batch) {
  const sc = batch.events.filter((e) => e.type === 'score');
  if (!sc.length) return null;
  const inc = Object.fromEntries(batch.events.filter((e) => e.type === 'income').map((e) => [e.faction, e.income]));
  return sc.map((e) => ({ faction: e.faction, delta: e.regionScore - (batch.before.players[e.faction]?.regionScore ?? 0), income: inc[e.faction] || {}, total: e.regionScore, prestige: batch.after.players[e.faction].prestige }));
}
