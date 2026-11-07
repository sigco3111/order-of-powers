// 점수 쏠림·영향력 소멸 진단: node tools/diagnose.js --games 80 --rounds 8 --level normal --seed 1 [--json out.json]
import { writeFileSync } from 'node:fs';
import { loadData } from '../src/engine/node-data.js';
import { createGame, reduce, waitingFor } from '../src/engine/index.js';
import { chooseAction } from '../src/ai/ai.js';

const FACTIONS = ['atlas', 'redDragon', 'polarStar', 'emerald'];
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1]; };

/** 한 판을 돌려 라운드별 기록을 반환 */
export function diagnoseGame(data, { rounds, seed, level }) {
  const R = Array.from({ length: rounds + 1 }, () => ({ add: 0, overflow: 0, card: 0, event: 0, other: 0, absorb: 0, drain: 0 }));
  const hook = (k, round, n, m) => { // AI의 미리보기 시뮬레이션은 세지 않도록 실제 reduce 동안만 켠다
    const r = R[round]; if (!r) return;
    if (k === 'add') { r.add += n; r.overflow += m; } else if (k === 'drain') r.drain += n; else { r[k] += n; r.absorb += m; }
  };
  let s = createGame({ data, rounds, seed, factions: FACTIONS }), steps = 0;
  const rec = [];
  try {
    while (s.phase !== 'end') {
      if (steps++ > 4000) throw new Error('끝나지 않음 ' + seed);
      const f = waitingFor(s)[0];
      const act = chooseAction(s, f, { level, rngSeed: `${seed}:${steps}`, data });
      globalThis.__diag = hook;
      const r = reduce(s, act, data);
      globalThis.__diag = null;
      if (!r.ok) throw new Error(r.reason);
      s = r.state;
      if ((s.phase === 'shop' || s.phase === 'end') && !rec[s.round]) {
        const P = Object.values(s.players);
        const tot = Object.values(s.regions).reduce((a, g) => a + Object.values(g.influence).reduce((x, y) => x + y, 0), 0);
        rec[s.round] = { tokens: tot, region: P.map((p) => p.regionScore), prestige: P.map((p) => p.prestige) };
      }
    }
  } finally { globalThis.__diag = null; }
  const sc = s.result.scores, tot = FACTIONS.map((f) => sc[f].total), lead3 = rec[Math.min(3, rounds)];
  const leadAt3 = lead3.region.map((v, i) => v + lead3.prestige[i]);
  const top3 = leadAt3.indexOf(Math.max(...leadAt3));
  return { R, rec, tot, steps, goals: FACTIONS.map((f) => sc[f].goalPoints), winners: s.result.winners, top3Won: s.result.winners.includes(FACTIONS[top3]) ? 1 / s.result.winners.length : 0 };
}

function main() {
  const games = +arg('games', 80), rounds = +arg('rounds', 8), level = arg('level', 'normal'), seed = +arg('seed', 1), data = loadData();
  const acc = Array.from({ length: rounds + 1 }, () => ({ tokens: 0, add: 0, overflow: 0, card: 0, event: 0, other: 0, absorb: 0, drain: 0, lead: 0, last: 0, region: 0, prestige: 0, maxVanish: 0 }));
  const fin = { tot: 0, first: 0, last: 0, ratios: [], steps: 0, goal: 0, top3: 0, min: 99, max: 0, vanishMax: 0, wins: [0, 0, 0, 0] };
  for (let g = 0; g < games; g++) {
    const d = diagnoseGame(data, { rounds, seed: seed * 100000 + g, level });
    let prev = 0;
    for (let r = 1; r <= rounds; r++) {
      const a = acc[r], x = d.R[r], c = d.rec[r];
      for (const k of ['add', 'overflow', 'card', 'event', 'other', 'absorb', 'drain']) a[k] += x[k];
      a.tokens += c.tokens;
      const totals = c.region.map((v, i) => v + c.prestige[i]);
      a.lead += Math.max(...totals); a.last += Math.min(...totals);
      a.region += c.region.reduce((p, v) => p + v, 0) / 4; a.prestige += c.prestige.reduce((p, v) => p + v, 0) / 4;
      const removed = x.card + x.event + x.other, before = prev + x.add;
      if (before > 0) fin.vanishMax = Math.max(fin.vanishMax, removed / before), a.maxVanish += removed / before;
      prev = c.tokens;
    }
    const sorted = d.tot.slice().sort((p, q) => q - p);
    fin.tot += d.tot.reduce((p, v) => p + v, 0) / 4; fin.first += sorted[0]; fin.last += sorted[3];
    fin.ratios.push(sorted[0] / Math.max(1, sorted[3])); fin.steps += d.steps; fin.goal += d.goals.reduce((p, v) => p + v, 0) / 4; fin.top3 += d.top3Won;
    fin.min = Math.min(fin.min, sorted[3]); fin.max = Math.max(fin.max, sorted[0]);
    d.winners.forEach((w) => { fin.wins[FACTIONS.indexOf(w)] += 1 / d.winners.length; });
  }
  const G = games, f1 = (x) => (x / G).toFixed(1).padStart(6);
  console.log(`== 진단: ${G}판 · ${rounds}라운드 · ${level} 4명 · 시드 ${seed} ==`);
  console.log('R  지도영향력  추가  상한소실  카드제거  이벤트제거  방어흡수  징수(자원)  1위점수 4위점수  지역(평균) 위신(평균)  소멸비율(평균)');
  for (let r = 1; r <= rounds; r++) {
    const a = acc[r];
    console.log(`${r}  ${f1(a.tokens)}    ${f1(a.add)} ${f1(a.overflow)}  ${f1(a.card)}  ${f1(a.event)}  ${f1(a.absorb)}  ${f1(a.drain)}  ${f1(a.lead)} ${f1(a.last)}  ${f1(a.region)} ${f1(a.prestige)}  ${(100 * a.maxVanish / G).toFixed(0)}%`);
  }
  const med = fin.ratios.sort((p, q) => p - q)[Math.floor(G / 2)];
  console.log(`최종 평균 ${f1(fin.tot)} (지역+위신 누적 위, 목표 평균 ${f1(fin.goal)}) · 1위 ${f1(fin.first)} · 4위 ${f1(fin.last)} · 1위/4위 평균비 ${(fin.first / fin.last).toFixed(2)} 중앙비 ${med.toFixed(2)} · 최소 4위 ${fin.min} 최대 1위 ${fin.max}`);
  console.log(`3라운드 선두가 우승한 비율 ${(100 * fin.top3 / G).toFixed(0)}% · 한 라운드 최대 소멸 ${(100 * fin.vanishMax).toFixed(0)}% · 길이 ${(fin.steps / G).toFixed(0)}회 행동 · 승률 ${fin.wins.map((w) => (100 * w / G).toFixed(0)).join('/')}`);
  const j = arg('json', null);
  if (j) writeFileSync(j, JSON.stringify({ acc, fin }, null, 1));
}
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) main();
