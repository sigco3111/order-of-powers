import { h } from './dom.js';
import { createGame, autoPlay } from '../engine/index.js';
import { aiMeta } from '../ai/ai.js';
import { loadData } from '../engine/browser-data.js';

// 한 줄 성향·강점·약점. 강점은 docs/GAME_DESIGN.md §4, 약점은 기획서에 없어 다른 세력의 강점에서 역으로 도출(밸런스 확정 시 갱신).
export const DOSSIER = {
  atlas: { concept: '해양 동맹과 금융', play: '동맹과 금융으로 판을 짜고, 외교로 지역을 사들이는 해양 세력.', pro: ['외교 카드 효율', '동맹 보너스'], con: ['기지 건설·군사 약세'] },
  redDragon: { concept: '제조업과 인프라', play: '공장과 인프라로 자원을 쌓아 내정 카드를 밀어붙이는 제조 세력.', pro: ['내정 카드 효율', '자원 생산'], con: ['외교·동맹 약세'] },
  polarStar: { concept: '에너지와 군사', play: '에너지와 군대로 기지를 세우고 지역을 힘으로 확보하는 세력.', pro: ['군사 카드 효율', '기지 건설'], con: ['금융·조약 약세'] },
  emerald: { concept: '규범과 연합', play: '규범과 연합으로 영향력을 지키고 제재로 상대를 묶는 세력.', pro: ['영향력 방어', '제재와 조약'], con: ['직접 군사 압박 약세'] },
};
const MINUTES = { 6: 20, 8: 28, 10: 35 };
const LEVEL_KO = { easy: '쉬움', normal: '보통', hard: '어려움' };
// 서류 번호 순서와 이름은 data/factions.json과 같다 (데이터 로드 전에도 그릴 수 있게 고정)
const ORDER = [['atlas', '아틀라스 연합'], ['redDragon', '적룡 공화국'], ['polarStar', '북극성 연방'], ['emerald', '에메랄드 연맹']];

function seg(name, options, value, onPick) {
  return h('div', { class: 'seg', role: 'radiogroup' }, options.map(([v, big, sub, ko]) => h('label', { class: 'seg__opt' },
    h('input', { type: 'radio', name, value: v, checked: String(v) === String(value), onchange: () => onPick(v) }),
    h('span', { class: ko ? 'seg__big seg__big--ko' : 'seg__big' }, big), sub && h('span', { class: 'seg__sub' }, sub))));
}

