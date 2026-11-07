// U3b: 상점 모델·구매 흐름, 결과 보고서 모델, 기록·업적 (DOM 없음, localStorage는 가짜)
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../src/engine/node-data.js';
import { reduce, randomCountries, validateInvariants } from '../src/engine/index.js';
import { createLoop } from '../src/ui/loop.js';
import { shopView, shopItem, deckSummary, rivalBuys, costNote } from '../src/ui/shop-model.js';
import { buildReport, scoreHistory, recordOf, shareText } from '../src/ui/report.js';
import { readRecords, addRecord, bestByRounds, winCount, readMeta, updateMeta, ACHIEVEMENTS, RECORDS_KEY, MAX_RECORDS } from '../src/ui/records.js';

const data = loadData(), ids = data.factions.map((f) => f.id), H = 'redDragon';
const mock = () => { const m = new Map(); return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, String(v)), removeItem: (k) => void m.delete(k) }; };
const cfg = { rounds: 6, factions: ids, humanFaction: H, seed: 11, aiLevel: 'easy', countries: randomCountries(data, 11, { [H]: 'kor' }) };

/** 6라운드 한 판을 사람 몫까지 자동으로 두며 상점마다 콜백을 부른다 */
async function play(onShop) {
  const loop = createLoop({ data, storage: mock() }); loop.start(cfg);
  const shops = [];
  for (let g = 0; g < 600 && loop.state.phase !== 'end'; g++) {
    if ((await loop.run({ auto: false })) === 'end') break;
    if (loop.state.phase === 'shop') { if (!shops.includes(loop.state.round)) shops.push(loop.state.round); onShop?.(loop.state, loop); }
    assert.equal(loop.dispatch(loop.pick(H)).ok, true);
  }
  return { loop, shops };
}
let cache;
const game = () => (cache ??= (async () => { let first = null; const r = await play((s) => { first ??= structuredClone(s); }); return { ...r, first }; })());

test('상점: 가격·구매 가능 여부·고유 카드·성장 카드가 모두 나온다', async () => {
  const { first } = await game(), v = shopView(first, data, H);
  assert.equal(v.market.length, 6);
  assert.equal(v.first.length, 2);
  assert.ok(v.first.every((x) => x.kind === 'first'));
  assert.ok(v.growth.length > 0 && v.growth.every((x) => x.kind === 'growth'));
  assert.equal(v.capital, first.players[H].resources.capital);
  for (const it of [...v.market, ...v.first, ...v.growth]) {
    assert.equal(it.afford, it.cost <= v.capital);
    assert.equal(it.short, Math.max(0, it.cost - v.capital));
    assert.equal(it.reason, it.afford ? null : `자본 부족 (−${it.short})`);
  }
});

test('상점: 자본이 모자라면 사유 문구 "자본 부족 (−N)"과 BUY 거절', async () => {
  const { first } = await game(), s = structuredClone(first);
  s.players[H].resources.capital = 1;
  const it = shopItem(s, data, H, s.market.slots[0], 'market');
  assert.equal(it.afford, false);
  assert.equal(it.reason, `자본 부족 (−${it.cost - 1})`);
  const r = reduce(s, { type: 'BUY', faction: H, cardId: it.id }, data);
  assert.equal(r.ok, false); assert.match(r.reason, /자본이 부족/);
});

test('상점: 비용 수정치(할인/인상)가 원가와 함께 보인다', async () => {
  const { first } = await game(), s = structuredClone(first), id = s.market.slots.find((c) => data.cards.find((x) => x.id === c).cost >= 3);
  s.modifiers.round['shop.costDelta'] = -1;
  let it = shopItem(s, data, H, id, 'market');
  assert.equal(it.cost, it.base - 1); assert.equal(it.delta, -1); assert.equal(it.note, '할인 −1');
  s.modifiers.round['shop.costDelta'] = 2;
  it = shopItem(s, data, H, id, 'market');
  assert.equal(it.cost, it.base + 2); assert.equal(it.note, '인상 +2');
  assert.equal(costNote(0), null);
  s.modifiers.round['shop.costDelta'] = -9; // 최소 비용 1
  assert.equal(shopItem(s, data, H, id, 'market').cost, 1);
});

test('상점: BUY로 구매하면 자본이 줄고 버린 더미로 가며 시장이 채워진다 (사람이 누르는 것과 같은 reduce)', async () => {
  const { first } = await game(), s = structuredClone(first);
  s.players[H].resources.capital = 20;
  const id = s.market.slots[0], before = s.players[H], cost = shopItem(s, data, H, id, 'market').cost, slots = s.market.slots.slice();
  const r = reduce(s, { type: 'BUY', faction: H, cardId: id }, data);
  assert.equal(r.ok, true);
  const p = r.state.players[H];
  assert.equal(p.resources.capital, 20 - cost);
  assert.equal(p.discard.length, before.discard.length + 1); assert.ok(p.discard.includes(id));
  assert.equal(r.state.market.slots.length, 6, '시장 즉시 보충');
  assert.ok(!r.state.market.slots.includes(id) || slots.filter((x) => x === id).length > 1);
  assert.ok(r.state.log.some((e) => e.actor === H && e.text.startsWith('구매:')), '기록에 남는다');
  assert.equal(shopView(r.state, data, H).capital, 20 - cost);
  validateInvariants(r.state);
});

