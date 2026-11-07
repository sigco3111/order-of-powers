// 효과 실행기. 상태는 복제본에서만 바꾼다. 선택이 필요하면 state.pending에 대기 객체를 쌓고 멈춘다.
// 대기 객체: { id, faction(선택자), kind, effect, options, filter, actor, stage, rest(남은 효과), ctx }
import { deepClone, indexData } from './util.js';
import { nextInt, shuffle } from './rng.js';
import { RULES, getMod, drawCards } from './state.js';
import { hasTreaty } from './score.js';
import { CUSTOM } from './effects-custom.js';
import { localize } from './countries.js';

export const getModifier = getMod;
const KO = { capital: '💰 자본', energy: '🛢 에너지', industry: '🏭 산업', prestige: '⭐ 위신' };
const sign = (n) => (n >= 0 ? '+' : '') + n;

// ---------- 공용 헬퍼 (effects-custom.js에서도 사용) ----------
export const opponents = (s, f) => s.turnOrder.filter((x) => x !== f);
export const partners = (s, f) => opponents(s, f).filter((x) => hasTreaty(s, f, x));
export const log = (s, actor, text) => s.log.push({ round: s.round, phase: s.phase, actor, text: localize(s, text) });
export const roundMods = (s, f) => (s.players[f].roundModifiers ||= {});
export function rand(s, n) { const r = nextInt(s.rng, n); s.rng = r.rng; return r.value; }
export const pick = (s, arr) => arr[rand(s, arr.length)];
export const topFactions = (reg) => {
  const max = Math.max(0, ...Object.values(reg.influence));
  return max > 0 ? Object.keys(reg.influence).filter((f) => reg.influence[f] === max) : [];
};
export function recordPeek(s, f, entry) { ((s.peeked ||= {})[f] ||= []).push({ round: s.round, ...entry }); }

/** 자원 증감. 자원은 0 미만으로 내려가지 않고 위신은 음수 가능 */
export function gainRes(s, f, res, n) {
  const p = s.players[f];
  if (res === 'prestige') p.prestige += n; else p.resources[res] = Math.max(0, p.resources[res] + n);
}

/** 영향력 추가 (세력당 지역 최대 6, 초과분은 사라짐). 실제 증가량 반환 */
export function addInfluence(s, f, rid, n) {
  const r = s.regions[rid], st = s.players[f].stats, cur = r.influence[f], now = Math.min(RULES.maxInfluence, cur + n);
  r.influence[f] = now;
  st.maxInfluenceEver = Math.max(st.maxInfluenceEver, now);
  st.influenceGainedByRound[s.round] = (st.influenceGainedByRound[s.round] || 0) + now - cur;
  return now - cur;
}

/** 영향력 감소: 감소 수정치 → 방어 흡수(방어 1점이 1을 막고 소모) → 제거. { out, blocked } 반환 */
export function loseInfluence(s, victim, rid, n, { by = null, event = false } = {}) {
  const r = s.regions[rid];
  n = Math.max(0, n - getMod(s, victim, 'influenceLossReduction.self') - getMod(s, null, 'influenceLossReduction.all'));
  const blocked = Math.min(r.defense[victim], n);
  r.defense[victim] -= blocked;
  const out = Math.min(n - blocked, r.influence[victim]);
  r.influence[victim] -= out;
  s.players[victim].stats.influenceLost += out;
  if (by && by !== victim) s.players[by].stats.influenceRemoved += out;
  if (event && out) (s.eventLosses ||= []).push({ f: victim, region: rid, amount: out });
  return { out, blocked };
}

/** sa-07: 나를 대상으로 하는 카드 효과 1개 무효 (이벤트는 대상 아님) */
export function negated(X, actor, victim) {
  const m = X.s.players[victim].roundModifiers;
  if (victim === actor || X.ctx.source === 'event' || !(m?.negateTargetedEffect > 0)) return false;
  m.negateTargetedEffect -= 1;
  log(X.s, victim, '사이버 방벽: 대상 효과 무효');
  return true;
}

