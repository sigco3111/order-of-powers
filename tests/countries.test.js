import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../src/engine/node-data.js';
import { hashState } from '../src/engine/util.js';
import { createGame, reduce, autoPlay, randomPolicy, randomCountries, ARCHETYPES, DEFAULT_COUNTRIES, seatName, localize } from '../src/engine/index.js';
import { computeIncome } from '../src/engine/income.js';
import { cardCost } from '../src/engine/market.js';
import { handSizeOf } from '../src/engine/state.js';
import { runEffects, clearRoundEffects } from '../src/engine/effects.js';

const data = loadData();
const C = Object.fromEntries(data.countries.map((c) => [c.id, c]));
const regionIds = data.regions.map((r) => r.id);
const mk = (countries, o = {}) => createGame({ data, seed: 3, countries, ...o });
const play = (s, pol) => { s.config.debug = true; return autoPlay(s, randomPolicy(pol)); };
const BAN = /아틀라스|적룡|북극성|에메랄드/;

test('국가 데이터: 20개, 원형마다 5개, 본거지·특성 유효', () => {
  assert.equal(data.countries.length, 20);
  for (const a of ARCHETYPES) assert.equal(data.countries.filter((c) => c.archetype === a).length, 5, a);
  for (const c of data.countries) {
    assert.ok(regionIds.includes(c.homeRegion), c.id);
    assert.match(c.iso, /^[A-Z]{2,3}$/);
    assert.ok(c.trait.effect.type && c.trait.text, c.id);
    if (c.trait.effect.region && c.trait.effect.region !== 'home') assert.ok(data.regions.find((r) => r.id === c.homeRegion).neighbors.includes(c.trait.effect.region), c.id + ' 이웃');
    assert.doesNotMatch(JSON.stringify(c), BAN);
  }
  assert.doesNotMatch(JSON.stringify([data.factions, data.cards, data.events, data.assets, data.goals, data.growth]), BAN, '세력 가상 이름이 데이터에 남음');
  assert.equal(new Set(data.countries.map((c) => c.trait.id)).size, 10, '특성 템플릿 10종');
});

test('본거지·국가 적용, 기본 국가, 잘못된 배정 거부', () => {
  const s = mk({ atlas: 'can', redDragon: 'kor', polarStar: 'sau', emerald: 'zaf' });
  assert.deepEqual(s.config.countries, { atlas: 'can', redDragon: 'kor', polarStar: 'sau', emerald: 'zaf' });
  assert.equal(s.players.redDragon.home, 'eastAsia');
  assert.equal(s.players.polarStar.home, 'middleEastNorthAfrica');
  assert.equal(s.players.emerald.home, 'subSaharanAfrica');
  assert.equal(s.players.atlas.countryName, '캐나다');
  assert.equal(seatName(s, 'redDragon', data), '한국');
  assert.deepEqual(mk().config.countries, DEFAULT_COUNTRIES);
  assert.throws(() => mk({ atlas: 'usa' }), /좌석에만/);
  assert.throws(() => mk({ atlas: 'xxx' }), /알 수 없는 국가/);
});

test('특성 효과: 시작 위신·자산 3택·1라운드 손패·수입·구매 할인', () => {
  const s = mk({ atlas: 'fra', redDragon: 'kor', polarStar: 'usa', emerald: 'bra' });
  assert.equal(s.players.atlas.prestige, 1);
  assert.equal(s.players.redDragon.resources.capital, 5);
  assert.equal(s.players.emerald.assetOptions.length, 3);
  assert.equal(s.players.atlas.assetOptions.length, 2);
  assert.equal(new Set(Object.values(s.players).flatMap((p) => p.assetOptions)).size, 9, '자산 선택지는 겹치지 않는다');
  assert.equal(handSizeOf(s, 'polarStar'), 6);
  assert.equal(handSizeOf(s, 'atlas'), 5);
  const d = mk({ atlas: 'deu', redDragon: 'chn', polarStar: 'aus', emerald: 'ind' }, { rounds: 8 });
  d.round = 2; assert.equal(computeIncome(d, 'atlas').capital, 3, '독일: 짝수 라운드 +1');
  d.round = 3; assert.equal(computeIncome(d, 'atlas').capital, 2);
  d.round = 6; assert.equal(computeIncome(d, 'emerald').capital, 3, '인도: 마지막 3라운드 +1');
  d.round = 5; assert.equal(computeIncome(d, 'emerald').capital, 2);
  const j = mk({ atlas: 'eu', redDragon: 'jpn', polarStar: 'rus', emerald: 'ind' });
  const id = j.market.slots[0], base = data.cards.find((c) => c.id === id).cost;
  assert.equal(cardCost(j, data, 'redDragon', id), Math.max(1, base - 1));
  assert.equal(cardCost(j, data, 'polarStar', id), base);
  j.players.redDragon.roundBuys = 1; assert.equal(cardCost(j, data, 'redDragon', id), base);
});

