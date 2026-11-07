// 컴퓨터 상대 (AI). chooseAction(state, faction, {level, rngSeed}) → 합법 수 하나. 전역 난수·상태 변경 없음.
// 난이도: easy = 정적 가치 + 잡음, normal = 한 수 앞 시뮬레이션, hard = normal + 상대 계획 모델·목표·종반·견제.
import { legalActions, reduce, getData } from '../engine/index.js';
import { finalScores } from '../engine/score.js';
import { regionLeaders, metricValue } from '../engine/score.js';
import { planSlotsOf } from '../engine/state.js';
import { seatName, josa } from '../engine/countries.js';
import { seedToState, nextInt, nextFloat, shuffle } from '../engine/rng.js';
import { deepClone, indexData, hashState } from '../engine/util.js';

export const LEVELS = ['easy', 'normal', 'hard'];
export const aiMeta = {
  easy: { name: '쉬움', description: '가끔 무작위로 두고 전략 자산과 비밀 목표를 거의 살리지 못합니다.' },
  normal: { name: '보통', description: '계획마다 결과를 미리 계산해 가장 이득인 수를 고릅니다.' },
  hard: { name: '어려움', description: '상대의 계획을 예측하고 비밀 목표와 종반을 챙기며 선두를 견제합니다.' },
};
// 평가 가중치: goal 비밀 목표, hand 손패, a/b/c 상대 감점(전체/최강/점수 선두), N 후보 계획 수, S 상대 계획 표본 수
const LV = {
  easy: { goal: 0, hand: 0.05, a: 0.1, b: 0.1, c: 0, N: 0, S: 0 },
  normal: { goal: 0.5, hand: 0.1, a: 0.15, b: 0.25, c: 0, N: 10, S: 1 },
  hard: { goal: 1, hand: 0.1, a: 0.15, b: 0.25, c: 0.2, N: 20, S: 3 },
};
const VOLATILE = new Set(['capital', 'energy', 'industry', 'prestige', 'regionsLed', 'regionsLedAtFinalScoring', 'regionsWithBase', 'regionsWithInfluence']);
const PRE_UPKEEP = new Set(['setup', 'event', 'plan', 'reveal', 'resolve']);
const sum = (a) => a.reduce((x, y) => x + y, 0);

// ---------- 정적 가치 (점수 환산 근사) ----------
function effValue(e, late) {
  const a = e.amount ?? e.count ?? e.value ?? 1;
  switch (e.type) {
    case 'gain': return e.res === 'prestige' ? a : e.res === 'capital' ? a * (late ? 0.05 : 0.3) : a * 0.06;
    case 'influence': return a * (e.filter === 'owned' ? 1.1 : 1.25);
    case 'removeInfluence': return a * (e.from === 'leader' ? 1.2 : 0.95);
    case 'defense': return e.scope === 'allOwned' ? 1.2 * a : 0.5 * a;
    case 'base': return 2.2 * a;
    case 'destroyBase': return 1.2;
    case 'draw': return 0.5 * a;
    case 'discard': return e.who === 'target' ? 0.4 * a : -0.4 * a;
    case 'treaty': return a;
    case 'drain': return 0.2 * a;
    case 'peek': return 0.1;
    case 'modifier': return 0.5;
    case 'conditional': return 0.5 * sum((e.then || []).map((t) => effValue(t, late)));
    case 'custom': return 1.5;
    default: return 0;
  }
}
const effsValue = (effs, late) => sum((effs || []).map((e) => effValue(e, late)));
const GROWTH_KEY = { 'income.prestige': 1, 'income.capital': 0.3, 'income.industry': 0.05, 'income.energy': 0.05, handSize: 1, planSlots: 2, 'shop.costDelta': 0.8, baseDefenseBonus: 0.5, firstDiplomaticInfluenceBonus: 1.2 };
const growthValue = (g, turns) => turns * sum(g.effects.filter((e) => e.type === 'modifier').map((e) => (GROWTH_KEY[e.key] ?? 0.4) * Math.abs(e.value)));
const cardV = (ix, id, late) => { const c = ix.cards[id]; return c ? effsValue(c.effects, late) : 0; };