// ---------- 조건 ----------
const rankTest = (vals, f, rank) => vals[f] === (rank === 'highest' ? Math.max(...Object.values(vals)) : Math.min(...Object.values(vals)));
const vals = (s, fn) => Object.fromEntries(s.turnOrder.map((f) => [f, fn(s.players[f])]));
const total = (p) => Object.values(p.roundPlays || {}).reduce((a, b) => a + b, 0);

/** 조건 평가 (payOptional 제외). 동률은 모두 해당 */
export function testIf(s, f, c) {
  if ('treatyMadeThisRound' in c) return s.treaties.some((t) => t.includes(f)) === c.treatyMadeThisRound;
  if (c.playedCategoryThisRound) return (s.players[f].roundPlays?.[c.playedCategoryThisRound] || 0) > 0;
  if (c.cardsPlayedThisRoundRank) return total(s.players[f]) > 0 && rankTest(vals(s, total), f, c.cardsPlayedThisRoundRank);
  if (c.prestigeRank) return rankTest(vals(s, (p) => p.prestige), f, c.prestigeRank);
  if (c.resourceRank) return rankTest(vals(s, (p) => p.resources[c.resourceRank.res]), f, c.resourceRank.rank);
  throw new Error('알 수 없는 조건: ' + JSON.stringify(c));
}
/** 이번 라운드 카드 사용 결과에 의존하는 이벤트 (해결 단계 뒤에 적용해야 의미가 있다) */
export const isDeferredEvent = (ev) => ev.effects.some((e) => e.type === 'conditional' && (e.if.playedCategoryThisRound || e.if.cardsPlayedThisRoundRank));

// ---------- 효과 핸들러: (X, item) ----------
// X = { s, q(대기열), ctx, data, req }, item = { f, e, choice, stage }
function region(X, it, options) {
  if (X.ctx.region) return X.ctx.region;
  // 같은 카드에 owned 필터 효과가 있으면 (예: 징집령) 첫 선택부터 내 영향력이 있는 지역으로 좁힌다
  if (X.ctx.ownedFirst) { const mine = options.filter((r) => X.s.regions[r].influence[it.f] > 0); if (mine.length) options = mine; }
  if (it.stage === 'region') return (X.ctx.region = it.choice);
  if (!options.length) log(X.s, it.f, '대상 지역 없음');
  else X.ask(it, 'region', options, 'region');
  return null;
}
const allRegions = (s) => Object.keys(s.regions);
const uniq = (a) => [...new Set(a)];
const costOf = (X, c) => indexData(X.data).cards[c]?.cost ?? 0;
const lowestCost = (X, hand) => (X.data ? hand.reduce((b, c) => (costOf(X, c) < costOf(X, b) ? c : b)) : hand[0]);
function drop(X, f, card) {
  const p = X.s.players[f];
  p.hand.splice(p.hand.indexOf(card), 1);
  const i = p.plan.indexOf(card);
  if (i >= 0) p.plan.splice(i, 1);
  p.discard.push(card);
  log(X.s, f, `손패 버림: ${card}`);
}

