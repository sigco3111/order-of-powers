#!/usr/bin/env node
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
// 데이터 검증 스크립트 (의존성 없음). 사용법: node tools/validate-data.js
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'src', 'data');
const errors = [];
const err = (m) => errors.push(m);

function load(name) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
  } catch (e) {
    err(`${name}: 읽기/파싱 실패 (${e.message})`);
    return [];
  }
}

const cards = load('cards.json');
const events = load('events.json');
const assets = load('strategic-assets.json');
const goals = load('secret-goals.json');
const growth = load('growth-cards.json');
const factions = load('factions.json');
const regions = load('regions.json');
const countries = load('countries.json');

// 개수
const expected = [
  ['cards', cards, 70], ['events', events, 20], ['strategic-assets', assets, 12],
  ['secret-goals', goals, 20], ['growth-cards', growth, 10], ['factions', factions, 4], ['regions', regions, 8], ['countries', countries, 20],
];
for (const [n, a, c] of expected) if (a.length !== c) err(`${n}: ${c}개여야 하는데 ${a.length}개`);

const byDeck = (d) => cards.filter((c) => c.deck === d).length;
const byCat = (cat) => cards.filter((c) => c.deck === 'market' && c.category === cat).length;
for (const [d, n] of [['starter', 15], ['market', 45], ['faction', 8], ['neutral', 2]]) {
  if (byDeck(d) !== n) err(`cards deck=${d}: ${n}개여야 하는데 ${byDeck(d)}개`);
}
for (const cat of ['domestic', 'diplomatic', 'military']) {
  if (byCat(cat) !== 15) err(`cards market ${cat}: 15개여야 하는데 ${byCat(cat)}개`);
}

// ID 중복
for (const [n, a] of [['cards', cards], ['events', events], ['strategic-assets', assets], ['secret-goals', goals],
  ['growth-cards', growth], ['factions', factions], ['regions', regions], ['countries', countries]]) {
  const seen = new Set();
  for (const x of a) {
    if (!x.id) err(`${n}: id 없는 항목`);
    else if (seen.has(x.id)) err(`${n}: ID 중복 ${x.id}`);
    seen.add(x.id);
  }
}

const cardIds = new Set(cards.map((c) => c.id));
const factionIds = new Set(factions.map((f) => f.id));
const regionIds = new Set(regions.map((r) => r.id));

// 필수 필드
const need = (n, o, fields) => { for (const f of fields) if (o[f] === undefined || o[f] === null) err(`${n} ${o.id}: 필드 ${f} 없음`); };
for (const c of cards) {
  need('cards', c, ['id', 'name', 'category', 'cost', 'deck', 'text', 'effects']);
  if (!['domestic', 'diplomatic', 'military'].includes(c.category)) err(`cards ${c.id}: 알 수 없는 category ${c.category}`);
  if (!['starter', 'market', 'faction', 'neutral'].includes(c.deck)) err(`cards ${c.id}: 알 수 없는 deck ${c.deck}`);
  if (c.faction && !factionIds.has(c.faction)) err(`cards ${c.id}: 없는 세력 ${c.faction}`);
}
for (const e of events) need('events', e, ['id', 'name', 'text', 'effects']);
for (const a of assets) need('strategic-assets', a, ['id', 'name', 'category', 'text', 'effects']);
for (const g of goals) need('secret-goals', g, ['id', 'name', 'condition', 'points', 'check']);
for (const g of growth) need('growth-cards', g, ['id', 'name', 'cost', 'text', 'effects']);
for (const r of regions) need('regions', r, ['id', 'name', 'influenceSlots', 'scoreValue', 'produces', 'neighbors']);

// 효과 스키마
const types = new Set(['gain', 'influence', 'removeInfluence', 'defense', 'base', 'destroyBase', 'draw', 'discard',
  'treaty', 'peek', 'drain', 'modifier', 'conditional', 'custom']);
const resTypes = new Set(['capital', 'energy', 'industry', 'prestige']);
let customCount = 0;
function checkEffects(where, list) {
  if (!Array.isArray(list)) return err(`${where}: effects가 배열이 아님`);
  for (const e of list) {
    if (!e || !types.has(e.type)) { err(`${where}: 알 수 없는 효과 type ${e && e.type}`); continue; }
    if (e.type === 'custom') { customCount++; if (!e.id || !e.note) err(`${where}: custom에 id/note 없음`); }
    if ((e.type === 'gain' || e.type === 'drain') && !resTypes.has(e.res)) err(`${where}: 알 수 없는 res ${e.res}`);
    if (e.type === 'conditional') { if (!e.if) err(`${where}: conditional에 if 없음`); checkEffects(where, e.then); }
  }
}
for (const [n, a] of [['cards', cards], ['events', events], ['strategic-assets', assets], ['growth-cards', growth]]) {
  for (const x of a) checkEffects(`${n} ${x.id}`, x.effects);
}

