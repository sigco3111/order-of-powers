// M3 측정: 판마다 시드로 무작위 국가 배정(전 원형), 보통 AI 4명.
// node tools/measure-m3.js --rounds 6 --games 400 [--shard 0/2] [--mode '{"income":...}'] [--json out.json] ; node tools/measure-m3.js --merge a.json b.json
import { writeFileSync, readFileSync } from 'node:fs';
import { loadData } from '../src/engine/node-data.js';
import { createGame, reduce, waitingFor, randomCountries } from '../src/engine/index.js';
import { chooseAction } from '../src/ai/ai.js';

const F = ['atlas', 'redDragon', 'polarStar', 'emerald'], KO = ['외교', '산업', '군사', '성장'];

function game(data, rounds, seed, level) {
  const countries = randomCountries(data, seed);
  let s = createGame({ data, rounds, seed, factions: F, countries }), steps = 0;
  const probe = Math.ceil(rounds / 2) - 1 || 1, snap = {}; // 6라운드: 2라운드 뒤, 8: 3, 10: 4 → 아래서 라운드 3(6라운드는 2)로 고정
  const at = rounds === 6 ? 2 : 3;
  while (s.phase !== 'end') {
    if (steps++ > 4000) throw new Error('끝나지 않음 ' + seed);
    const f = waitingFor(s)[0];
    const r = reduce(s, chooseAction(s, f, { level, rngSeed: `${seed}:${steps}`, data }), data);
    if (!r.ok) throw new Error('불가능한 행동 ' + r.reason);
    s = r.state;
    if (s.phase === 'shop' && s.round === at && !snap.t) snap.t = Object.fromEntries(F.map((f) => [f, s.players[f].regionScore + s.players[f].prestige]));
  }
  return { res: s.result, steps, lead: snap.t };
}

function main() {
  const a = process.argv.slice(2);
  if (a[0] === '--merge') return report(a.slice(1).map((p) => JSON.parse(readFileSync(p, 'utf8'))));
  const o = { rounds: 8, games: 400, seed: 7, shard: [0, 1], mode: null, json: null, level: 'normal' };
  for (let i = 0; i < a.length; i += 2) {
    const k = a[i], v = a[i + 1];
    if (k === '--rounds') o.rounds = +v; else if (k === '--games') o.games = +v; else if (k === '--seed') o.seed = +v;
    else if (k === '--shard') o.shard = v.split('/').map(Number); else if (k === '--mode') o.mode = JSON.parse(v);
    else if (k === '--json') o.json = v; else if (k === '--level') o.level = v; else throw new Error('옵션 ' + k);
  }
  const data = loadData();
  if (o.mode) data.roundModes = { ...(data.roundModes || {}), [o.rounds]: o.mode };
  const A = { rounds: o.rounds, n: 0, win: [0, 0, 0, 0], first: 0, fourth: 0, steps: 0, leadN: 0, leadWin: 0, ties: 0 };
  for (let g = o.shard[0]; g < o.games; g += o.shard[1]) {
    const r = game(data, o.rounds, o.seed * 100000 + g, o.level);
    const { winners, scores } = r.res, tot = F.map((f) => scores[f].total).sort((x, y) => y - x);
    A.n++; A.steps += r.steps; A.first += tot[0]; A.fourth += tot[3]; if (winners.length > 1) A.ties++;
    F.forEach((f, i) => { if (winners.includes(f)) A.win[i] += 1 / winners.length; });
    if (r.lead) {
      const m = Math.max(...F.map((f) => r.lead[f])), L = F.filter((f) => r.lead[f] === m);
      A.leadN++; A.leadWin += L.filter((f) => winners.includes(f)).length / L.length;
    }
  }
  if (o.json) writeFileSync(o.json, JSON.stringify(A)); else report([A]);
}

function report(list) {
  const S = list.reduce((x, y) => ({ rounds: y.rounds, n: x.n + y.n, win: x.win.map((v, i) => v + y.win[i]), first: x.first + y.first, fourth: x.fourth + y.fourth, steps: x.steps + y.steps, leadN: x.leadN + y.leadN, leadWin: x.leadWin + y.leadWin, ties: x.ties + y.ties }),
    { n: 0, win: [0, 0, 0, 0], first: 0, fourth: 0, steps: 0, leadN: 0, leadWin: 0, ties: 0 });
  const p = (v) => (100 * v / S.n).toFixed(1);
  console.log(`${S.rounds}r n=${S.n} 승률 ${KO.map((k, i) => k + ' ' + p(S.win[i])).join(' / ')} | 1위 ${(S.first / S.n).toFixed(1)} 4위 ${(S.fourth / S.n).toFixed(1)} | 선두우승 ${(100 * S.leadWin / S.leadN).toFixed(0)}% | 행동 ${(S.steps / S.n).toFixed(0)}`);
}

main();