const H = {
  gain(X, { f, e }) {
    const n = e.amount + (X.ctx.capBonus && e.res === 'capital' && e.amount > 0 ? X.ctx.capBonus : 0);
    gainRes(X.s, f, e.res, n);
    log(X.s, f, `${KO[e.res]} ${sign(n)}`);
  },
  influence(X, it) {
    const { f, e } = it, s = X.s;
    const rid = region(X, it, allRegions(s).filter((r) => e.filter !== 'owned' || s.regions[r].influence[f] > 0));
    if (!rid) return;
    if (e.filter === 'owned' && s.regions[rid].influence[f] === 0) return log(s, f, `${rid}에 내 영향력이 없어 영향력 효과 생략`);
    let n = e.amount + (X.ctx.influenceBonus || 0);
    delete X.ctx.influenceBonus;
    const pf = s.players[f], tr = pf.trait; // 국가 특성: 매 라운드 본거지(또는 지정 이웃 지역)에 처음 놓는 영향력 +n
    if (tr?.type === 'regionFirstInfluence' && rid === (tr.region === 'home' ? pf.home : tr.region) && !pf.roundHomeUsed) { pf.roundHomeUsed = true; n += tr.amount; }
    const got = addInfluence(s, f, rid, n);
    log(s, f, `${rid} 영향력 +${got}${got < n ? ` (상한, ${n - got} 소실)` : ''}`);
  },
  removeInfluence(X, it) {
    const { f, e } = it, s = X.s, leader = e.from === 'leader';
    const cand = allRegions(s).filter((r) => (leader ? topFactions(s.regions[r]).length : opponents(s, f).some((o) => s.regions[r].influence[o] > 0)));
    const rid = region(X, it, cand);
    if (!rid) return;
    const reg = s.regions[rid];
    let victims = leader ? topFactions(reg) : opponents(s, f).filter((o) => reg.influence[o] > 0);
    if (!leader && victims.length > 1) {
      if (it.stage !== 'victim') return X.ask(it, 'faction', victims, 'victim');
      victims = [it.choice];
    }
    if (!victims.length) return log(s, f, `${rid} 제거할 영향력 없음`);
    for (const v of victims) {
      if (negated(X, f, v)) continue;
      const n = e.baseAmount != null && reg.bases[v] > 0 ? e.baseAmount : e.amount;
      const r = loseInfluence(s, v, rid, n, { by: f });
      log(s, f, `${rid} ${v} 영향력 −${r.out}${r.blocked ? ` (방어 ${r.blocked} 흡수)` : ''}`);
    }
  },
  defense(X, it) {
    const { f, e } = it, s = X.s;
    if (e.scope === 'allOwned') {
      for (const r of allRegions(s)) if (s.regions[r].influence[f] > 0) s.regions[r].defense[f] += e.amount;
      return log(s, f, `내 모든 지역 방어 +${e.amount}`);
    }
    const rid = region(X, it, allRegions(s));
    if (!rid) return;
    s.regions[rid].defense[f] += e.amount;
    log(s, f, `${rid} 방어 +${e.amount}`);
  },
  base(X, it) {
    const { f, e } = it, s = X.s;
    const rid = region(X, it, allRegions(s));
    if (!rid) return;
    for (let i = 0; i < e.amount; i++) {
      s.regions[rid].bases[f] += 1;
      addInfluence(s, f, rid, 1);
      s.regions[rid].defense[f] += 1 + getMod(s, f, 'baseDefenseBonus');
    }
    log(s, f, `${rid} 기지 설치 (영향력 +1, 방어 +${1 + getMod(s, f, 'baseDefenseBonus')})`);
  },
  destroyBase(X, it) {
    const { f, stage } = it, s = X.s, has = (v) => allRegions(s).filter((r) => s.regions[r].bases[v] > 0);
    let v = X.ctx.baseVictim;
    if (!stage) {
      const c = opponents(s, f).filter((o) => has(o).length);
      if (!c.length) return log(s, f, '파괴할 기지 없음');
      return X.ask(it, 'faction', c, 'target');
    }
    if (stage === 'target') v = X.ctx.baseVictim = it.choice;
    if (negated(X, f, v)) return;
    let rid = it.choice;
    if (stage === 'target') { const rs = has(v); if (rs.length > 1) return X.ask(it, 'region', rs, 'baseRegion'); rid = rs[0]; }
    s.regions[rid].bases[v] -= 1;
    log(s, f, `${rid} ${v} 기지 파괴`);
  },
  draw(X, { f, e }) {
    const before = X.s.players[f].hand.length;
    X.s = drawCards(X.s, f, e.amount);
    log(X.s, f, `카드 ${X.s.players[f].hand.length - before}장 뽑음`);
  },
  discard(X, it) {
    const { f, e, stage } = it, s = X.s;
    if (e.who === 'self') {
      const hand = uniq(s.players[f].hand);
      if (!hand.length) return log(s, f, '버릴 손패 없음');
      return stage === 'card' ? drop(X, f, it.choice) : X.ask(it, 'card', hand, 'card');
    }
    if (stage === 'target') X.ctx.target = it.choice;
    if (!X.ctx.target) return X.ask(it, 'faction', opponents(s, f), 'target');
    const v = X.ctx.target;
    if (stage === 'card') return drop(X, v, it.choice);
    if (negated(X, f, v)) return;
    const hand = uniq(s.players[v].hand);
    if (!hand.length) return log(s, f, `${v} 손패 없음`);
    const seen = (X.ctx.peeked || []).filter((c) => hand.includes(c));
    if (seen.length) return X.ask(it, 'card', seen, 'card');
    drop(X, v, lowestCost(X, hand));
  },
  treaty(X, it) {
    const { f, stage } = it, s = X.s;
    if (getMod(s, null, 'treatiesVoid')) return log(s, f, '조약 무효 (무역 분쟁)');
    const c = opponents(s, f).filter((o) => !hasTreaty(s, f, o));
    if (!c.length) return log(s, f, '맺을 수 있는 조약 상대 없음');
    if (stage !== 'target') return X.ask(it, 'faction', c, 'target');
    s.treaties.push([f, it.choice]);
    (X.ctx.treated ||= []).push(it.choice);
    s.players[f].stats.treatiesMade += 1;
    s.players[it.choice].stats.treatiesMade += 1;
    log(s, f, `${it.choice}와 조약 체결`);
  },
  peek(X, it) {
    const { f, e, stage } = it, s = X.s;
    if (e.what === 'eventDeck') {
      const cards = s.eventDeck.slice(0, e.amount);
      recordPeek(s, f, { kind: 'eventDeck', cards });
      return log(s, f, `이벤트 덱 위 ${cards.length}장 확인`);
    }
    if (stage === 'target') X.ctx.target = it.choice;
    if (!X.ctx.target) return X.ask(it, 'faction', opponents(s, f), 'target');
    const r = shuffle(s.rng, s.players[X.ctx.target].hand);
    s.rng = r.rng;
    const cards = r.array.slice(0, e.amount);
    X.ctx.peeked = cards;
    recordPeek(s, f, { kind: 'hand', target: X.ctx.target, cards });
    log(s, f, `${X.ctx.target} 손패 ${cards.length}장 확인`);
  },
  drain(X, it) {
    const { f, e, stage } = it, s = X.s;
    if (stage !== 'target') return X.ask(it, 'faction', opponents(s, f), 'target');
    const v = it.choice;
    if (negated(X, f, v)) return;
    gainRes(s, v, e.res, -e.amount);
    s.players[v].stats.sanctionsReceived += 1;
    log(s, f, `${v} ${KO[e.res]} −${e.amount}`);
  },
  modifier(X, { f, e }) {
    const s = X.s, v = e.value === true ? 1 : e.value, ev = X.ctx.source === 'event';
    const bag = e.scope === 'game'
      ? (ev ? s.modifiers.game : s.players[f].modifiers)
      : (ev || e.key.endsWith('.all') ? s.modifiers.round : roundMods(s, f));
    bag[e.key] = (bag[e.key] || 0) + v;
    log(s, f, `수정치 ${e.key} ${sign(v)} (${e.scope === 'game' ? '게임' : '라운드'})`);
    if (e.key === 'ignoreEventEffectInRegion') X.q.unshift({ f, e: { type: 'ignoreEvent' }, pre: true });
  },
  conditional(X, it) {
    const { f, e, stage } = it, s = X.s, c = e.if, then = () => X.q.unshift(...e.then.map((t) => ({ f, e: t })));
    if (!c.payOptional) return testIf(s, f, c) && then();
    const { res, amount } = c.payOptional;
    if (stage === 'confirm') {
      if (!it.choice) return;
      gainRes(s, f, res, -amount);
      log(s, f, `${KO[res]} ${amount} 추가 지불`);
      return then();
    }
    if (s.players[f].resources[res] >= amount) return X.ask(it, 'confirm', [true, false], 'confirm');
    log(s, f, `${KO[res]} 부족: 추가 효과 생략`);
  },
  /** 내부: 이벤트로 잃은 영향력을 한 지역에서 되돌린다 (ignoreEventEffectInRegion*) */
  ignoreEvent(X, it) {
    const { f, stage } = it, s = X.s, mine = (s.eventLosses || []).filter((l) => l.f === f);
    if (!mine.length) return;
    if (stage !== 'ignore') return X.ask(it, 'region', uniq(mine.map((l) => l.region)), 'ignore');
    const rid = it.choice, back = mine.filter((l) => l.region === rid).reduce((a, l) => a + l.amount, 0);
    s.regions[rid].influence[f] = Math.min(RULES.maxInfluence, s.regions[rid].influence[f] + back);
    s.players[f].stats.influenceLost -= back;
    s.eventLosses = s.eventLosses.filter((l) => !(l.f === f && l.region === rid));
    log(s, f, `${rid} 이벤트 효과 무시 (영향력 +${back} 복구)`);
  },
  custom(X, it) {
    const fn = CUSTOM[it.e.id];
    if (!fn) throw new Error('구현되지 않은 커스텀 효과: ' + it.e.id);
    fn(X, it);
  },
};

