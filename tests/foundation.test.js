import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { nextInt, shuffle } from '../src/engine/rng.js';
import { hashState, deepClone } from '../src/engine/util.js';
import { createGame, drawCards, drawToHandSize, validateInvariants, resolveOrder, planSlotsOf, handSizeOf, pickAsset } from '../src/engine/state.js';
import { regionLeaders, scoreRound, finalScores, METRICS } from '../src/engine/score.js';
import { refill, buy, cardCost } from '../src/engine/market.js';

const load = (n) => JSON.parse(readFileSync(new URL(`../src/data/${n}.json`, import.meta.url), 'utf8'));
const data = {
  cards: load('cards'), events: load('events'), assets: load('strategic-assets'), goals: load('secret-goals'),
  growth: load('growth-cards'), factions: load('factions'), regions: load('regions'),
};
const F = ['atlas', 'redDragon', 'polarStar', 'emerald'];
const mk = (o = {}) => createGame({ data, seed: 7, humanFaction: 'atlas', ...o });
const set = (s, r, f, n) => { s.regions[r].influence[f] = n; return s; };

test('rng: 상태 보존, 입력 불변', () => {
  const a = nextInt(5, 100), b = nextInt(5, 100);
  assert.deepEqual(a, b);
  const arr = [1, 2, 3, 4, 5, 6];
  const r = shuffle(9, arr);
  assert.deepEqual(arr, [1, 2, 3, 4, 5, 6]);
  assert.deepEqual([...r.array].sort(), arr);
  assert.deepEqual(shuffle(9, arr), r);
});

test('결정성: 같은 시드 → 같은 해시, 다른 시드 → 다른 해시', () => {
  assert.equal(hashState(mk()), hashState(mk()));
  assert.notEqual(hashState(mk()), hashState(mk({ seed: 8 })));
  assert.equal(hashState(mk({ seed: 'abc' })), hashState(mk({ seed: 'abc' })));
  const a = drawToHandSize(mk(), 'atlas'), b = drawToHandSize(mk(), 'atlas');
  assert.equal(hashState(a), hashState(b));
});

for (const rounds of [6, 8, 10]) {
  test(`createGame 불변식: ${rounds}라운드`, () => {
    const s = mk({ rounds });
    assert.ok(validateInvariants(s));
    assert.equal(s.eventDeck.length, rounds);
    assert.equal(new Set(s.eventDeck).size, rounds);
    s.eventDeck.forEach((id, i) => assert.equal(id === 'evt-20', i === rounds - 2));
    assert.equal(s.market.slots.length, 6);
    assert.equal(s.market.slots.length + s.market.deck.length, 45);
    assert.ok([...s.market.slots, ...s.market.deck].every((c) => !c.startsWith('fac-') && !c.startsWith('neu-')));
    const assets = [], goals = [];
    for (const f of F) {
      const p = s.players[f];
      assert.equal(p.deck.length, 12);
      assert.deepEqual(p.hand, []);
      assert.deepEqual(p.resources, { capital: 4, energy: 2, industry: 2 });
      assert.equal(p.prestige, 0);
      assert.equal(p.firstPurchase.length, 2);
      assert.ok(p.firstPurchase.every((c) => c.startsWith(`fac-${f}-`)));
      assets.push(...p.assetOptions); goals.push(...p.secretGoals);
      assert.equal(p.assetOptions.length, 2); assert.equal(p.secretGoals.length, 2);
    }
    assert.equal(new Set(assets).size, 8); assert.equal(new Set(goals).size, 8);
    for (const r of Object.values(s.regions)) assert.deepEqual(Object.values(r.influence), [0, 0, 0, 0]);
    assert.equal(s.round, 1);
  });
}

test('튜토리얼 덱 10장, 잘못된 입력 거부', () => {
  const s = mk({ tutorial: true, rounds: 2 });
  for (const f of F) assert.equal(s.players[f].deck.length, 10);
  validateInvariants(s);
  assert.throws(() => mk({ rounds: 7 }));
  assert.throws(() => mk({ factions: F.slice(0, 3) }));
});

test('드로우: 손패 5장, 덱 소진 시 버린 더미 재섞기', () => {
  let s = drawToHandSize(mk(), 'atlas');
  assert.equal(s.players.atlas.hand.length, 5);
  assert.equal(s.players.atlas.deck.length, 7);
  assert.equal(s.players.redDragon.hand.length, 0);
  s = drawCards(s, 'atlas', 7);
  assert.equal(s.players.atlas.deck.length, 0);
  s.players.atlas.discard = s.players.atlas.hand.splice(0, 6);
  const before = s.rng;
  s = drawCards(s, 'atlas', 3);
  assert.notEqual(s.rng, before);
  assert.equal(s.players.atlas.hand.length, 9);
  assert.equal(s.players.atlas.deck.length, 3);
  assert.equal(s.players.atlas.discard.length, 0);
  validateInvariants(s);
  s = drawCards(s, 'atlas', 50);
  assert.equal(s.players.atlas.hand.length, 12);
  validateInvariants(s);
});

