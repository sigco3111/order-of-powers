// Node 전용: src/data/*.json을 읽어 엔진 data 묶음으로 만든다 (테스트·시뮬레이션용).
import { readFileSync } from 'node:fs';

const load = (n) => JSON.parse(readFileSync(new URL(`../data/${n}.json`, import.meta.url), 'utf8'));
export const loadData = () => ({
  cards: load('cards'), events: load('events'), assets: load('strategic-assets'), goals: load('secret-goals'),
  growth: load('growth-cards'), factions: load('factions'), regions: load('regions'), countries: load('countries'), roundModes: load('round-modes'), difficulty: load('difficulty'),
});