// ---------- 평가 함수 ----------
const maxOther = (r, f) => { let m = 0; for (const g in r.influence) if (g !== f && r.influence[g] > m) m = r.influence[g]; return m; };
/** 지역 하나의 기대 점수 (m: 내 영향력, o: 최고 상대, sv: 점수 가치, R: 남은 정산 횟수) */
function regVal(m, o, sv, R) {
  if (m > o) return sv * R * (m - o >= 3 ? 1 : m - o === 2 ? 0.92 : 0.8);
  if (!m || o - m > 2) return 0;
  return sv * R * (0.35 - 0.12 * (o - m));
}
const remOf = (s) => (s.phase === 'end' ? 0 : s.config.rounds - s.round + (PRE_UPKEEP.has(s.phase) ? 1 : 0));
const discount = (rem, eg) => (eg || rem <= 2 ? rem : 2 + (rem - 2) * 0.75);

function progress(s, f, c, rem) {
  if (c.allOf) return c.allOf.reduce((a, x) => a * progress(s, f, x, rem), 1);
  if (c.anyOf) return Math.max(...c.anyOf.map((x) => progress(s, f, x, rem)));
  const v = metricValue(s, f, c.metric);
  if (v === undefined) return 0.3;
  if (c.op === '>=') return v >= c.value ? (VOLATILE.has(c.metric) ? 0.75 : 1) : 0.9 * (v / c.value) ** (VOLATILE.has(c.metric) ? 2 : 1.4) * Math.min(1, 0.25 + 0.18 * rem);
  if (c.op === '==' && c.value === true) return v ? 1 : s.players[f].strategicAsset ? 0.75 : 0;
  if (c.op === '==' && c.value === 0) return v === 0 ? 0.9 ** rem : 0;
  return 0;
}

/** 세력 f 관점의 상태 평가 (높을수록 좋음). opt: {level, data} */
export function evaluate(state, faction, opt = {}) {
  const data = opt.data ?? getData(), ix = indexData(data), W = LV[opt.level ?? 'normal'];
  const R = state.config.rounds, ids = state.turnOrder, opps = ids.filter((f) => f !== faction);
  const pen = (raws, tops) => sum(opps.map((o) => raws[o] * (W.a + (o === tops.max ? W.b : 0) + (o === tops.lead ? W.c : 0))));
  if (state.phase === 'end') {
    const fs = finalScores(state, data).scores, raws = Object.fromEntries(opps.map((o) => [o, fs[o].total]));
    return fs[faction].total - pen(raws, { max: opps.reduce((a, o) => (raws[o] > raws[a] ? o : a)) });
  }
  const rem = remOf(state), eg = opt.level === 'hard' && state.round >= R - 1, Rd = discount(rem, eg);
  const leaders = regionLeaders(state), shops = R - state.round, cv = 0.3 * Math.min(1, shops / 3);
  const raw = (f) => {
    const p = state.players[f];
    let v = p.regionScore + p.prestige;
    for (const rid in state.regions) {
      const r = state.regions[rid], m = r.influence[f], sv = r.scoreValue + r.scoreBonus;
      v += regVal(m, maxOther(r, f), sv, Rd) * (leaders[rid].length > 1 && leaders[rid].includes(f) ? 0.75 : 1);
      v += 0.12 * m * Math.min(1, rem / 3) + (r.bases[f] || 0) * 0.6 * Math.min(1, rem / 2);
      if (PRE_UPKEEP.has(state.phase)) v += Math.min(r.defense[f], m) * 0.25;
    }
    v += Math.min(p.resources.capital, 12) * cv + (p.resources.energy + p.resources.industry) * 0.04 * Math.min(1, rem / 4);
    return v;
  };
  const raws = {};
  for (const f of ids) raws[f] = raw(f);
  const me = state.players[faction];
  let v = raws[faction];
  if (W.goal) v += W.goal * sum(me.secretGoals.map((id) => ix.goals[id].points * progress(state, faction, ix.goals[id].check, rem)));
  if (rem > 1) v += W.hand * sum(me.hand.map((c) => cardV(ix, c, false)).sort((a, b) => b - a).slice(0, 3));
  const tot = (o) => state.players[o].regionScore + state.players[o].prestige;
  const pick = (key) => opps.reduce((a, o) => (key(o) > key(a) ? o : a));
  return v - pen(raws, { max: pick((o) => raws[o]), lead: pick(tot) });
}

