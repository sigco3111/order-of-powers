// AI 배치 시뮬레이터: node tools/simulate.js --games 500 --rounds 8 --levels hard,hard,hard,hard --seed 1 [--rotate-seats] [--json out.json]
// --countries random:N (시드 N으로 무작위 배정 고정) | atlas=deu,redDragon=kor,... (일부만 줘도 됨, 나머지는 기본 국가)
// levels는 세력 순서(atlas, redDragon, polarStar, emerald). --rotate-seats는 판마다 난이도 배정과 좌석(해결 순서) 순서를 섞는다.
import { writeFileSync } from 'node:fs';
import { loadData } from '../src/engine/node-data.js';
import { createGame, reduce, waitingFor, randomCountries, DEFAULT_COUNTRIES } from '../src/engine/index.js';
import { seedToState, shuffle } from '../src/engine/rng.js';
import { chooseAction, LEVELS } from '../src/ai/ai.js';

const FACTIONS = ['atlas', 'redDragon', 'polarStar', 'emerald'];

export function parseArgs(argv) {
  const o = { games: 500, rounds: 8, levels: ['hard', 'hard', 'hard', 'hard'], seed: 1, rotate: false, json: null, countries: null };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i], v = () => argv[++i];
    if (k === '--games') o.games = +v(); else if (k === '--rounds') o.rounds = +v();
    else if (k === '--levels') o.levels = v().split(','); else if (k === '--seed') o.seed = +v();
    else if (k === '--countries') o.countries = v(); else if (k === '--rotate-seats') o.rotate = true; else if (k === '--json') o.json = v();
    else throw new Error('알 수 없는 옵션: ' + k);
  }
  if (o.levels.length !== 4 || o.levels.some((l) => !LEVELS.includes(l))) throw new Error('--levels는 easy|normal|hard 4개');
  return o;
}

/** 한 판. levelOf: {faction: level}. 반환: 결과 요약 */
export function playGame(data, { rounds, seed, levelOf, order = FACTIONS, countries }) {
  let s = createGame({ data, rounds, seed, factions: order, countries });
  const t0 = performance.now(), plays = {}, buys = {};
  let steps = 0;
  while (s.phase !== 'end') {
    if (steps++ > 4000) throw new Error('시뮬레이션이 끝나지 않음 seed ' + seed);
    const f = waitingFor(s)[0];
    const a = chooseAction(s, f, { level: levelOf[f], rngSeed: `${seed}:${steps}`, data });
    const r = reduce(s, a, data);
    if (!r.ok) throw new Error(`불가능한 행동 ${JSON.stringify(a)}: ${r.reason}`);
    for (const e of r.events) {
      if (e.type === 'play') plays[e.cardId] = (plays[e.cardId] || 0) + 1;
      if (e.type === 'buy') buys[e.cardId] = (buys[e.cardId] || 0) + 1;
    }
    s = r.state;
  }
  return { result: s.result, state: s, steps, ms: performance.now() - t0, plays, buys, order };
}

