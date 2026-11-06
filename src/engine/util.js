/** 순수 JSON 데이터 깊은 복제 (JSON 왕복보다 4배 빠름; AI 시뮬레이션이 많이 부른다) */
export function deepClone(x) {
  if (x === null || typeof x !== 'object') return x;
  if (Array.isArray(x)) {
    const a = new Array(x.length);
    for (let i = 0; i < x.length; i++) { const v = x[i]; a[i] = v !== null && typeof v === 'object' ? deepClone(v) : v; }
    return a;
  }
  const o = {};
  for (const k in x) { const v = x[k]; o[k] = v !== null && typeof v === 'object' ? deepClone(v) : v; }
  return o;
}

/** 키 정렬 직렬화 (키 순서와 무관한 해시용) */
export function stableStringify(x) {
  if (x === null || typeof x !== 'object') return JSON.stringify(x) ?? 'null';
  if (Array.isArray(x)) return '[' + x.map(stableStringify).join(',') + ']';
  return '{' + Object.keys(x).sort().filter((k) => x[k] !== undefined)
    .map((k) => JSON.stringify(k) + ':' + stableStringify(x[k])).join(',') + '}';
}

/** 상태 해시 (cyrb53, 16진수) */
export function hashState(state) {
  const s = stableStringify(state);
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

/** 배열 → { id: 개수 } */
export function countBy(arr) {
  const m = {};
  for (const x of arr) m[x] = (m[x] || 0) + 1;
  return m;
}

const cache = new WeakMap();
/** data(JSON 묶음) → id 색인 (캐시) */
export function indexData(data) {
  if (!cache.has(data)) {
    const by = (a) => Object.fromEntries((a || []).map((x) => [x.id, x]));
    cache.set(data, {
      cards: by(data.cards), events: by(data.events), assets: by(data.assets),
      goals: by(data.goals), growth: by(data.growth), factions: by(data.factions), regions: by(data.regions),
    });
  }
  return cache.get(data);
}