// ---------- 시뮬레이션 도구 ----------
const make = (state, faction, level, rngSeed, data) => {
  const ctx = { state, me: faction, level, W: LV[level], data, ix: indexData(data), seed: `${rngSeed}|${faction}|${hashState(state)}` };
  ctx.rng = seedToState(ctx.seed);
  ctx.rand = (n) => { const r = nextInt(ctx.rng, n); ctx.rng = r.rng; return r.value; };
  ctx.float = () => { const r = nextFloat(ctx.rng); ctx.rng = r.rng; return r.value; };
  return ctx;
};
const optionsOf = (pc) => {
  if (pc.kind !== 'regionPair') return pc.options;
  return pc.options.flatMap((x, i) => pc.options.slice(i + 1).map((y) => [x, y]));
};
/** 대기 선택지 하나의 빠른 점수 (시뮬레이션 없이) */
function quickScore(ctx, s, pc, choice) {
  const me = pc.faction, ix = ctx.ix, rem = Math.max(1, remOf(s)), R = discount(rem, false);
  const reg = (rid, amt, kind) => {
    const r = s.regions[rid], m = r.influence[me], o = maxOther(r, me), sv = r.scoreValue + r.scoreBonus;
    switch (kind) {
      case 'influence': return regVal(m + amt, o, sv, R) - regVal(m, o, sv, R) + 0.12 * amt;
      case 'removeInfluence': return o ? regVal(m, Math.max(0, o - amt), sv, R) - regVal(m, o, sv, R) + 0.2 * sv * Math.min(amt, o) / 4 : -1;
      case 'defense': return m ? sv * 0.15 * Math.min(m, 3) * (m >= o ? 1 : 0.5) : -1;
      case 'base': return regVal(m + 1, o, sv, R) - regVal(m, o, sv, R) + 0.6;
      default: return m ? sv : 0;
    }
  };
  const e = pc.effect || {}, tot = (f) => s.players[f].regionScore + s.players[f].prestige;
  switch (pc.kind) {
    case 'region': return reg(choice, e.amount ?? 1, e.type);
    case 'regionPair': return sum(choice.map((r) => reg(r, 1, 'influence')));
    case 'faction': return e.type === 'treaty' ? -tot(choice) : tot(choice);
    case 'card': { const v = cardV(ix, choice, false); return e.type === 'discard' ? -v : v; }
    default: return choice === true ? 1 : 0;
  }
}
const quickPick = (ctx, s, pc) => {
  let best, bs = -Infinity;
  for (const c of optionsOf(pc)) { const v = quickScore(ctx, s, pc, c); if (v > bs) { bs = v; best = c; } }
  return best;
};
/** 대기 선택을 모두 해결: 나는 빠른 휴리스틱, 상대는 시뮬레이션 RNG의 무작위 */
function settle(ctx, st, rand) {
  for (let g = 0; g < 40 && st.pending?.length; g++) {
    const pc = st.pending[0], opts = optionsOf(pc);
    const choice = pc.faction === ctx.me ? quickPick(ctx, st, pc) : opts[rand(opts.length)];
    const r = reduce(st, { type: 'CHOOSE', faction: pc.faction, pendingId: pc.id, choice }, ctx.data);
    if (!r.ok) return st;
    st = r.state;
  }
  return st;
}
/** 행동을 복제본에 적용하고 선택 대기를 해결한 상태. prep(복제본)으로 가정 설정. 불가능하면 null */
function simulate(ctx, st, action, prep, seed) {
  let s = { ...st, log: [] }; // 로그는 시뮬레이션에 필요 없고 복제 비용만 키운다
  if (prep) { s = deepClone(s); prep(s); }
  s = { ...s, rng: seedToState(seed), config: { ...s.config, debug: false } };
  const r = reduce(s, action, ctx.data);
  if (!r.ok) return null;
  let rr = seedToState(seed + '|c');
  return settle(ctx, r.state, (n) => { const x = nextInt(rr, n); rr = x.rng; return x.value; });
}
const valueOf = (ctx, st) => evaluate(st, ctx.me, { level: ctx.level, data: ctx.data });