function main() {
  const o = parseArgs(process.argv.slice(2)), data = loadData();
  const name = Object.fromEntries([...data.factions, ...data.cards, ...data.growth].map((x) => [x.id, x.name]));
  const cm = !o.countries ? { ...DEFAULT_COUNTRIES } : o.countries.startsWith('random:') ? randomCountries(data, o.countries.slice(7))
    : { ...DEFAULT_COUNTRIES, ...Object.fromEntries(o.countries.split(',').map((x) => x.split('='))) };
  const cname = Object.fromEntries(data.countries.map((c) => [c.id, c.nameKo]));
  const goalName = Object.fromEntries(data.goals.map((g) => [g.id, g.name]));
  const zero = () => Object.fromEntries(FACTIONS.map((f) => [f, 0]));
  const agg = { win: zero(), total: zero(), regions: zero(), prestige: zero(), goals: zero(), n: zero(), seatWin: [0, 0, 0, 0], seatN: [0, 0, 0, 0], steps: 0, ms: 0, ties: 0 };
  const plays = {}, buys = {}, goalDealt = {}, goalMet = {}, byLevel = {};
  let rng = seedToState(`seat|${o.seed}`);
  const sh = (a) => { const r = shuffle(rng, a); rng = r.rng; return r.array; };
  process.stderr.write(`시뮬레이션 ${o.games}판, ${o.rounds}라운드, 난이도 ${o.levels.join(',')}${o.rotate ? ' (좌석 섞기)' : ''}\n`);
  for (let g = 0; g < o.games; g++) {
    const lv = o.rotate ? sh(o.levels) : o.levels, order = o.rotate ? sh(FACTIONS) : FACTIONS;
    const levelOf = Object.fromEntries(FACTIONS.map((f, i) => [f, lv[i]]));
    const r = playGame(data, { rounds: o.rounds, seed: o.seed * 100000 + g, levelOf, order, countries: cm });
    const { winners, scores } = r.result;
    agg.steps += r.steps; agg.ms += r.ms; if (winners.length > 1) agg.ties++;
    for (const f of FACTIONS) {
      const sc = scores[f], seat = order.indexOf(f), w = winners.includes(f) ? 1 / winners.length : 0;
      agg.win[f] += w; agg.total[f] += sc.total; agg.regions[f] += sc.regions; agg.prestige[f] += sc.prestige; agg.goals[f] += sc.goalPoints; agg.n[f]++;
      agg.seatWin[seat] += w; agg.seatN[seat]++;
      const L = (byLevel[levelOf[f]] ||= { win: 0, n: 0, total: 0 }); L.win += w; L.n++; L.total += sc.total;
      for (const gl of sc.goals) { goalDealt[gl.id] = (goalDealt[gl.id] || 0) + 1; if (gl.met) goalMet[gl.id] = (goalMet[gl.id] || 0) + 1; }
    }
    for (const [c, n] of Object.entries(r.plays)) plays[c] = (plays[c] || 0) + n;
    for (const [c, n] of Object.entries(r.buys)) buys[c] = (buys[c] || 0) + n;
    process.stderr.write('.' + ((g + 1) % 50 === 0 ? ` ${g + 1}\n` : ''));
  }
  process.stderr.write('\n');
  const G = o.games, pct = (x) => (100 * x).toFixed(1).padStart(5) + '%', f1 = (x) => x.toFixed(1).padStart(5);
  console.log(`\n== ${G}판 · ${o.rounds}라운드 · ${o.levels.join('/')} · 시드 ${o.seed}${o.rotate ? ' · 좌석 섞기' : ''} · 국가 ${FACTIONS.map((f) => cname[cm[f]]).join('/')} ==`);
  console.log('세력            승률    평균점수  지역  위신  목표  난이도');
  FACTIONS.forEach((f, i) => console.log(`${(name[f] + ' ' + cname[cm[f]]).padEnd(14, '　')} ${pct(agg.win[f] / agg.n[f])}  ${f1(agg.total[f] / agg.n[f])}  ${f1(agg.regions[f] / agg.n[f])} ${f1(agg.prestige[f] / agg.n[f])} ${f1(agg.goals[f] / agg.n[f])}  ${o.rotate ? '-' : o.levels[i]}`));
  if (o.rotate) for (const [l, v] of Object.entries(byLevel)) console.log(`난이도 ${l}: 승률 ${pct(v.win / v.n)} 평균 ${f1(v.total / v.n)}`);
  console.log(`좌석별 승률(해결 순서 1~4번째 시작): ${agg.seatWin.map((w, i) => pct(w / agg.seatN[i])).join(' ')}`);
  console.log(`길이: 평균 ${(agg.steps / G).toFixed(0)}회 행동, ${(agg.ms / G).toFixed(0)} ms/판 · 공동 승리 ${agg.ties}판`);
  const list = (m, ids) => ids.map((id) => [id, m[id] || 0]);
  const top = (arr, n, asc) => arr.sort((a, b) => (asc ? a[1] - b[1] : b[1] - a[1]) || (a[0] < b[0] ? -1 : 1)).slice(0, n).map(([id, v]) => `${name[id]}(${v})`).join(', ');
  const used = data.cards.map((c) => c.id);
  console.log('많이 쓴 카드 10: ' + top(list(plays, used), 10));
  console.log('적게 쓴 카드 10: ' + top(list(plays, used), 10, true));
  const market = data.cards.filter((c) => c.deck === 'market').map((c) => c.id);
  console.log('많이 산 시장 카드 10: ' + top(list(buys, market), 10));
  console.log('적게 산 시장 카드 10: ' + top(list(buys, market), 10, true));
  console.log('성장 카드 구매: ' + top(list(buys, data.growth.map((x) => x.id)), 10));
  console.log('비밀 목표 달성률: ' + data.goals.map((x) => [x.id, (goalMet[x.id] || 0) / (goalDealt[x.id] || 1)]).sort((a, b) => b[1] - a[1]).map(([id, v]) => `${goalName[id]} ${(100 * v).toFixed(0)}%`).join(', '));
  if (o.json) {
    writeFileSync(o.json, JSON.stringify({ options: o, games: G, winRate: Object.fromEntries(FACTIONS.map((f) => [f, agg.win[f] / agg.n[f]])), avgScore: Object.fromEntries(FACTIONS.map((f) => [f, agg.total[f] / agg.n[f]])), avgSplit: Object.fromEntries(FACTIONS.map((f) => [f, { regions: agg.regions[f] / agg.n[f], prestige: agg.prestige[f] / agg.n[f], goals: agg.goals[f] / agg.n[f] }])), seatWinRate: agg.seatWin.map((w, i) => w / agg.seatN[i]), byLevel, avgSteps: agg.steps / G, avgMs: agg.ms / G, ties: agg.ties, plays, buys, goalDealt, goalMet }, null, 1));
    console.error('JSON 저장: ' + o.json);
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) main();
