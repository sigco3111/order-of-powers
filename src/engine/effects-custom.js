// 커스텀 효과 15종. 카드 id로 등록. 시그니처: (X, item) — X.ask로 선택을 요청하거나 X.q.unshift로 일반 효과를 끼워 넣는다.
import { regionLeaders } from './score.js';
import { addInfluence, loseInfluence, gainRes, log, pick, opponents, partners, negated, recordPeek, roundMods, topFactions } from './effects.js';

const rids = (s) => Object.keys(s.regions);
const inject = (X, f, ...effects) => X.q.unshift(...effects.map((e) => ({ f, e })));

/** 서로 다른 지역 둘에 영향력 +1 (선택: regionPair) */
function twoRegions(X, it) {
  if (it.stage !== 'pair') return X.ask(it, 'regionPair', rids(X.s), 'pair');
  for (const rid of it.choice) log(X.s, it.f, `${rid} 영향력 +${addInfluence(X.s, it.f, rid, 1)}`);
}
/** 조약 세력(이번 라운드) 전원에게 적용 */
function eachPartner(X, f, fn) {
  const ps = partners(X.s, f);
  if (!ps.length) log(X.s, f, '조약 세력 없음');
  ps.forEach(fn);
}
const eventRegion = (X) => pick(X.s, rids(X.s));

export const CUSTOM = {
  'dip-10': (X, { f }) => eachPartner(X, f, (t) => { gainRes(X.s, t, 'prestige', 2); log(X.s, t, '⭐ 위신 +2 (동맹 선언)'); }),
  'dip-14': twoRegions,
  'dip-15': (X, it) => {
    if (it.stage !== 'target') return X.ask(it, 'faction', opponents(X.s, it.f), 'target');
    if (negated(X, it.f, it.choice)) return;
    roundMods(X.s, it.choice)['nextRound.revealPlanCard'] = 1;
    log(X.s, it.f, `${it.choice}: 다음 라운드 계획 카드 1장 공개`);
  },
  // 기지가 있는 곳(대상 세력의 기지)은 −3 대신 −1. 일반 removeInfluence의 baseAmount로 처리
  'mil-12': (X, { f }) => inject(X, f, { type: 'removeInfluence', amount: 3, baseAmount: 1, from: 'other', target: 'regionChoice' }),
  'fac-atlas-2': (X, { f }) => inject(X, f, { type: 'gain', res: 'capital', amount: 2 * (X.s.players[f].roundPlays?.diplomatic || 0) }),
  'fac-redDragon-2': (X, { f }) => inject(X, f, { type: 'gain', res: 'industry', amount: rids(X.s).filter((r) => X.s.regions[r].influence[f] > 0).length }),
  'fac-emerald-2': (X, { f }) => eachPartner(X, f, (t) => {
    for (const r of rids(X.s)) if (X.s.regions[r].influence[t] > 0) X.s.regions[r].defense[t] += 1;
    log(X.s, t, '내 모든 지역 방어 +1 (연합 방어)');
  }),
  'evt-06': (X) => {
    const hits = rids(X.s).map((r) => [r, topFactions(X.s.regions[r])]);
    for (const [r, fs] of hits) for (const f of fs) log(X.s, 'event', `${r} ${f} 영향력 −${loseInfluence(X.s, f, r, 1, { event: true }).out} (시위)`);
  },
  'evt-10': (X) => {
    const r = eventRegion(X);
    for (const f of X.s.turnOrder) loseInfluence(X.s, f, r, 1, { event: true });
    log(X.s, 'event', `기후 재난: ${r} 모든 세력 영향력 −1`);
  },
  'evt-11': (X) => {
    const r = eventRegion(X);
    X.s.regions[r].scoreValue += 1;
    log(X.s, 'event', `자원 발견: ${r} 점수 가치 +1 (→ ${X.s.regions[r].scoreValue})`);
  },
  'evt-12': (X) => {
    const r = eventRegion(X), leaders = regionLeaders(X.s)[r];
    for (const f of leaders) loseInfluence(X.s, f, r, 2, { event: true });
    log(X.s, 'event', `정권 교체: ${r} ${leaders.length ? leaders.join('+') + ' 영향력 −2' : '주도 세력 없음'}`);
  },
  // 방어가 없는 지역 = 그 세력의 방어가 0인 지역 (세력별 판정)
  'evt-18': (X) => {
    for (const r of rids(X.s)) for (const f of X.s.turnOrder) {
      const reg = X.s.regions[r];
      if (reg.influence[f] > 0 && reg.defense[f] === 0) loseInfluence(X.s, f, r, 1, { event: true });
    }
    log(X.s, 'event', '국경 긴장: 방어 없는 지역 영향력 −1');
  },
  'sa-05': twoRegions,
  'sa-10': (X, { f }) => {
    for (const t of X.ctx.treated || []) { gainRes(X.s, t, 'prestige', 1); log(X.s, t, '⭐ 위신 +1 (위기 대응 연합)'); }
  },
  'sa-12': (X, { f }) => {
    for (const o of opponents(X.s, f)) {
      const hand = X.s.players[o].hand;
      if (hand.length) { const c = pick(X.s, hand); recordPeek(X.s, f, { kind: 'hand', target: o, cards: [c] }); }
    }
    log(X.s, f, '모든 세력의 손패 1장씩 확인');
  },
};