/** 상대 계획 표본: 컬렉션에서 카드 가치로 가중해 슬롯 수만큼 (손패 크기 이내) */
function sampleOppPlans(ctx, st, k) {
  const out = [];
  for (let i = 0; i < k; i++) {
    const plans = {};
    for (const o of st.turnOrder) {
      if (o === ctx.me) continue;
      const p = st.players[o], pool = Object.entries(p.collection).flatMap(([c, n]) => Array(n).fill(c)), plan = [];
      for (let j = Math.min(planSlotsOf(st, o), p.hand.length); j > 0 && pool.length; j--) {
        const w = pool.map((c) => 1 + Math.max(0, cardV(ctx.ix, c, false)));
        let x = ctx.float() * sum(w), idx = 0;
        while (idx < w.length - 1 && x >= w[idx]) x -= w[idx++];
        plan.push(pool.splice(idx, 1)[0]);
      }
      plans[o] = plan;
    }
    out.push({ plans, seed: `${ctx.seed}|scn${i}` });
  }
  return out;
}
const prepFor = (ctx, scn) => (s) => {
  for (const o of s.turnOrder) {
    if (o === ctx.me) continue;
    s.players[o].hand = scn.plans[o].slice(); s.players[o].plan = scn.plans[o].slice(); s.flow.submitted[o] = true;
  }
  s.players[ctx.me].deck = shuffle(seedToState(scn.seed + '|deck'), s.players[ctx.me].deck).array;
};

// ---------- 결정 ----------
const staticPlan = (ctx, cards, late) => sum(cards.map((c, i) => cardV(ctx.ix, c, late) * (1 - 0.04 * i)));
/** 후보 계획 상위 N개 (정적 점수 60% + 무작위 40%), 최대 60개에서 표본 */
function shortlist(ctx, plans, N) {
  let pool = plans;
  if (pool.length > 60) { pool = pool.slice(); for (let i = pool.length - 1; i > 0; i--) { const j = ctx.rand(i + 1); [pool[i], pool[j]] = [pool[j], pool[i]]; } pool = pool.slice(0, 60); }
  const late = remOf(ctx.state) <= 1, sorted = pool.slice().sort((a, b) => staticPlan(ctx, b.cards, late) - staticPlan(ctx, a.cards, late));
  const top = sorted.slice(0, Math.ceil(N * 0.6)), rest = sorted.slice(top.length);
  while (top.length < N && rest.length) top.push(rest.splice(ctx.rand(rest.length), 1)[0]);
  const empty = pool.find((a) => !a.cards.length);
  if (empty && !top.includes(empty)) top.push(empty);
  return top;
}
/** 계획 후보들을 상대 표본 위에서 평가한 평균 → {action, value}[] */
function scorePlans(ctx, st, cands, scns) {
  return cands.map((a) => {
    const vs = scns.map((sc) => { const s = simulate(ctx, st, a, prepFor(ctx, sc), sc.seed); return s ? valueOf(ctx, s) : -Infinity; });
    return { action: a, value: sum(vs) / vs.length };
  });
}
const best = (list) => list.reduce((a, b) => (b.value > a.value ? b : a));

