import { h } from './dom.js';

// U1 자리표시: 실제 보드 화면은 U2에서 만든다.
export function gameScreen({ store, show }) {
  const s = store.game, P = s.players;
  const one = (o) => JSON.stringify(o).replace(/"([^"]+)":/g, '$1: ').replace(/,/g, ', ');
  const text = ['{', ...Object.entries({ seed: s.seed, round: `${s.round}/${s.config.rounds}`, phase: s.phase, aiLevel: s.config.aiLevel, human: s.config.humanFaction, event: s.currentEvent, marketSlots: s.market.slots.length }).map(([k, v]) => `  ${k}: ${JSON.stringify(v)},`),
    '  factions: {', ...Object.keys(P).map((f) => `    ${f}: ${one({ hand: P[f].hand.length, deck: P[f].deck.length, asset: P[f].strategicAsset, res: P[f].resources })},`), '  }', '}'].join('\n');
  return h('section', { class: 'game' },
    h('header', { class: 'screen-head' }, h('p', { class: 'label' }, '제 3 면 · 작전'), h('h2', {}, '보드 화면은 다음 단계'),
      h('p', {}, '엔진이 새 게임을 만들었습니다. 지도·손패·시장은 U2부터 이 자리에 들어옵니다.')),
    h('div', { class: 'game__grid' },
      h('div', {}, h('p', { class: 'label' }, '게임 요약 (디버그)'), h('pre', { class: 'debug', tabIndex: 0 }, text)),
      h('div', {}, h('span', { class: 'stamp stamp--press' }, '작전 개시'),
        h('div', { class: 'actions' }, h('button', { class: 'btn btn--primary', onclick: () => show('title') }, '표지로'), h('button', { class: 'btn', onclick: () => show('setup') }, '다시 편성')))));
}