// ---------- 실행 루프 ----------
const half = (n) => Math.sign(n) * Math.ceil(Math.abs(n) / 2);

function makeX(s, data, ctx, q) {
  const X = { s, data, ctx, q, req: null, created: [] };
  /** 선택 요청. 선택지가 하나뿐이면 (confirm 제외) 대기 없이 바로 이어서 실행 */
  X.ask = (it, kind, options, stage, faction = it.f) => {
    if (options.length === 1 && kind !== 'confirm') X.q.unshift({ ...it, choice: options[0], stage, pre: true });
    else X.req = { faction, kind, effect: it.e, options, filter: it.e.filter ?? it.e.from ?? it.e.scope ?? null, actor: it.f, stage };
    return true;
  };
  return X;
}

function run(X) {
  while (X.q.length) {
    let it = X.q.shift();
    if (!it.pre) {
      let e = it.e;
      if (X.ctx.half && typeof e.amount === 'number') e = { ...e, amount: half(e.amount) };
      const n = e.type === 'treaty' ? e.count : e.type === 'discard' ? e.amount : 1;
      if (n > 1) {
        const one = e.type === 'treaty' ? { ...e, count: 1 } : { ...e, amount: 1 };
        X.q.unshift(...Array.from({ length: n }, () => ({ f: it.f, e: one, pre: true })));
        continue;
      }
      it = { ...it, e };
    }
    if (!H[it.e.type]) throw new Error('알 수 없는 효과: ' + it.e.type);
    H[it.e.type](X, it);
    if (X.req) {
      const s = X.s, { data, ...ctx } = X.ctx;
      const p = { id: 'pc' + (s.pendingSeq = (s.pendingSeq || 0) + 1), ...X.req, rest: X.q, ctx };
      (s.pending ||= []).push(p);
      X.created.push(p);
      break;
    }
  }
  return { state: X.s, pending: X.created };
}

