import { josa } from '../engine/countries.js';
// 카드·이벤트 효과 데이터를 쉬운 한국어 문장으로 풀어 쓴다. DOM 없음 (node 테스트 가능).
const RES = { capital: '자본', energy: '에너지', industry: '산업', prestige: '위신' };
const CAT = { domestic: '내정', diplomatic: '외교', military: '군사' };
const sg = (n) => (n < 0 ? '−' : '+') + Math.abs(n);
const WHEN = { round: '이번 라운드', game: '이후 계속' };
const MOD = {
  handSize: (v) => `손패 한도 ${sg(v)}`, planSlots: (v) => `계획 슬롯 ${sg(v)}`, 'nextRound.planSlots': (v) => `다음 라운드 계획 슬롯 ${sg(v)}`,
  'shop.costDelta': (v) => `상점 카드 비용 ${sg(v)}`, 'shop.extraSlots': (v) => `상점 칸 ${sg(v)}`, 'shop.firstPurchaseDiscount': (v) => `첫 구매 비용 ${sg(-v)}`,
  'shop.minCost': (v) => `상점 카드 최소 비용 ${v}`, 'influenceLossReduction.all': (v) => `모든 세력이 받는 영향력 감소 ${v} 줄어듦`,
  'influenceLossReduction.self': (v) => `내가 받는 영향력 감소 ${v} 줄어듦`, negateTargetedEffect: () => '나를 노리는 효과 1개 무효',
  ignoreEventEffectInRegion: () => '지역 하나는 이벤트 효과를 받지 않음', ignoreEventEffectInRegionPerRound: () => '라운드마다 지역 하나는 이벤트 효과를 받지 않음',
  domesticCapitalBonus: (v) => `내정 카드의 자본 획득 ${sg(v)}`, militaryEffectHalfRoundUp: () => '군사 카드 효과가 절반(올림)',
  treatiesVoid: () => '이번 라운드 조약 효과 무효', baseDefenseBonus: (v) => `기지가 있는 지역 방어 ${sg(v)}`,
  firstDiplomaticInfluenceBonus: (v) => `첫 외교 카드의 영향력 ${sg(v)}`, firstTreatyFree: () => '첫 조약은 비용 없음', revealPlanCard: () => '계획 카드 1장 공개',
};
const IF = (c) => {
  if ('payOptional' in c) return `${josa(RES[c.payOptional.res], '을', '를')} ${c.payOptional.amount} 추가로 낼 수 있다면`;
  if (c.playedCategoryThisRound) return `이번 라운드에 ${CAT[c.playedCategoryThisRound] ?? c.playedCategoryThisRound} 카드를 냈다면`;
  if (c.cardsPlayedThisRoundRank) return `카드를 ${c.cardsPlayedThisRoundRank === 'highest' ? '가장 많이' : '가장 적게'} 냈다면`;
  if (c.prestigeRank) return `위신이 ${c.prestigeRank === 'highest' ? '가장 높으면' : '가장 낮으면'}`;
  if (c.resourceRank) return `${josa(RES[c.resourceRank.res], '이', '가')} ${c.resourceRank.rank === 'highest' ? '가장 많으면' : '가장 적으면'}`;
  if ('treatyMadeThisRound' in c) return c.treatyMadeThisRound ? '이번 라운드 조약을 맺었다면' : '이번 라운드 조약이 없다면';
  return '조건이 맞으면';
};
const WHERE = (e) => (e.target === 'regionChoice' ? (e.filter === 'owned' ? '내 영향력이 있는 지역 하나' : '지역 하나') : e.scope === 'allOwned' ? '내가 영향력을 둔 모든 지역' : e.scope === 'region' ? '지역 하나' : '지역 하나');