test('상점: 첫 구매 카드는 시장을 채우지 않고, 성장 카드는 덱이 아니라 growth로 간다', async () => {
  const { first } = await game(), s = structuredClone(first);
  s.players[H].resources.capital = 30;
  const fp = s.players[H].firstPurchase[0], marketBefore = s.market.slots.slice();
  let r = reduce(s, { type: 'BUY', faction: H, cardId: fp }, data);
  assert.equal(r.ok, true); assert.deepEqual(r.state.market.slots, marketBefore); assert.ok(!r.state.players[H].firstPurchase.includes(fp));
  const g = shopView(r.state, data, H).growth[0];
  const deckBefore = deckSummary(r.state, data, H).total;
  r = reduce(r.state, { type: 'BUY', faction: H, cardId: g.id }, data);
  assert.equal(r.ok, true);
  assert.ok(r.state.players[H].growth.includes(g.id));
  assert.equal(deckSummary(r.state, data, H).total, deckBefore, '성장 카드는 덱 장수에 들어가지 않는다');
  assert.ok(!shopView(r.state, data, H).growth.some((x) => x.id === g.id), '다시 살 수 없다');
  assert.deepEqual(deckSummary(r.state, data, H).growth.length, 1);
  assert.equal(reduce(r.state, { type: 'BUY', faction: H, cardId: g.id }, data).ok, false);
});

test('내 나라 자료: 분류별 구성과 덱 장수', async () => {
  const { first } = await game(), d = deckSummary(first, data, H);
  assert.equal(d.deck, first.players[H].deck.length); assert.equal(d.discard, first.players[H].discard.length);
  assert.equal(d.groups.reduce((a, g) => a + g.count, 0), d.total);
  assert.ok(d.groups.every((g) => ['내정', '외교', '군사', '경제'].includes(g.label)));
});

test('마지막 라운드에는 상점이 없다 / 상대 구매는 기록에서 읽는다', async () => {
  const { shops, loop } = await game();
  assert.deepEqual(shops, [1, 2, 3, 4, 5], '6라운드 판의 상점은 1~5라운드');
  assert.equal(loop.state.phase, 'end');
  const s = structuredClone(loop.state); s.round = 2;
  s.log.push({ round: 2, phase: 'shop', actor: 'atlas', text: '구매: 계획 경제 (💰 −8)' }, { round: 2, phase: 'shop', actor: H, text: '구매: 내 카드 (💰 −1)' });
  const rb = rivalBuys(s, H, (f) => f.toUpperCase()).map((x) => x.text);
  assert.ok(rb.includes('ATLAS: 계획 경제 (자본 −8)'));
  assert.ok(rb.every((t) => !t.includes('내 카드')), '내 구매는 제외');
});

test('결과 보고서 모델: 순위표·목표·추이·설정·공유 문구', async () => {
  const { loop } = await game(), s = loop.state, r = buildReport(s, data);
  assert.equal(r.rows.length, 4);
  assert.deepEqual(r.rows.map((x) => x.f), s.result.ranking);
  for (const x of r.rows) assert.equal(x.total, x.regions + x.prestige + x.goalPoints);
  assert.equal(r.rows.filter((x) => x.win).length, s.result.winners.length);
  assert.equal(r.winner.f, s.result.winner); assert.equal(r.me.f, H); assert.equal(r.me.you, true);
  assert.equal(r.goals.length, 2); assert.ok(r.goals.every((g) => g.name && typeof g.met === 'boolean' && g.earned === (g.met ? g.points : 0)));
  assert.equal(r.goalsMet, r.goals.filter((g) => g.met).length);
  assert.deepEqual(r.settings, { country: '한국', rounds: 6, level: 'easy', levelKo: '쉬움', seed: 11 });
  // 점수 추이: 누적(비감소), 마지막 값 = 최종 지역 점수
  for (const f of ids) { const h = r.history[f]; assert.equal(h.length, 6); assert.equal(h[5], s.players[f].regionScore); h.forEach((v, i) => assert.ok(i === 0 || v >= h[i - 1])); }
  assert.deepEqual(scoreHistory(s), r.history);
  const t = shareText(r);
  assert.match(t, /한국/); assert.match(t, /6라운드/); assert.match(t, /시드 11/); assert.match(t, new RegExp(`${r.me.total}점`));
});