test('특성 효과: 본거지 / 이웃 지역 첫 영향력 +1은 라운드마다 한 번', () => {
  const s = mk({ atlas: 'can', redDragon: 'chn', polarStar: 'rus', emerald: 'ind' });
  const put = (st, f, rid) => runEffects(st, f, [{ type: 'influence', amount: 1 }], { data, region: rid }).state;
  let t = put(s, 'redDragon', 'eastAsia');
  assert.equal(t.regions.eastAsia.influence.redDragon, 2, '본거지 첫 배치 +1');
  t = put(t, 'redDragon', 'eastAsia');
  assert.equal(t.regions.eastAsia.influence.redDragon, 3, '두 번째는 보너스 없음');
  assert.equal(put(s, 'redDragon', 'europe').regions.europe.influence.redDragon, 1, '다른 지역은 보너스 없음');
  assert.equal(put(s, 'atlas', 'europe').regions.europe.influence.atlas, 2, '캐나다: 이웃 지역(유럽) 첫 배치 +1');
  assert.equal(put(s, 'atlas', 'northAmerica').regions.northAmerica.influence.atlas, 1);
  t = clearRoundEffects(put(s, 'redDragon', 'eastAsia'));
  assert.equal(put(t, 'redDragon', 'eastAsia').regions.eastAsia.influence.redDragon, 4, '다음 라운드에 다시 +1');
});

test('로그·AI 문구에 국가 이름이 쓰이고 가상 세력 이름은 없다', () => {
  const s = mk({ atlas: 'gbr', redDragon: 'kor', polarStar: 'tur', emerald: 'arg' });
  assert.equal(localize(s, 'redDragon와 조약 체결, st-atlas-1 버림, polarStar 영향력'), '한국과 조약 체결, st-atlas-1 버림, 튀르키예 영향력');
  const end = play(s, 8).state;
  const text = end.log.map((l) => l.text).join('\n');
  assert.doesNotMatch(text, BAN);
  assert.doesNotMatch(text, /(^|[^-\w])(atlas|redDragon|polarStar|emerald)([^-\w]|$)/);
  assert.match(text, /한국|영국|튀르키예|아르헨티나/);
});

test('무작위 배정은 시드로 결정되고 원형마다 맞는 국가', () => {
  const a = randomCountries(data, 5), b = randomCountries(data, 5);
  assert.deepEqual(a, b);
  for (const f of ARCHETYPES) assert.equal(C[a[f]].archetype, f);
  assert.equal(randomCountries(data, 5, { redDragon: 'kor' }).redDragon, 'kor');
});

test('국가 20개 모두: 특성이 8라운드 무작위 판에서 예외 없이 끝난다 (불변식 검사)', () => {
  for (const c of data.countries) {
    const countries = { ...randomCountries(data, c.id), [c.archetype]: c.id };
    const r = play(mk(countries, { rounds: 8, seed: 100 + data.countries.indexOf(c) }), 7);
    assert.equal(r.state.phase, 'end', c.id);
  }
});

test('결정론: 같은 국가 배정·시드·정책이면 같은 최종 해시', () => {
  const cs = randomCountries(data, 9);
  const run = (seed) => hashState(play(mk(cs, { seed, rounds: 6 }), 3).state);
  assert.equal(run(4), run(4));
  assert.notEqual(run(4), run(5));
});

test('퍼즈: 무작위 국가 배정 40개 × 6/8/10라운드, 불변식 검사', () => {
  for (let i = 0; i < 40; i++) {
    const rounds = [6, 8, 10][i % 3];
    const r = play(mk(randomCountries(data, 1000 + i), { seed: 500 + i, rounds }), i);
    assert.equal(r.state.phase, 'end');
  }
});