function choosePlan(ctx, legal) {
  const st = ctx.state, plans = legal.filter((a) => a.type === 'PLAN'), asset = legal.find((a) => a.type === 'USE_ASSET');
  if (ctx.level === 'easy') {
    if (asset && ctx.float() < 0.08) return asset;
    if (ctx.float() < 0.6) return best(plans.map((a) => ({ action: a, value: staticPlan(ctx, a.cards, false) + ctx.float() * 0.3 }))).action;
    return plans[ctx.rand(plans.length)];
  }
  const scns = sampleOppPlans(ctx, st, ctx.W.S), top = scorePlans(ctx, st, shortlist(ctx, plans, ctx.W.N), scns);
  const b = best(top);
  if (asset) {
    const after = simulate(ctx, st, asset, null, ctx.seed + '|asset');
    if (after && after.phase === 'plan' && !after.pending?.length) {
      const pl = legalActions(after, ctx.me, ctx.data).filter((a) => a.type === 'PLAN');
      const c2 = ctx.data && shortlist(ctx, pl, 6), v2 = best(scorePlans(ctx, after, c2, scns));
      if (v2.value - b.value > 0.6 * Math.max(0, remOf(st) - 2)) return asset;
    }
  }
  return b.action;
}

function chooseChoice(ctx, legal) {
  const st = ctx.state, pc = st.pending[0];
  const qs = legal.map((a) => ({ action: a, value: quickScore(ctx, st, pc, a.choice) + ctx.float() * 1e-6 }));
  if (ctx.level === 'easy') return ctx.float() < 0.6 ? best(qs).action : legal[ctx.rand(legal.length)];
  const cands = qs.sort((a, b) => b.value - a.value).slice(0, 8).map((q) => q.action);
  const vals = cands.map((a, i) => { const s = simulate(ctx, st, a, null, `${ctx.seed}|ch${i}`); return { action: a, value: s ? valueOf(ctx, s) : -Infinity }; });
  return best(vals).action;
}

