// 브라우저 전용: src/data/*.json을 fetch로 읽어 엔진 data 묶음으로 만들고 등록한다.
// node-data.js(node:fs)의 브라우저 대응 파일이며 같은 모양의 data를 돌려준다.
import { setData } from './data.js';

const NAMES = { cards: 'cards', events: 'events', assets: 'strategic-assets', goals: 'secret-goals', growth: 'growth-cards', factions: 'factions', regions: 'regions' };

/** 모듈 위치 기준으로 읽으므로 GitHub Pages 하위 경로에서도 동작한다 */
export async function loadData(base = new URL('../data/', import.meta.url)) {
  const entries = await Promise.all(Object.entries(NAMES).map(async ([key, file]) => {
    const res = await fetch(new URL(`${file}.json`, base));
    if (!res.ok) throw new Error(`데이터를 불러오지 못했습니다: ${file}.json (${res.status})`);
    return [key, await res.json()];
  }));
  return setData(Object.fromEntries(entries));
}
