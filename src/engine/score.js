import { deepClone, indexData } from './util.js';

export const hasTreaty = (state, a, b) => state.treaties.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

/** { regionId: [factionId...] } — 최다 영향력(>0). 동률은 서로 모두 조약 관계일 때만 공동 주도, 아니면 빈 배열 */
export function regionLeaders(state) {
  const out = {};
  for (const [rid, r] of Object.entries(state.regions)) {
    const max = Math.max(0, ...Object.values(r.influence));
    const top = max > 0 ? Object.keys(r.influence).filter((f) => r.influence[f] === max) : [];
    const ok = top.length === 1 || top.every((a, i) => top.slice(i + 1).every((b) => hasTreaty(state, a, b)));
    out[rid] = ok ? top : [];
  }
  return out;
}

/** 라운드 정산: 주도 세력(공동 주도는 각자 전액)이 scoreValue+scoreBonus를 regionScore에 누적. 새 상태 반환 */
export function scoreRound(state) {
  const s = deepClone(state), leaders = regionLeaders(s);
  for (const [rid, fs] of Object.entries(leaders)) {
    const pts = s.regions[rid].scoreValue + s.regions[rid].scoreBonus;
    for (const f of fs) s.players[f].regionScore += pts;
    if (fs.length) s.log.push({ round: s.round, phase: 'upkeep', actor: fs.join('+'), text: `${rid} 주도 +${pts}` });
  }
  return s;
}

const OPS = { '>=': (a, b) => a >= b, '<=': (a, b) => a <= b, '>': (a, b) => a > b, '<': (a, b) => a < b, '==': (a, b) => a === b, '!=': (a, b) => a !== b };
const regionCount = (s, f, pred) => Object.values(s.regions).filter((r) => pred(r, f)).length;
const ledCount = (s, f) => Object.values(regionLeaders(s)).filter((l) => l.includes(f)).length;

export const METRICS = {
  prestige: (s, f) => s.players[f].prestige,
  capital: (s, f) => s.players[f].resources.capital,
  energy: (s, f) => s.players[f].resources.energy,
  industry: (s, f) => s.players[f].resources.industry,
  regionsWithBase: (s, f) => regionCount(s, f, (r) => r.bases[f] > 0),
  regionsWithInfluence: (s, f) => regionCount(s, f, (r) => r.influence[f] > 0),
  regionsLed: ledCount,
  regionsLedAtFinalScoring: ledCount,
  maxInfluenceInOneRegionEver: (s, f) => Math.max(s.players[f].stats.maxInfluenceEver, ...Object.values(s.regions).map((r) => r.influence[f])),
  influenceGainedInFinalRound: (s, f) => s.players[f].stats.influenceGainedByRound[s.config.rounds] || 0,
  deckSize: (s, f) => { const p = s.players[f]; return p.deck.length + p.hand.length + p.discard.length + p.played.length; },
  usedAsset: (s, f) => s.players[f].usedAsset,
};

/** 지표 값. 알 수 없으면 undefined. "stats.a.b"는 player.stats 경로 */
export function metricValue(state, faction, metric) {
  if (METRICS[metric]) return METRICS[metric](state, faction);
  if (metric.startsWith('stats.')) {
    const v = metric.slice(6).split('.').reduce((o, k) => o?.[k], state.players[faction].stats);
    return typeof v === 'number' ? v : undefined;
  }
  return undefined;
}

/** check 설명자 평가 ({metric,op,value} / allOf / anyOf). unknown 배열에 모르는 지표를 모은다 */
export function checkGoal(state, faction, check, unknown = new Set()) {
  if (check.allOf) return check.allOf.map((c) => checkGoal(state, faction, c, unknown)).every(Boolean);
  if (check.anyOf) return check.anyOf.map((c) => checkGoal(state, faction, c, unknown)).some(Boolean);
  const v = metricValue(state, faction, check.metric);
  if (v === undefined) { unknown.add(check.metric); return false; }
  if (!OPS[check.op]) throw new Error('알 수 없는 연산자: ' + check.op);
  return OPS[check.op](v, check.value);
}

/** 최종 점수 = 누적 지역 점수 + 위신 + 비밀 목표. 동점은 위신 → 자본 순. { scores, ranking, unknownMetrics } */
export function finalScores(state, data) {
  const ix = indexData(data), unknown = new Set(), scores = {};
  for (const [f, p] of Object.entries(state.players)) {
    const goals = p.secretGoals.map((id) => {
      const g = ix.goals[id], met = checkGoal(state, f, g.check, unknown);
      return { id, met, points: met ? g.points : 0 };
    });
    const goalPoints = goals.reduce((a, g) => a + g.points, 0);
    scores[f] = { regions: p.regionScore, prestige: p.prestige, goalPoints, goals, total: p.regionScore + p.prestige + goalPoints };
  }
  const P = state.players;
  const ranking = Object.keys(scores).sort((a, b) =>
    scores[b].total - scores[a].total || P[b].prestige - P[a].prestige || P[b].resources.capital - P[a].resources.capital);
  return { scores, ranking, unknownMetrics: [...unknown] };
}