const start = (state) => { const s = deepClone(state); s.pending ||= []; return s; };
const strip = (ctx = {}) => { const { data, ...c } = ctx; return deepClone(c); };

/** 효과 배열을 순서대로 실행. ctx: { source:'card'|'event'|..., data?, region?, ... } → { state, pending[] } */
export function runEffects(state, faction, effects, ctx = {}) {
  const X = makeX(start(state), ctx.data, strip(ctx), effects.map((e) => ({ f: faction, e })));
  return run(X);
}

function legal(p, c) {
  if (p.kind === 'regionPair') return Array.isArray(c) && c.length === 2 && c[0] !== c[1] && c.every((x) => p.options.includes(x));
  return p.options.includes(c);
}

/** 대기 중인 선택을 해결하고 남은 효과를 이어서 실행. 잘못된 선택이면 { ok:false } */
export function resolveChoice(state, pendingId, choice, data) {
  const i = (state.pending || []).findIndex((p) => p.id === pendingId);
  if (i < 0) return { ok: false, reason: 'no-such-pending', state };
  if (!legal(state.pending[i], choice)) return { ok: false, reason: 'illegal-choice', state };
  const s = start(state), [p] = s.pending.splice(i, 1);
  const X = makeX(s, data, p.ctx, [{ f: p.actor, e: p.effect, choice, stage: p.stage, pre: true }, ...p.rest]);
  return { ok: true, ...run(X) };
}

/** AI/시뮬레이션용. policy(state, pending) → 선택. 없으면 시드 RNG로 무작위 합법 선택. { choice, rng } 반환 */
export function autoChoose(state, pending, policy, rngState = state.rng) {
  if (typeof policy === 'function') return { choice: policy(state, pending), rng: rngState };
  const o = pending.options;
  if (pending.kind === 'regionPair') {
    const r = shuffle(rngState, o);
    return { choice: r.array.slice(0, 2), rng: r.rng };
  }
  const r = nextInt(rngState, o.length);
  return { choice: o[r.value], rng: r.rng };
}