/** 효과 하나 → 문장 */
export function effectToKorean(e) {
  const n = e.amount ?? e.value ?? 1;
  switch (e.type) {
    case 'gain': return `${RES[e.res] ?? '자원'} ${sg(n)}`;
    case 'influence': return `${WHERE(e)}에 영향력 ${sg(n)}`;
    case 'removeInfluence': return `${e.from === 'leader' ? '영향력이 가장 큰 세력의' : '다른 세력의'} 영향력 ${sg(-n)} (지역 하나 선택)`;
    case 'defense': return `${WHERE(e)}에 방어 ${sg(n)}`;
    case 'base': return `지역 하나에 기지 설치 (영향력 +1, 방어 +1)`;
    case 'destroyBase': return '상대 기지 1개 파괴 (세력 선택)';
    case 'draw': return `카드 ${n}장 뽑기`;
    case 'discard': return e.who === 'self' ? `내 손패 ${n}장 버리기` : `한 세력이 손패 ${n}장 버리기`;
    case 'drain': return `한 세력의 ${RES[e.res] ?? '자원'} ${sg(-n)}, 내 ${RES[e.res] ?? '자원'} ${sg(n)}`;
    case 'treaty': return `한 세력과 조약 (이번 라운드 같은 지역 주도권 공유)`;
    case 'peek': return e.what === 'eventDeck' ? `이벤트 덱 맨 위 ${n}장 확인` : '한 세력의 손패 확인';
    case 'modifier': { const f = MOD[e.key]; const m = e.key.startsWith('income.') ? `${RES[e.key.slice(7)] ?? ''} 수입 ${sg(e.value)}` : f ? f(e.value) : `규칙 수정 ${e.key} ${e.value}`; return `${WHEN[e.scope] ?? ''} ${m}`.trim(); }
    case 'conditional': return `${IF(e.if)}: ${(e.then || []).map(effectToKorean).join(', ')}`;
    case 'custom': return e.note ? clean(e.note) : '특수 효과';
    default: return null;
  }
}
const clean = (t = '') => t.replace(/\u{1F4B0}/gu, '자본').replace(/\u{1F6E2}\uFE0F?/gu, '에너지').replace(/\u{1F3ED}/gu, '산업').replace(/\u2B50\uFE0F?/gu, '위신').replace(/[\u{1F300}-\u{1FAFF}\uFE0F]/gu, '').replace(/(자본|에너지|산업|위신) \1/g, '$1');
export const plainText = clean;

/** 카드(또는 이벤트·자산·성장 카드)의 효과 → 쉬운 한국어 문장 목록. 풀지 못하면 카드 문구로 대신한다 */
export function effectsToKorean(effects, card = null) {
  const out = (effects || []).map((e) => { try { return effectToKorean(e); } catch { return null; } });
  if (!out.length || out.some((t) => !t || /undefined|NaN|\[object/.test(t))) return card?.text ? [clean(card.text)] : [];
  return out;
}

/** 손패 카드 위에 붙일 예상 결과 칩 (최대 4개). 예: ['영향력 +2', '지역 선택 필요'] */
export function previewChips(card) {
  const sum = {}, add = (k, n) => { sum[k] = (sum[k] || 0) + n; }, need = new Set();
  const walk = (e) => {
    switch (e.type) {
      case 'gain': add(RES[e.res], e.amount); break;
      case 'influence': add('영향력', e.amount); need.add('지역'); break;
      case 'removeInfluence': add('제거', -e.amount); need.add('지역'); break;
      case 'defense': add('방어', e.amount); if (e.scope !== 'allOwned') need.add('지역'); break;
      case 'base': add('기지', 1); need.add('지역'); break;
      case 'destroyBase': add('기지 파괴', 1); need.add('세력'); break;
      case 'draw': add('드로우', e.amount); break;
      case 'discard': add('버림', e.amount); break;
      case 'drain': add(RES[e.res], e.amount); need.add('세력'); break;
      case 'treaty': add('조약', 1); need.add('세력'); break;
      case 'peek': add('확인', 1); break;
      case 'modifier': add('지속', 1); break;
      case 'conditional': (e.then || []).forEach(walk); need.add('조건'); break;
      case 'custom': add('특수', 1); break;
      default: break;
    }
  };
  (card.effects || []).forEach(walk);
  const chips = Object.entries(sum).map(([k, n]) => ({ text: ['지속', '특수', '조약', '기지', '기지 파괴', '확인'].includes(k) ? k : k === '드로우' ? `카드 +${n}` : k === '버림' ? `버림 ${n}` : `${k} ${sg(n)}`, kind: 'out' }));
  for (const w of need) chips.push({ text: w === '조건' ? '조건부' : `${w} 선택 필요`, kind: 'need' });
  return chips.slice(0, 4);
}

/** 타이밍 태그: 즉시 / 지속 / 비밀 */
export function timingTag(card) {
  const m = (card.effects || []).filter((e) => e.type === 'modifier');
  if (card.permanent || m.some((e) => e.scope === 'game')) return '지속';
  if (m.some((e) => e.scope === 'round')) return '라운드';
  if ((card.effects || []).some((e) => e.type === 'peek' || (e.type === 'custom' && e.id === 'dip-15'))) return '비밀';
  return '즉시';
}
