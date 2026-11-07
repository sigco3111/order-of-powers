import { h, icon, openSheet } from './dom.js';
import { ensureLoop } from './app.js';
import { openSettings } from './settings-view.js';
import { openRecords } from './records-view.js';
import { readRecords } from './records.js';

const LOOP = ['라운드 시작: 이벤트 카드 1장이 공개되어 전 세계에 영향을 줍니다.', '계획: 손패 5장 중 3장을 골라 비공개로 배치합니다.', '공개와 실행: 모두 동시에 공개하고 우선권 순서대로 효과를 실행합니다.', '정산: 지역별 영향력을 비교해 점수를 얻고 자원 수입을 받습니다.', '성장: 시장에서 카드를 구매해 덱을 키웁니다.', '마지막 라운드가 끝나면 최종 점수를 집계합니다.'];

function drawMap(box) { // 실제 세계 지도를 잉크 선화로: 바탕·라벨·마커 제거, 경위선 추가
  fetch(new URL('../../assets/map/world-regions.svg', import.meta.url)).then((r) => r.text()).then((t) => {
    const doc = new DOMParser().parseFromString(t, 'image/svg+xml').documentElement;
    doc.querySelectorAll('#background, #labels, #markers, title, desc').forEach((n) => n.remove());
    doc.removeAttribute('role'); doc.removeAttribute('aria-labelledby'); doc.setAttribute('class', 'map-draw');
    let g = '';
    for (let x = 100; x < 1000; x += 100) g += `M${x} 0V520`;
    for (let y = 100; y < 520; y += 100) g += `M0 ${y}H1000`;
    doc.insertAdjacentHTML('afterbegin', `<g class="grid"><path d="${g}"/></g>`);
    box.append(document.importNode(doc, true));
  }).catch(() => {});
}

export function titleScreen({ store, show, saved }) {
  const map = h('div', { class: 'title__map', 'aria-hidden': 'true' });
  drawMap(map);
  const has = !!saved();
  const cont = async (e) => { // 저장을 읽어 이어하기 (손상되면 안내)
    const b = e.currentTarget; b.disabled = true;
    try { const loop = await ensureLoop(); if (loop.load()) { Object.assign(store.ui, loop.ui); show('game'); return; } } catch (x) { console.error(x); }
    b.querySelector('.hint').textContent = '저장이 손상됨'; };
  const row = (n, t, hint, extra = {}) => h('button', { class: 'btn btn--block', ...extra }, h('span', { class: 'num' }, n), t, h('span', { class: 'hint' }, hint));
  const rules = () => openSheet('규칙 요약', h('ol', { style: 'padding-left:1.4em;margin:0' }, LOOP.map((l) => h('li', { style: 'margin-bottom:8px' }, l))));
  const settings = () => openSettings({ show, store });
  return h('section', { class: 'title' }, map,
    h('div', { class: 'title__main' },
      h('p', { class: 'label' }, '정세 브리핑 · 제 1 호 · 균열 이후'),
      h('h1', {}, h('span', { class: 'title__ko' }, '권력의 질서'), h('span', { class: 'title__en' }, 'Order of Powers')),
      h('span', { class: 'stamp title__stamp' }, '비공개 시뮬레이션'),
      h('p', { class: 'title__sub' }, '낡은 질서가 무너진 뒤, G20 국가 가운데 하나를 골라 빈자리를 두고 겨룹니다. 카드를 계획하고 지역의 영향력을 쌓아 새로운 세계 질서의 첫 장을 쓰십시오.'),
      h('div', { class: 'title__facts' }, ...[['참가 국가', '04'], ['지역', '08'], ['라운드', '6 · 8 · 10'], ['한 판', '20–35분']].map(([a, b]) => h('div', { class: 'leader' }, h('span', {}, a), h('i'), h('b', {}, b)))),
      h('nav', { class: 'menu', 'aria-label': '메인 메뉴' },
        h('button', { class: 'btn btn--primary btn--block', onclick: () => show('setup') }, h('span', {}, h('span', { class: 'num' }, '01  '), '새 게임'), icon('assets/icons/kenney-board-game-icons/arrow_right.png')),
        row('02', '이어하기', has ? '저장됨' : '저장 없음', { disabled: !has, onclick: cont }),
        row('03', '규칙', '6단계', { onclick: rules }),
        row('04', '설정', '', { onclick: settings }),
        row('05', '기록', `${readRecords().length}판`, { onclick: () => openRecords() }))),
    h('p', { class: 'label title__fig' }, '도 1 · 세계 8개 지역 · 축척 없음'));
}
