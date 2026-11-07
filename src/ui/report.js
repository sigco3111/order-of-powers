// 결과 보고서 모델: 끝난 상태에서 순위표·비밀 목표·점수 추이·하이라이트·공유 문구를 만든다 (순수 함수, DOM 없음)
import { seatName } from '../engine/countries.js';
import { indexData } from '../engine/util.js';

export const LEVEL_KO = { easy: '쉬움', normal: '보통', hard: '어려움' };

/** 라운드별 누적 지역 점수 { factionId: [r1, r2, ...] } — upkeep 로그("… 주도 +N", actor = "a+b")에서 복원 */
export function scoreHistory(state) {
  const n = state.config.rounds, out = {};
  for (const f of state.turnOrder) out[f] = Array(n).fill(0);
  for (const e of state.log) {
    const m = e.phase === 'upkeep' && /주도 \+(\d+)$/.exec(e.text);
    if (!m || e.round < 1 || e.round > n) continue;
    for (const f of String(e.actor).split('+')) if (out[f]) out[f][e.round - 1] += Number(m[1]);
  }
  for (const f of state.turnOrder) { // 누적, 로그와 최종값이 어긋나면 마지막 라운드에서 보정
    for (let i = 1; i < n; i++) out[f][i] += out[f][i - 1];
    out[f][n - 1] += state.players[f].regionScore - out[f][n - 1];
  }
  return out;
}

/** 내가 가장 많이 낸 카드와 가장 득점이 큰 라운드 (로그/기록에서 바로 나오는 것만) */
export function highlights(state, data, history) {
  const human = state.config.humanFaction, ix = indexData(data), out = [];
  if (human == null) return out;
  const cnt = {};
  for (const e of state.log) if (e.actor === human && e.text.startsWith('카드 사용: ')) { const k = e.text.slice(7); cnt[k] = (cnt[k] || 0) + 1; }
  const top = Object.entries(cnt).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'))[0];
  if (top) out.push({ label: '가장 많이 쓴 카드', value: top[0], note: `${top[1]}회` });
  const h = history[human]; let best = null;
  h.forEach((v, i) => { const d = v - (h[i - 1] ?? 0); if (d > 0 && (!best || d > best.d)) best = { d, r: i + 1 }; });
  if (best) out.push({ label: '가장 득점이 큰 라운드', value: `${best.r}라운드`, note: `지역 점수 +${best.d}` });
  const own = state.players[human].growth.length;
  if (own) out.push({ label: '들인 성장 카드', value: state.players[human].growth.map((g) => ix.growth[g]?.name ?? g).join(', '), note: `${own}장` });
  return out;
}

export function buildReport(state, data) {
  const res = state.result; if (!res) return null;
  const ix = indexData(data), human = state.config.humanFaction, P = state.players;
  const sameKey = (a, b) => res.scores[a].total === res.scores[b].total && P[a].prestige === P[b].prestige && P[a].resources.capital === P[b].resources.capital;
  const rows = res.ranking.map((f, i) => {
    const s = res.scores[f], first = res.ranking.findIndex((g) => sameKey(g, f));
    return { f, name: seatName(state, f, data), iso: P[f].iso ?? '', rank: first + 1, regions: s.regions, prestige: s.prestige, goalPoints: s.goalPoints, total: s.total, capital: P[f].resources.capital, you: f === human, win: res.winners.includes(f), idx: i };
  });
  const goals = human == null ? [] : res.scores[human].goals.map((g) => ({ id: g.id, name: ix.goals[g.id]?.name ?? g.id, condition: ix.goals[g.id]?.condition ?? '', points: ix.goals[g.id]?.points ?? 0, met: g.met, earned: g.points }));
  let tieNote = null;
  if (res.tie) tieNote = '총점·위신·자본이 모두 같아 공동 승리입니다.';
  else if (rows[0].total === rows[1].total) tieNote = rows[0].prestige !== rows[1].prestige ? `총점이 같아 위신(${rows[0].prestige} 대 ${rows[1].prestige})으로 승자를 가렸습니다.` : `총점·위신이 같아 자본(${rows[0].capital} 대 ${rows[1].capital})으로 승자를 가렸습니다.`;
  const history = scoreHistory(state), me = rows.find((r) => r.you);
  return {
    rows, goals, tieNote, history, tie: !!res.tie, winners: res.winners, winnerNames: res.winners.map((f) => seatName(state, f, data)),
    winner: rows.find((r) => r.f === res.winner), me, humanWon: !!me?.win, goalsMet: goals.filter((g) => g.met).length,
    highlights: highlights(state, data, history),
    settings: { country: me?.name ?? '-', rounds: state.config.rounds, level: state.config.aiLevel, levelKo: LEVEL_KO[state.config.aiLevel] ?? state.config.aiLevel, seed: state.seed },
  };
}

/** 저장할 기록 한 줄 */
export function recordOf(state, report, date = new Date().toISOString()) {
  const s = report.settings, me = report.me;
  return { id: `${s.seed}-${s.rounds}-${state.config.countries?.[state.config.humanFaction] ?? state.config.humanFaction}-${s.level}`, date, country: state.config.countries?.[state.config.humanFaction] ?? null,
    countryName: s.country, archetype: state.config.humanFaction, rounds: s.rounds, level: s.level, seed: s.seed, score: me?.total ?? 0, rank: me?.rank ?? 0, win: report.humanWon, winner: report.winnerNames.join(', '), tie: report.tie };
}

/** 공유용 한국어 요약 */
export function shareText(report) {
  const s = report.settings, me = report.me;
  return [`[Order of Powers 최종 보고] ${s.country} · ${s.rounds}라운드 · ${s.levelKo} · 시드 ${s.seed}`,
    `${report.tie ? '공동 승리' : '승자'}: ${report.winnerNames.join(', ')}  ·  내 결과: ${me.rank}위 ${me.total}점 (지역 ${me.regions} + 위신 ${me.prestige} + 목표 ${me.goalPoints})`,
    '순위: ' + report.rows.map((r) => `${r.rank}위 ${r.name} ${r.total}`).join(' / '),
    'https://sigco3111.github.io/order-of-powers/'].join('\n');
}