test('불변식 위반 감지', () => {
  const bad = (fn) => { const s = deepClone(mk()); fn(s); assert.throws(() => validateInvariants(s), /불변식/); };
  bad((s) => { s.players.atlas.hand.push(s.players.atlas.deck.pop()); s.players.atlas.hand.push('st-common-1'); });
  bad((s) => { s.players.atlas.deck.pop(); });
  bad((s) => { s.regions.europe.influence.atlas = 7; });
  bad((s) => { s.players.atlas.resources.capital = NaN; });
  bad((s) => { s.players.atlas.resources.energy = -1; });
  bad((s) => { s.market.deck.push(s.market.slots[0]); });
});

test('주도 세력: 단독, 동률(무효), 조약 동률(공동), 0은 없음', () => {
  const s = mk();
  assert.deepEqual(regionLeaders(s).europe, []);
  set(s, 'europe', 'atlas', 3); set(s, 'europe', 'emerald', 2);
  assert.deepEqual(regionLeaders(s).europe, ['atlas']);
  set(s, 'europe', 'emerald', 3);
  assert.deepEqual(regionLeaders(s).europe, []);
  s.treaties.push(['emerald', 'atlas']);
  assert.deepEqual(regionLeaders(s).europe.sort(), ['atlas', 'emerald']);
  set(s, 'europe', 'polarStar', 3); // 3자 동률, polarStar는 조약 없음
  assert.deepEqual(regionLeaders(s).europe, []);
  s.treaties.push(['atlas', 'polarStar'], ['polarStar', 'emerald']);
  assert.equal(regionLeaders(s).europe.length, 3);
});

test('라운드 점수 누적 (scoreValue + scoreBonus), 공동 주도는 각자 전액', () => {
  let s = mk();
  set(s, 'europe', 'atlas', 2); set(s, 'middleEastNorthAfrica', 'redDragon', 1);
  set(s, 'eastAsia', 'atlas', 1); set(s, 'eastAsia', 'emerald', 1); s.treaties.push(['atlas', 'emerald']);
  set(s, 'southAmerica', 'atlas', 1); set(s, 'southAmerica', 'polarStar', 1);
  s.regions.europe.scoreBonus = 1;
  s = scoreRound(s);
  assert.equal(s.players.atlas.regionScore, 3 + 3);     // 유럽 2+1, 동아시아 3 (M1f: 지역 점수 가치 절반)
  assert.equal(s.players.redDragon.regionScore, 3);
  assert.equal(s.players.emerald.regionScore, 3);
  assert.equal(s.players.polarStar.regionScore, 0);
  s = scoreRound(s);
  assert.equal(s.players.atlas.regionScore, 12);
});

test('최종 점수: 목표 점수, 동점 처리, 모든 지표가 알려진 것', () => {
  assert.deepEqual(finalScores(mk(), data).unknownMetrics, []);
  let s = mk();
  const g = (f, ...ids) => { s.players[f].secretGoals = ids; };
  g('atlas', 'goal-02', 'goal-19'); g('redDragon', 'goal-02', 'goal-04'); g('polarStar', 'goal-20', 'goal-17'); g('emerald', 'goal-18', 'goal-08');
  s.players.atlas.prestige = 12; s.players.atlas.regionScore = 10;      // 12+10+4(목표2)+3(목표19: 제재 0) = 29
  s.players.redDragon.prestige = 12; s.players.redDragon.regionScore = 10; s.players.redDragon.resources.capital = 20; // 12+10+4+4 = 30
  s.players.polarStar.usedAsset = true;                                  // 목표17: +3
  for (const r of Object.keys(s.regions)) set(s, r, 'emerald', 1);       // 전 지역 주도, emerald 목표20 아님
  s.players.emerald.stats.cardsPlayed = { domestic: 6, diplomatic: 6, military: 6 };
  const r = finalScores(s, data);
  assert.equal(r.scores.atlas.total, 29);
  assert.equal(r.scores.redDragon.total, 30);
  assert.equal(r.scores.polarStar.total, 3);
  assert.equal(r.scores.emerald.goalPoints, 5 + 6);
  assert.equal(r.ranking[0], 'redDragon');
  // 동점: 위신 → 자본
  s = mk(); s.players.atlas.regionScore = 5; s.players.emerald.regionScore = 5;
  s.players.atlas.secretGoals = []; s.players.emerald.secretGoals = [];
  s.players.atlas.resources.capital = 9;
  assert.deepEqual(finalScores(s, data).ranking.slice(0, 2), ['atlas', 'emerald']);
  s.players.emerald.prestige = 1; s.players.emerald.regionScore = 4;
  assert.deepEqual(finalScores(s, data).ranking.slice(0, 2), ['emerald', 'atlas']);
  // 모르는 지표
  for (const f of F) s.players[f].secretGoals = []; s.players.atlas.secretGoals = ['x']; const d2 = { ...data, goals: [{ id: 'x', points: 9, check: { metric: 'nope', op: '>=', value: 0 } }] };
  assert.deepEqual(finalScores(s, d2).unknownMetrics, ['nope']);
  assert.ok(Object.keys(METRICS).length >= 12);
});