// ---------- 구매: 현재 필요(덱 구성·목표·지역 압박·시기)에 맞춘 점수 ----------
const CAT = ['domestic', 'diplomatic', 'military'];
/** 내 비밀 목표 중 카드 구매가 도움이 되는 항목 → 카드에 줄 가산점 */
function goalPull(ctx, c, effs, turns) {
  const st = ctx.state, me = st.players[ctx.me], ix = ctx.ix, txt = JSON.stringify(effs);
  const plays = Math.max(0, turns * 2.2); // 앞으로 살 수 있는 카드가 쓰일 대략의 횟수
  let v = 0;
  const leaf = (g, ck) => {
    if (g.points <= 0 || progress(st, ctx.me, ck, turns + 1) >= 1) return;
    const m = ck.metric, need = ck.value - (metricValue(st, ctx.me, m) || 0), k = 0.2 * g.points;
    if (m.startsWith('stats.cardsPlayed.')) { if (c.category === m.slice(18) && need > 0 && need <= plays + 4) v += k * 1.6; }
    else if (m === 'deckSize') { if (need > 0 && need <= turns * 2.5) v += k * 1.2; }
    else if (m === 'regionsWithBase') { if (/"base"/.test(txt)) v += k * 3; else if (/"influence"/.test(txt)) v += k * 0.3; }
    else if (m === 'stats.treatiesMade') { if (/"treaty"|"id":"dip-10"/.test(txt)) v += k * 3; }
    else if (m === 'stats.influenceRemoved') { if (/removeInfluence|"id":"mil-12"/.test(txt)) v += k * 2.2; }
    else if (m === 'maxInfluenceInOneRegionEver' || m === 'influenceGainedInFinalRound' || m === 'regionsWithInfluence' || m === 'regionsLed' || m === 'regionsLedAtFinalScoring') { if (/"influence"|"id":"dip-14"|"id":"mil-12"/.test(txt)) v += k * 1.2; }
    else if (m === 'prestige') { if (/"res":"prestige"/.test(txt)) v += k * 1.2; }
    else if (m === 'capital' || m === 'energy' || m === 'industry') { if (new RegExp(`"res":"${m}"`).test(txt)) v += k * 1.0; }
    else if (m === 'stats.influenceLost' || m === 'stats.sanctionsReceived') { if (/"defense"/.test(txt)) v += k * 0.5; }
  };
  const walk = (g, ck) => { if (ck.allOf) ck.allOf.forEach((x) => walk(g, x)); else if (ck.anyOf) ck.anyOf.forEach((x) => walk(g, x)); else leaf(g, ck); };
  for (const id of me.secretGoals) walk(ix.goals[id], ix.goals[id].check);
  return ctx.level === 'easy' ? 0 : v * (ctx.level === 'hard' ? 1.2 : 1);
}
/** 지역 압박·시기·덱 구성에 따른 카드 가산점 */
function needPull(ctx, c, effs, turns, deckCats, N) {
  const st = ctx.state, me = ctx.me;
  let own = 0, contested = 0, led = 0;
  for (const rid in st.regions) {
    const r = st.regions[rid], m = r.influence[me], o = maxOther(r, me);
    if (m > 0) own++;
    if (m > 0 && o >= m) contested++;
    if (m > 0 && m > o && r.defense[me] < 2) led++;
  }
  const early = turns >= 4, late = turns <= 2;
  let v = 0;
  for (const e of effs) {
    const a = e.amount ?? e.count ?? 1;
    switch (e.type) {
      case 'influence': v += a * (own < 3 ? 0.8 : own < 5 ? 0.4 : 0.1) * (late ? 1.2 : 1); break;
      case 'removeInfluence': v += a * 0.25 * Math.min(3, contested); break;
      case 'defense': v += 0.2 * Math.min(3, led) * a; break;
      case 'base': v += early ? 0.6 : 0.2; break;
      case 'draw': v += early ? 0.4 * a : 0; break;
      case 'gain': if (e.res === 'prestige') v += a > 0 ? (late ? 0.5 * a : 0) : 0; else if (e.res === 'capital') v += a > 0 && early ? 0.25 * a : 0; else v += (own > 1 && !late ? 0.1 : 0) * a; break;
      case 'drain': case 'discard': v += 0.3; break;
      case 'treaty': v += 0.5; break;
      default: break;
    }
  }
  const share = (deckCats[c.category] || 0) / Math.max(1, N);
  if (share > 0.5) v -= 0.8 * (share - 0.5) * 4; else if (share < 0.25) v += 0.5;
  return v;
}

function chooseBuy(ctx, legal) {
  const st = ctx.state, me = ctx.me, p = st.players[me], ix = ctx.ix, end = legal.find((a) => a.type === 'END_SHOP');
  const buys = legal.filter((a) => a.type === 'BUY');
  if (!buys.length) return end;
  if (ctx.level === 'easy') return ctx.float() < 0.55 ? buys[ctx.rand(buys.length)] : end;
  const R = st.config.rounds, turns = R - st.round, late = turns <= 1;
  const coll = Object.entries(p.collection), N = sum(coll.map(([, n]) => n));
  const avg = sum(coll.map(([c, n]) => cardV(ix, c, late) * n)) / Math.max(1, N);
  const plays = (turns * 3) / (N + 1);
  const deckCats = {};
  for (const [c, n] of coll) { const k = ix.cards[c]?.category; deckCats[k] = (deckCats[k] || 0) + n; }
  const scored = buys.map((a) => {
    const g = ix.growth[a.cardId], c = ix.cards[a.cardId] ?? g;
    const cost = Math.max(1, c.cost + (p.modifiers['shop.costDelta'] || 0));
    let v;
    if (g) {
      v = growthValue(g, turns) * 0.8 ** p.growth.length + (ctx.level === 'hard' && st.round <= 3 && !p.growth.length ? 3 : 0);
    } else {
      const dup = p.collection[a.cardId] || 0;
      v = (cardV(ix, a.cardId, late) - 0.9 * avg) * plays + (/base|treaty|leader/.test(JSON.stringify(c.effects)) ? 0.5 : 0);
      v += needPull(ctx, c, c.effects, turns, deckCats, N) + goalPull(ctx, c, c.effects, turns);
      if (p.firstPurchase.includes(a.cardId)) v *= 1.1;
      v -= dup * 0.9 * (1 + Math.abs(v) * 0.3);
    }
    return { action: a, value: v - cost * 0.45 + (ctx.float() - 0.5) * 1.6 };
  });
  const b = best(scored);
  return b.value > (ctx.level === 'hard' ? 0.15 : 0.3) ? b.action : end;
}