export function setupScreen({ store, set, show, saveGame }) {
  const ui = store.ui, ids = ORDER.map(([id]) => id), name = (id) => ORDER.find(([i]) => i === id)[1];
  const sum = h('span', { class: 'launch__sum' }), minutes = h('b', {}), note = h('p', { class: 'field__note', 'aria-live': 'polite' });
  const err = h('p', { class: 'alert', role: 'alert', hidden: true });
  const seed = h('input', { type: 'text', inputMode: 'numeric', 'aria-label': '시드', value: ui.seed, onchange: (e) => { ui.seed = Math.max(1, parseInt(e.target.value, 10) || 1); e.target.value = ui.seed; } });
  const refresh = () => {
    minutes.textContent = `약 ${MINUTES[ui.rounds]}분`;
    note.textContent = aiMeta[ui.level].description;
    sum.replaceChildren(h('b', {}, name(ui.faction)), `${ui.rounds}라운드 · ${LEVEL_KO[ui.level]}`);
  };

  const dossiers = ORDER.map(([id, nm], i) => {
    const d = DOSSIER[id];
    return h('label', { class: 'dossier', style: `--fc:var(--f-${id})` },
      h('span', { class: 'dossier__tab' }, `파일 0${i + 1} · ${id}`),
      h('input', { type: 'radio', name: 'faction', value: id, checked: ui.faction === id, onchange: () => { ui.faction = id; refresh(); } }),
      h('div', { class: 'dossier__head' },
        h('img', { class: 'dossier__emblem', src: `assets/ui/emblem-${id}.svg`, alt: '', width: 56, height: 56 }),
        h('div', {}, h('span', { class: 'label' }, d.concept), h('h3', {}, nm))),
      h('p', { class: 'dossier__play' }, d.play),
      h('ul', { class: 'dossier__list' },
        d.pro.map((t) => h('li', {}, h('span', { class: 'tag tag--pro' }, '강점'), t)),
        d.con.map((t) => h('li', {}, h('span', { class: 'tag tag--con' }, '약점'), t))),
      h('span', { class: 'stamp stamp--press' }, '지정'));
  });

  const launch = async (e) => {
    const btn = e.currentTarget; btn.disabled = true; err.hidden = true;
    try {
      const data = store.data || await loadData();
      set({ data });
      let s = createGame({ data, rounds: ui.rounds, factions: ids, humanFaction: ui.faction, seed: ui.seed, aiLevel: ui.level });
      // U1 자리표시: 전략 자산을 각 세력의 첫 후보로 자동 선택해 1라운드 손패까지 진행 (실제 선택 UI는 U2)
      s = autoPlay(s, (st, f, legal) => (st.phase === 'setup' && legal.length ? legal[0] : null), { data }).state;
      set({ game: s }); saveGame(); show('game');
    } catch (x) { err.textContent = '작전을 시작하지 못했습니다: ' + x.message; err.hidden = false; btn.disabled = false; console.error(x); }
  };

  const orders = h('section', { class: 'panel orders', 'aria-labelledby': 'ord' },
    h('div', { class: 'panel__head' }, h('h3', { id: 'ord', style: 'font-size:1rem' }, '작전 조건'), h('span', { class: 'label' }, '제 2 항')),
    h('div', { class: 'panel__body' },
      h('div', { class: 'field', role: 'group', 'aria-label': '라운드 수' }, h('p', { class: 'label field__label' }, '라운드 수'),
        seg('rounds', [[6, '6', '짧게'], [8, '8', '기본'], [10, '10', '길게']], ui.rounds, (v) => { ui.rounds = Number(v); refresh(); }),
        h('div', { class: 'leader' }, h('span', {}, '예상 소요'), h('i'), minutes)),
      h('div', { class: 'field', role: 'group', 'aria-label': 'AI 난이도' }, h('p', { class: 'label field__label' }, 'AI 난이도'),
        seg('level', Object.keys(aiMeta).map((k) => [k, aiMeta[k].name, '', true]), ui.level, (v) => { ui.level = v; refresh(); }), note),
      h('div', { class: 'field' }, h('details', { class: 'adv' }, h('summary', {}, '고급 설정'),
        h('p', { class: 'label', style: 'margin:8px 0 0' }, '시드 (같은 시드 = 같은 판)'),
        h('div', { class: 'adv__row' }, seed, h('button', { class: 'btn btn--sm', type: 'button', onclick: () => { ui.seed = 1 + Math.floor(Math.random() * 999999); seed.value = ui.seed; } }, '무작위'))))));

  refresh();
  return h('section', { class: 'setup' },
    h('header', { class: 'screen-head' }, h('div', { class: 'screen-head__row' }, h('p', { class: 'label' }, '제 2 면 · 편성'), h('button', { class: 'btn btn--sm', onclick: () => show('title') }, '← 표지')), h('h2', {}, '작전 편성'),
      h('p', {}, '지휘할 세력을 지정하고 판의 조건을 정하십시오. 나머지 세 세력은 컴퓨터가 맡습니다.')),
    err,
    h('div', { class: 'setup__grid' },
      h('fieldset', { class: 'factions' }, h('legend', { class: 'label' }, '제 1 항 · 세력 지정'), dossiers),
      h('div', { class: 'orders-col' }, orders,
        h('div', { class: 'launch' }, sum, h('button', { class: 'btn btn--primary', onclick: launch }, '작전 개시')))));
}