// 세력 ID 참조
for (const f of factions) {
  need('factions', f, ['id', 'name', 'concept', 'strengths', 'startingDeck', 'uniqueCardIds']);
  let total = 0;
  for (const s of f.startingDeck || []) {
    if (!cardIds.has(s.cardId)) err(`factions ${f.id}: startingDeck에 없는 카드 ${s.cardId}`);
    total += s.count;
  }
  if (total !== 12) err(`factions ${f.id}: 시작 덱 ${total}장 (12장이어야 함)`);
  for (const id of f.uniqueCardIds || []) if (!cardIds.has(id)) err(`factions ${f.id}: uniqueCardIds에 없는 카드 ${id}`);
}
const factionStarters = cards.filter((c) => c.deck === 'starter' && c.faction).length;
if (factionStarters !== 10) err(`세력 시작 전용 카드 10장이어야 하는데 ${factionStarters}장`);

// 지역
for (const r of regions) {
  if (r.influenceSlots !== 6) err(`regions ${r.id}: influenceSlots는 6이어야 함`);
  for (const n of r.neighbors || []) {
    if (!regionIds.has(n)) err(`regions ${r.id}: 없는 이웃 ${n}`);
    else if (!regions.find((x) => x.id === n).neighbors.includes(r.id)) err(`regions ${r.id}: 이웃 ${n}가 서로 연결되지 않음`);
  }
}

// 국가: 원형당 5개, 본거지·이웃 지역 유효, 특성 효과 종류, 가상 세력 이름 금지
const TRAIT_TYPES = ['firstBuyDiscount', 'startPrestige', 'evenRoundIncome', 'regionFirstInfluence', 'assetChoices', 'startResource', 'modifier', 'openingHand', 'lateIncome'];
for (const c of countries) {
  need('countries', c, ['id', 'nameKo', 'nameEn', 'iso', 'archetype', 'homeRegion', 'trait', 'profile', 'accent']);
  if (!factionIds.has(c.archetype)) err(`countries ${c.id}: 알 수 없는 원형 ${c.archetype}`);
  const home = regions.find((r) => r.id === c.homeRegion);
  if (!home) err(`countries ${c.id}: 없는 본거지 ${c.homeRegion}`);
  if (!/^[A-Z]{2,3}$/.test(c.iso || '')) err(`countries ${c.id}: iso는 대문자 2~3자`);
  if (!/^#[0-9A-Fa-f]{6}$/.test(c.accent || '')) err(`countries ${c.id}: accent는 #RRGGBB`);
  const t = c.trait || {};
  for (const k of ['id', 'nameKo', 'text', 'effect']) if (!t[k]) err(`countries ${c.id}: trait.${k} 없음`);
  if (t.effect && !TRAIT_TYPES.includes(t.effect.type)) err(`countries ${c.id}: 알 수 없는 특성 효과 ${t.effect.type}`);
  const rg = t.effect?.region;
  if (rg && rg !== 'home' && !(home?.neighbors || []).includes(rg)) err(`countries ${c.id}: 특성 지역 ${rg}가 본거지의 이웃이 아님`);
  if (/아틀라스|적룡|북극성|에메랄드/.test(JSON.stringify(c))) err(`countries ${c.id}: 가상 세력 이름 사용`);
}
for (const a of factionIds) if (countries.filter((c) => c.archetype === a).length !== 5) err(`countries: ${a} 원형은 국가 5개여야 함`);
if (new Set(countries.map((c) => c.iso)).size !== countries.length) err('countries: iso 중복');
for (const [n, x] of [['factions', factions], ['cards', cards], ['events', events]]) if (/아틀라스|적룡|북극성|에메랄드/.test(JSON.stringify(x))) err(`${n}: 가상 세력 이름이 남아 있음`);

if (errors.length) {
  console.error(errors.map((e) => 'ERROR: ' + e).join('\n'));
  console.error(`\n오류 ${errors.length}건`);
  process.exit(1);
}
console.log(`OK: cards ${cards.length}, events ${events.length}, assets ${assets.length}, goals ${goals.length}, ` +
  `growth ${growth.length}, factions ${factions.length}, regions ${regions.length}, countries ${countries.length} (custom 효과 ${customCount}개)`);
