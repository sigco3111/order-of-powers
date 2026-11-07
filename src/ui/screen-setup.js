import { sfx } from './audio.js';
import { h } from './dom.js';
import { openRules } from './rules.js';
import { aiMeta } from '../ai/ai.js';
import { ensureLoop } from './app.js';
import { randomCountries, ARCHETYPES, ARCHETYPE_KO } from '../engine/index.js';

// 원형(유형)별 한 줄 성향·강점·약점. 강점은 docs/GAME_DESIGN.md §4, 약점은 다른 유형의 강점에서 역으로 도출.
export const DOSSIER = {
  atlas: { concept: '외교와 금융', play: '조약과 금융으로 판을 짜고, 외교 카드로 지역을 사들이는 유형.', pro: ['외교 카드 효율', '동맹 보너스'], con: ['기지 건설·군사 약세'] },
  redDragon: { concept: '제조업과 인프라', play: '공장과 인프라로 자원을 쌓아 내정 카드를 밀어붙이는 유형.', pro: ['내정 카드 효율', '자원 생산'], con: ['외교·동맹 약세'] },
  polarStar: { concept: '에너지와 군사', play: '에너지와 군대로 기지를 세우고 지역을 힘으로 확보하는 유형.', pro: ['군사 카드 효율', '기지 건설'], con: ['금융·조약 약세'] },
  emerald: { concept: '성장과 연합', play: '연합과 성장으로 영향력을 지키고 제재로 상대를 묶는 유형.', pro: ['영향력 방어', '제재와 조약'], con: ['직접 군사 압박 약세'] },
};
const MINUTES = { 6: 20, 8: 28, 10: 35 };
const LEVEL_KO = { easy: '쉬움', normal: '보통', hard: '어려움' };

function seg(name, options, value, onPick) {
  return h('div', { class: 'seg', role: 'radiogroup' }, options.map(([v, big, sub, ko]) => h('label', { class: 'seg__opt' },
    h('input', { type: 'radio', name, value: v, checked: String(v) === String(value), onchange: () => onPick(v) }),
    h('span', { class: ko ? 'seg__big seg__big--ko' : 'seg__big' }, big), sub && h('span', { class: 'seg__sub' }, sub))));
}
/** ISO 코드 도장: 원형 엠블럼 위에 코드를 얹는다 (국기 이모지 없음) */
export const mono = (c, big = false) => h('span', { class: `mono${big ? ' mono--big' : ''}`, 'data-a': c.archetype, style: `--fc:var(--f-${c.archetype})`, 'aria-hidden': 'true' },
  h('img', { src: `assets/ui/emblem-${c.archetype}.svg`, alt: '', width: 56, height: 56 }), h('b', {}, c.iso));
export const plainText = (t = '') => t.replace(/[\u{1F300}-\u{1FAFF}\uFE0F]/gu, '');