test('결과 보고서: 동점 처리 문구와 공동 승리', async () => {
  const { loop } = await game(), s = structuredClone(loop.state), [a, b] = s.result.ranking;
  const eq = (x, y) => { s.result.scores[y].total = s.result.scores[x].total; };
  const pr = (x, v) => { s.players[x].prestige = v; s.result.scores[x].prestige = v; };
  eq(a, b); pr(a, 5); pr(b, 3); s.result.winners = [a]; s.result.tie = false;
  assert.match(buildReport(s, data).tieNote, /위신\(5 대 3\)/);
  pr(b, 5); s.players[a].resources.capital = 4; s.players[b].resources.capital = 2;
  assert.match(buildReport(s, data).tieNote, /자본\(4 대 2\)/);
  s.players[b].resources.capital = 4; s.result.winners = [a, b]; s.result.tie = true;
  const r = buildReport(s, data); assert.match(r.tieNote, /공동 승리/); assert.equal(r.rows.filter((x) => x.win).length, 2);
  assert.equal(r.rows[0].rank, r.rows[1].rank, '공동 순위');
});

test('기록: 최근 20판, 같은 판은 한 번만, 라운드별 최고점과 승리 횟수', async () => {
  const st = mock(), rec = (i, o = {}) => ({ id: 'g' + i, date: '2026-01-01T00:00:00Z', countryName: '한국', archetype: 'redDragon', rounds: 6, level: 'normal', seed: i, score: i, rank: 2, win: false, ...o });
  assert.deepEqual(readRecords(st), []);
  assert.equal(addRecord(st, rec(1)).added, true);
  assert.equal(addRecord(st, rec(1)).added, false, '같은 id는 다시 저장하지 않는다');
  for (let i = 2; i <= 25; i++) addRecord(st, rec(i, i === 7 ? { rounds: 8, win: true, score: 99 } : {}));
  const all = readRecords(st);
  assert.equal(all.length, MAX_RECORDS); assert.equal(all[0].id, 'g25', '최신이 앞'); assert.ok(!all.some((r) => r.id === 'g1'));
  assert.deepEqual(bestByRounds(all), { 6: 25, 8: 99 }); assert.equal(winCount(all), 1);
  st.setItem(RECORDS_KEY, '{깨진 JSON'); assert.deepEqual(readRecords(st), [], '손상된 기록은 빈 목록');
  st.setItem(RECORDS_KEY, JSON.stringify([{ nope: 1 }, rec(3)])); assert.equal(readRecords(st).length, 1);
});

test('업적: 첫 승리·10라운드 완주·목표 3개·어려움 승리·네 성향 4승', () => {
  const st = mock(), at = (o) => ({ id: 'x' + Math.random(), date: '2026-02-02T00:00:00Z', rounds: 8, level: 'normal', archetype: 'atlas', win: false, ...o });
  let r = updateMeta(st, at({}), 1);
  assert.deepEqual(r.unlocked, [], '졌고 목표 1개: 아직 없음');
  r = updateMeta(st, at({ win: true }), 0);
  assert.deepEqual(r.unlocked.map((a) => a.id), ['first-win']);
  r = updateMeta(st, at({ win: true, archetype: 'redDragon', rounds: 10 }), 2);
  assert.deepEqual(r.unlocked.map((a) => a.id).sort(), ['full-10', 'goals-3']);
  r = updateMeta(st, at({ win: true, archetype: 'polarStar', level: 'hard' }), 0);
  assert.deepEqual(r.unlocked.map((a) => a.id), ['hard-win']);
  r = updateMeta(st, at({ win: true, archetype: 'emerald' }), 0);
  assert.deepEqual(r.unlocked.map((a) => a.id), ['four-types']);
  r = updateMeta(st, at({ win: true, archetype: 'emerald' }), 0);
  assert.deepEqual(r.unlocked, [], '이미 얻은 업적은 다시 나오지 않는다');
  const meta = readMeta(st);
  assert.equal(Object.keys(meta.achievements).length, ACHIEVEMENTS.length); assert.equal(meta.games, 6); assert.equal(meta.wins, 5); assert.equal(meta.goalsMet, 3);
  const bad = mock(); bad.setItem('oop-meta-v1', '깨짐'); assert.equal(readMeta(bad).games, 0, '손상된 누적은 초기값');
});

test('기록 한 줄: 결과 보고서에서 만든다', async () => {
  const { loop } = await game(), r = buildReport(loop.state, data), rec = recordOf(loop.state, r, '2026-03-03T00:00:00Z');
  assert.equal(rec.countryName, '한국'); assert.equal(rec.rounds, 6); assert.equal(rec.score, r.me.total); assert.equal(rec.win, r.humanWon);
  assert.equal(rec.id, `11-6-kor-easy`);
});