function pickAsset(ctx, legal) {
  if (ctx.level === 'easy') return legal[ctx.rand(legal.length)];
  return best(legal.map((a) => ({ action: a, value: effsValue(ctx.ix.assets[a.assetId].effects, false) + ctx.float() * 0.1 }))).action;
}

/** 합법 수 하나를 고른다. 같은 상태와 같은 rngSeed면 같은 행동. 상태는 바꾸지 않는다 */
export function chooseAction(state, faction, { level = 'normal', rngSeed = 0, data = getData() } = {}) {
  if (!LV[level]) throw new Error('알 수 없는 난이도: ' + level);
  const legal = legalActions(state, faction, data);
  if (!legal.length) return null;
  if (legal.length === 1) return legal[0];
  const ctx = make(state, faction, level, rngSeed, data);
  if (state.pending?.length) return chooseChoice(ctx, legal);
  switch (state.phase) {
    case 'setup': return pickAsset(ctx, legal);
    case 'plan': return choosePlan(ctx, legal);
    case 'shop': return chooseBuy(ctx, legal);
    default: return legal[0];
  }
}

// ---------- UI 로그용 설명 ----------
/** 행동을 짧은 한국어 문장으로. (계획 카드는 공개 전이라 숨긴다) */
export function describeIntent(state, action, data = getData()) {
  const ix = indexData(data), fn = (f) => seatName(state, f, data), rn = (r) => ix.regions[r]?.name ?? r;
  const who = josa(fn(action.faction), '이', '가');
  switch (action.type) {
    case 'PICK_ASSET': return `${who} 전략 자산을 골랐다`;
    case 'PLAN': case 'SKIP_PLAN': return `${who} 계획을 세웠다`;
    case 'USE_ASSET': return `${who} 전략 자산을 사용했다`;
    case 'BUY': { const c = ix.cards[action.cardId] ?? ix.growth[action.cardId]; return `${who} ${josa(c?.name ?? action.cardId, '을', '를')} 구매했다`; }
    case 'END_SHOP': return `${who} 상점을 마쳤다`;
    case 'CHOOSE': {
      const pc = state.pending?.find((p) => p.id === action.pendingId) ?? state.pending?.[0], t = pc?.effect?.type, c = action.choice;
      if (pc?.kind === 'region') {
        const place = josa(rn(c), '에', '에');
        const verb = { influence: '영향력을 놓았다', removeInfluence: '의 영향력을 줄였다', defense: '에 방어를 세웠다', base: '에 기지를 세웠다' }[t];
        if (t === 'influence') return `${who} ${rn(c)}에 영향력을 놓았다`;
        if (t === 'removeInfluence') return `${who} ${rn(c)}의 영향력을 줄였다`;
        return verb ? `${who} ${rn(c)}${verb}` : `${who} ${place} 선택했다`;
      }
      if (pc?.kind === 'regionPair') return `${who} ${c.map(rn).join('과 ')}에 영향력을 놓았다`;
      if (pc?.kind === 'faction') return `${who} ${josa(fn(c), '을', '를')} ${t === 'treaty' ? '조약 상대로' : '대상으로'} 골랐다`;
      if (pc?.kind === 'card') return `${who} 카드를 골랐다`;
      return `${who} ${c === true ? '비용을 지불했다' : '지불하지 않았다'}`;
    }
    default: return `${who} ${action.type}`;
  }
}