/** 대기 중인 선택을 모두 자동 해결 (테스트·시뮬레이션용) */
export function autoResolve(state, policy, data) {
  let s = state;
  while (s.pending?.length) {
    const p = s.pending[0], { choice, rng } = autoChoose(s, p, policy, s.rng);
    const r = resolveChoice({ ...s, rng }, p.id, choice, data);
    if (!r.ok) throw new Error('자동 선택 실패: ' + r.reason);
    s = r.state;
  }
  return s;
}

// ---------- 이벤트 / 카드 / 라운드 정리 ----------
/** 이벤트 적용: gain은 모든 세력, conditional은 시작 시점 스냅샷으로 세력별 판정, modifier/custom은 전역 */
export function applyEvent(state, event, ctx = {}) {
  const s = start(state), items = [];
  s.eventLosses = [];
  log(s, 'event', `이벤트: ${event.name}`);
  for (const e of event.effects) {
    if (e.type === 'modifier' || e.type === 'custom') items.push({ f: null, e });
    else for (const f of s.turnOrder) {
      if (e.type !== 'conditional') items.push({ f, e });
      else if (testIf(s, f, e.if)) items.push(...e.then.map((t) => ({ f, e: t })));
    }
  }
  for (const f of s.turnOrder) if (getMod(s, f, 'ignoreEventEffectInRegionPerRound') > 0) items.push({ f, e: { type: 'ignoreEvent' } });
  return run(makeX(s, ctx.data, { ...strip(ctx), source: 'event', eventId: event.id }, items));
}

/** 카드 사용: 계획/손패 → 사용 더미, 통계 갱신, 효과 실행. ctx.data 필수 */
export function playCard(state, faction, cardId, ctx = {}) {
  const card = indexData(ctx.data).cards[cardId], p0 = state.players[faction];
  if (!card) return { ok: false, reason: 'unknown-card', state };
  if (!p0 || !p0.hand.includes(cardId)) return { ok: false, reason: 'not-in-hand', state };
  const s = start(state), p = s.players[faction], cat = card.category;
  p.hand.splice(p.hand.indexOf(cardId), 1);
  if (p.plan.includes(cardId)) p.plan.splice(p.plan.indexOf(cardId), 1);
  p.played.push(cardId);
  const rp = (p.roundPlays ||= {});
  const c = { ...strip(ctx), source: 'card', cardId, category: cat };
  if (cat === 'military' && getMod(s, null, 'militaryEffectHalfRoundUp')) c.half = true;
  if (card.effects.some((e) => e.filter === 'owned')) c.ownedFirst = true;
  if (cat === 'domestic') c.capBonus = getMod(s, null, 'domesticCapitalBonus');
  if (cat === 'diplomatic' && !rp.diplomatic) c.influenceBonus = getMod(s, faction, 'firstDiplomaticInfluenceBonus');
  p.stats.cardsPlayed[cat] += 1;
  rp[cat] = (rp[cat] || 0) + 1;
  log(s, faction, `카드 사용: ${card.name}`);
  return { ok: true, ...run(makeX(s, ctx.data, c, card.effects.map((e) => ({ f: faction, e })))) };
}

/** 라운드 종료 정리: 방어·라운드 수정치·조약·확인 정보 초기화 (nextRound.* 수정치는 다음 라운드로 승계) */
export function clearRoundEffects(state) {
  const s = deepClone(state);
  const carry = (bag) => Object.fromEntries(Object.entries(bag || {}).filter(([k]) => k.startsWith('nextRound.')).map(([k, v]) => [k.slice(10), v]));
  for (const r of Object.values(s.regions)) for (const f of Object.keys(r.defense)) r.defense[f] = 0;
  s.modifiers.round = carry(s.modifiers.round);
  for (const p of Object.values(s.players)) { p.roundModifiers = carry(p.roundModifiers); p.roundPlays = {}; p.roundBuys = 0; p.roundHomeUsed = false; }
  s.treaties = []; s.peeked = {}; s.eventLosses = [];
  return s;
}