export function setupScreen({ store, show }) {
  const ui = store.ui, root = h('section', { class: 'setup' });
  if (!store.data) {
    root.append(h('p', { class: 'ph', role: 'status' }, store.dataError ? '자료를 불러오지 못했습니다: ' + store.dataError : '자료를 불러오는 중…'));
    ensureLoop().then(() => root.isConnected && store.screen === 'setup' && build(), () => {});
    return root;
  }
  build();
  return root;

  function build() {
    const data = store.data, C = data.countries, byId = Object.fromEntries(C.map((c) => [c.id, c])), R = Object.fromEntries(data.regions.map((r) => [r.id, r.name]));
    ui.country = byId[ui.country] ? ui.country : 'eu';
    ui.tab = ARCHETYPES.includes(ui.tab) ? ui.tab : byId[ui.country].archetype;
    ui.query ??= ''; ui.opp ??= {};
    const cur = () => byId[ui.country];
    const sum = h('span', { class: 'launch__sum' }), minutes = h('b', {}), note = h('p', { class: 'field__note', 'aria-live': 'polite' });
    const err = h('p', { class: 'alert', role: 'alert', hidden: true });
    const picker = h('div', { class: 'picker' }), side = h('aside', { class: 'cty-big', 'aria-live': 'polite', 'aria-label': '선택한 국가 자료철' }), opps = h('div', { class: 'opps' }), oppSel = h('div', { class: 'adv__opps' });
    const seed = h('input', { type: 'text', inputMode: 'numeric', 'aria-label': '시드', value: ui.seed, onchange: (e) => { ui.seed = Math.max(1, parseInt(e.target.value, 10) || 1); e.target.value = ui.seed; refresh(); } });
    const fixedOf = () => ({ ...Object.fromEntries(Object.entries(ui.opp).filter(([, v]) => v)), [cur().archetype]: ui.country });
    const lineup = () => randomCountries(data, ui.seed, fixedOf());

    const modeLine = h('p', { class: 'label', style: 'margin:6px 0 0' });
    const refresh = () => {
      ui.faction = cur().archetype;
      minutes.textContent = `약 ${MINUTES[ui.rounds]}분`;
      modeLine.textContent = data.roundModes?.[ui.rounds]?.line || '';
      note.textContent = aiMeta[ui.level].description;
      const lu = lineup();
      sum.replaceChildren(h('b', {}, `${cur().nameKo} · ${ARCHETYPE_KO[cur().archetype]}`), `${ui.rounds}라운드 · ${LEVEL_KO[ui.level]}`);
      opps.replaceChildren(h('p', { class: 'label', style: 'margin:0 0 6px' }, '상대 (컴퓨터)'), ...ARCHETYPES.filter((a) => a !== cur().archetype).map((a) => h('div', { class: 'opps__row', style: `--fc:var(--f-${a})` }, mono(byId[lu[a]]), h('span', {}, h('b', {}, byId[lu[a]].nameKo), h('small', {}, ` ${ARCHETYPE_KO[a]}`)))));
      oppSel.replaceChildren(...ARCHETYPES.filter((a) => a !== cur().archetype).map((a) => h('label', { class: 'adv__opp' }, h('span', { class: 'label' }, ARCHETYPE_KO[a]),
        h('select', { 'aria-label': `${ARCHETYPE_KO[a]} 상대 국가`, onchange: (e) => { ui.opp[a] = e.target.value || null; refresh(); } },
          h('option', { value: '' }, '무작위 (시드)'), C.filter((c) => c.archetype === a).map((c) => h('option', { value: c.id, selected: ui.opp[a] === c.id }, c.nameKo))))));
      paintSide();
    };

    const trait = (c) => h('div', { class: 'trait' }, h('span', { class: 'tag' }, '특성'), h('span', {}, h('b', {}, c.trait.nameKo), ' — ', plainText(c.trait.text)));
    const detail = (c) => { const d = DOSSIER[c.archetype]; return [
      h('p', { class: 'cty__profile' }, c.profile), trait(c),
      h('ul', { class: 'dossier__list' }, d.pro.map((t) => h('li', {}, h('span', { class: 'tag tag--pro' }, '강점'), t)), d.con.map((t) => h('li', {}, h('span', { class: 'tag tag--con' }, '약점'), t)))]; };
    function paintSide() {
      const c = cur(), d = DOSSIER[c.archetype];
      side.style.cssText = `--ac:${c.accent};--fc:var(--f-${c.archetype})`;
      side.replaceChildren(h('span', { class: 'label' }, `국가 자료철 · ${c.iso}`),
        h('div', { class: 'cty-big__head' }, mono(c, true), h('div', {}, h('h3', {}, c.nameKo), h('p', { class: 'cty-big__en' }, c.nameEn))),
        h('div', { class: 'leader' }, h('span', {}, '유형'), h('i'), h('b', {}, `${ARCHETYPE_KO[c.archetype]} · ${d.concept}`)),
        h('div', { class: 'leader' }, h('span', {}, '본거지'), h('i'), h('b', {}, R[c.homeRegion])),
        ...detail(c), h('span', { class: 'stamp stamp--press' }, '지정'));
    }

    function paintPicker() {
      const q = ui.query.trim().toLowerCase();
      const match = (c) => [c.nameKo, c.nameEn, c.iso, R[c.homeRegion], c.trait.nameKo].some((x) => x.toLowerCase().includes(q));
      const list = q ? C.filter(match) : C.filter((c) => c.archetype === ui.tab);
      const pick = (c) => { ui.country = c.id; ui.tab = c.archetype; refresh(); paintPicker(); };
      const tabs = h('div', { class: 'ctabs', role: 'tablist', 'aria-label': '유형' }, ARCHETYPES.map((a) => h('button', {
        type: 'button', role: 'tab', class: 'ctab', style: `--fc:var(--f-${a})`, 'aria-selected': String(!q && ui.tab === a), onclick: () => { ui.tab = a; ui.query = ''; search.value = ''; paintPicker(); },
      }, h('img', { src: `assets/ui/emblem-${a}.svg`, alt: '', width: 22, height: 22 }), h('span', {}, ARCHETYPE_KO[a]), h('small', {}, DOSSIER[a].concept))));
      const cards = list.map((c) => {
        const on = c.id === ui.country;
        return h('label', { class: `cty${on ? ' is-on' : ''}`, style: `--ac:${c.accent};--fc:var(--f-${c.archetype})` },
          h('input', { type: 'radio', name: 'country', value: c.id, checked: on, onchange: () => pick(c) }),
          mono(c),
          h('span', { class: 'cty__main' }, h('b', { class: 'cty__name' }, c.nameKo, h('small', {}, c.nameEn)), h('span', { class: 'cty__meta' }, `${q ? ARCHETYPE_KO[c.archetype] + ' · ' : ''}본거지 ${R[c.homeRegion]}`), h('span', { class: 'cty__trait' }, `특성 · ${c.trait.nameKo}`)),
          h('span', { class: 'cty__detail' }, ...detail(c), h('span', { class: 'cty__home' }, `본거지 ${R[c.homeRegion]}`)));
      });
      picker.replaceChildren(tabs, h('div', { class: 'cty-list', role: 'radiogroup', 'aria-label': '국가' }, cards.length ? cards : h('p', { class: 'ph' }, '찾는 국가가 없습니다.')));
    }
    const search = h('input', { type: 'search', class: 'finder', placeholder: '국가 이름·코드 검색', 'aria-label': '국가 검색', value: ui.query, oninput: (e) => { ui.query = e.target.value; paintPicker(); } });

    const launch = async (e) => {
      const btn = e.currentTarget; btn.disabled = true; err.hidden = true;
      try {
        const loop = await ensureLoop();
        loop.start({ rounds: ui.rounds, factions: ARCHETYPES, humanFaction: cur().archetype, seed: ui.seed, aiLevel: ui.level, countries: lineup() });
        sfx('stamp'); show('game');
      } catch (x) { err.textContent = '작전을 시작하지 못했습니다: ' + x.message; err.hidden = false; btn.disabled = false; console.error(x); }
    };

    const orders = h('section', { class: 'panel orders', 'aria-labelledby': 'ord' },
      h('div', { class: 'panel__head' }, h('h3', { id: 'ord', style: 'font-size:1rem' }, '작전 조건'), h('span', { class: 'label' }, '제 2 항')),
      h('div', { class: 'panel__body' },
        h('div', { class: 'field' }, opps),
        h('div', { class: 'field', role: 'group', 'aria-label': '라운드 수' }, h('p', { class: 'label field__label' }, '라운드 수'),
          seg('rounds', [[6, '6', '짧게'], [8, '8', '기본'], [10, '10', '길게']], ui.rounds, (v) => { ui.rounds = Number(v); refresh(); }),
          h('div', { class: 'leader' }, h('span', {}, '예상 소요'), h('i'), minutes), modeLine),
        h('div', { class: 'field', role: 'group', 'aria-label': 'AI 난이도' }, h('p', { class: 'label field__label' }, 'AI 난이도'),
          seg('level', Object.keys(aiMeta).map((k) => [k, aiMeta[k].name, '', true]), ui.level, (v) => { ui.level = v; refresh(); }), note),
        h('div', { class: 'field' }, h('details', { class: 'adv' }, h('summary', {}, '고급 설정'),
          h('p', { class: 'label', style: 'margin:8px 0 0' }, '상대 국가 직접 선택'), oppSel,
          h('p', { class: 'label', style: 'margin:12px 0 0' }, '시드 (같은 시드 = 같은 판 · 상대 국가도 시드로 정해짐)'),
          h('div', { class: 'adv__row' }, seed, h('button', { class: 'btn btn--sm', type: 'button', onclick: () => { ui.seed = 1 + Math.floor(Math.random() * 999999); seed.value = ui.seed; refresh(); } }, '무작위'))))));

    refresh(); paintPicker();
    root.replaceChildren(
      h('header', { class: 'screen-head' }, h('div', { class: 'screen-head__row' }, h('p', { class: 'label' }, '제 2 면 · 편성'), h('span', { class: 'screen-head__btns' }, h('button', { class: 'btn btn--sm', type: 'button', onclick: () => openRules({ data: store.data }) }, '규칙'), h('button', { class: 'btn btn--sm', onclick: () => show('title') }, '← 표지'))), h('h2', {}, '국가 지정'),
        h('p', {}, 'G20 국가 가운데 하나를 골라 지휘하십시오. 나머지 세 자리는 다른 유형의 국가가 컴퓨터로 앉습니다.')),
      err,
      h('div', { class: 'setup__grid' },
        h('fieldset', { class: 'cpick' }, h('legend', { class: 'label' }, '제 1 항 · 국가 지정'), search, picker),
        h('div', { class: 'orders-col' }, side, orders,
          h('div', { class: 'launch' }, sum, h('button', { class: 'btn btn--primary', onclick: launch }, '작전 개시')))));
  }
}
