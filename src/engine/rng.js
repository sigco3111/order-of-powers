// mulberry32 (상태 보존형). 전역 상태 없음: RNG 상태는 uint32 숫자 하나.
export function seedToState(seed) {
  if (typeof seed === 'number') return seed >>> 0;
  let h = 2166136261; // 문자열 시드: FNV-1a
  for (const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** [0,1) 실수 → { value, rng } */
export function nextFloat(rng) {
  const s = (rng + 0x6d2b79f5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, rng: s };
}

/** 0..n-1 정수 → { value, rng } */
export function nextInt(rng, n) {
  const r = nextFloat(rng);
  return { value: Math.floor(r.value * n), rng: r.rng };
}

/** Fisher-Yates. 입력은 바꾸지 않고 { array, rng } 반환 */
export function shuffle(rng, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const r = nextInt(rng, i + 1);
    rng = r.rng;
    [a[i], a[r.value]] = [a[r.value], a[i]];
  }
  return { array: a, rng };
}
