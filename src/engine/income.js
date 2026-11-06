// 정비 단계 수입. 💰 +2, 주도 지역마다 산출 자원 +1, 그리고 income.<res> 수정치. 자원 수입은 0 미만이 되지 않는다.
import { RESOURCES, getMod } from './state.js';
import { regionLeaders } from './score.js';
import { gainRes } from './effects.js';

export const BASE_INCOME = Object.freeze({ capital: 2, energy: 0, industry: 0 });

/** { capital, energy, industry, prestige } 이번 정비 단계 수입 (읽기 전용 계산) */
export function computeIncome(state, faction) {
  const out = { ...BASE_INCOME, prestige: 0 };
  for (const [rid, fs] of Object.entries(regionLeaders(state))) {
    const res = state.regions[rid].produces;
    if (res && fs.includes(faction)) out[res] += 1;
  }
  for (const k of [...RESOURCES, 'prestige']) {
    out[k] += getMod(state, faction, 'income.' + k);
    if (k !== 'prestige') out[k] = Math.max(0, out[k]);
  }
  return out;
}

/** 모든 세력에게 수입 지급 (state 복제본을 직접 수정). [{faction, income}] 반환 */
export function payIncome(s) {
  return s.turnOrder.map((f) => {
    const inc = computeIncome(s, f);
    for (const k of [...RESOURCES, 'prestige']) if (inc[k]) gainRes(s, f, k, inc[k]);
    return { faction: f, income: inc };
  });
}