test('결정 규칙: 해결 순서 회전, 시작 슬롯/손패', () => {
  const s = mk();
  assert.deepEqual(resolveOrder(s), F);
  assert.deepEqual(resolveOrder({ ...s, round: 2 }), ['redDragon', 'polarStar', 'emerald', 'atlas']);
  assert.deepEqual(resolveOrder({ ...s, round: 5 }), F);
  assert.equal(planSlotsOf(s, 'atlas'), 3); assert.equal(handSizeOf(s, 'atlas'), 5);
});

test('시장: 구매, 제거, 보충, 버린 더미로', () => {
  const s0 = mk(); s0.players.atlas.resources.capital = 100;
  const id = s0.market.slots[2], top = s0.market.deck[0];
  const cost = cardCost(s0, data, 'atlas', id);
  const r = buy(s0, data, 'atlas', id);
  assert.ok(r.ok);
  assert.equal(r.cost, cost);
  const s = r.state;
  assert.equal(s.players.atlas.resources.capital, 100 - cost);
  assert.ok(s.players.atlas.discard.includes(id));
  assert.equal(s.market.slots.length, 6);
  assert.ok(s.market.slots.includes(top) && !s.market.slots.includes(id));
  assert.equal(s0.market.slots[2], id); // 원본 불변
  validateInvariants(s);
  // 수동 제거 후 refill
  const t = deepClone(s0); t.market.slots.length = 3;
  assert.equal(refill(t).market.slots.length, 6);
  // 실패 사유
  const poor = mk(); poor.players.atlas.resources.capital = 0;
  assert.equal(buy(poor, data, 'atlas', poor.market.slots[0]).reason, 'insufficient-capital');
  assert.equal(buy(s0, data, 'atlas', s0.market.deck[5]).reason, 'not-available');
  assert.equal(buy(s0, data, 'atlas', 'fac-redDragon-1').reason, 'not-available');
});

test('시장: 첫 구매(세력 전용) 슬롯과 비용 수정치(최소 1)', () => {
  const s0 = mk(); s0.players.atlas.resources.capital = 20;
  const fid = s0.players.atlas.firstPurchase[0];
  const r = buy(s0, data, 'atlas', fid);
  assert.ok(r.ok);
  assert.equal(r.state.players.atlas.firstPurchase.length, 1);
  assert.equal(r.state.market.slots.length, 6);
  assert.deepEqual(r.state.market.slots, s0.market.slots); // 공용 시장은 변하지 않음
  validateInvariants(r.state);
  const id = s0.market.slots[0], base = data.cards.find((c) => c.id === id).cost;
  s0.modifiers.round['shop.costDelta'] = 1;
  assert.equal(cardCost(s0, data, 'atlas', id), base + 1);
  s0.modifiers.round['shop.costDelta'] = -10;
  assert.equal(cardCost(s0, data, 'atlas', id), 1);
  s0.modifiers.round['shop.costDelta'] = 0; s0.modifiers.round['shop.firstPurchaseDiscount'] = 1; s0.modifiers.round['shop.extraSlots'] = 1;
  assert.equal(cardCost(s0, data, 'atlas', id), Math.max(1, base - 1));
  assert.equal(refill(s0).market.slots.length, 7);
});

test('성장 카드 구매: 덱에 들어가지 않고 수정치 적용, 중복 구매 불가', () => {
  const s0 = mk(); s0.players.atlas.resources.capital = 30;
  const r = buy(s0, data, 'atlas', 'gr-10'); // planSlots +1
  assert.ok(r.ok);
  const p = r.state.players.atlas;
  assert.deepEqual(p.growth, ['gr-10']);
  assert.equal(p.deck.length + p.discard.length, 12);
  assert.equal(p.collection['gr-10'], undefined);
  assert.equal(planSlotsOf(r.state, 'atlas'), 4);
  assert.equal(planSlotsOf(r.state, 'emerald'), 3);
  assert.equal(r.state.market.slots.length, 6);
  assert.equal(r.state.market.deck.length, s0.market.deck.length);
  assert.equal(buy(r.state, data, 'atlas', 'gr-10').reason, 'growth-owned');
  const h = buy(r.state, data, 'atlas', 'gr-01'); // handSize +1
  assert.equal(handSizeOf(h.state, 'atlas'), 6);
  assert.equal(drawToHandSize(h.state, 'atlas').players.atlas.hand.length, 6);
  const d = buy(h.state, data, 'atlas', 'gr-08'); // shop.costDelta -1
  assert.equal(cardCost(d.state, data, 'atlas', d.state.market.slots[0]), Math.max(1, data.cards.find((c) => c.id === d.state.market.slots[0]).cost - 1));
  validateInvariants(d.state);
  const a = pickAsset(s0, 'atlas', s0.players.atlas.assetOptions[1]);
  assert.ok(a.ok); assert.equal(pickAsset(a.state, 'atlas', s0.players.atlas.assetOptions[0]).ok, false);
});
