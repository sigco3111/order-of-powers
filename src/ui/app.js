// 앱 뼈대: 작은 저장소(store) + 화면 관리자 show('title'|'setup'|'game').
import { h } from './dom.js';
import { loadData } from '../engine/browser-data.js';
import { titleScreen } from './screen-title.js';
import { setupScreen } from './screen-setup.js';
import { gameScreen } from './screen-game.js';
import { resultScreen } from './screen-result.js';
import { createLoop, readSave, SAVE_KEY as SAVE } from './loop.js';
import { current, init as initSettings, onSettings, SETTINGS_KEY as SK } from './settings.js';
import { armOnGesture, clickSfx, getAudio, setMusic } from './audio.js';

export const SAVE_KEY = SAVE, SETTINGS_KEY = SK;

/** 화면들이 공유하는 상태. 바꿀 때는 set()으로 */
export const store = {
  screen: 'title', data: null, dataError: null, game: null,
  ui: { faction: 'atlas', country: 'eu', tab: 'atlas', query: '', opp: {}, rounds: 8, level: 'normal', seed: 1 + Math.floor(Math.random() * 999999) },
  settings: current, // 설정은 settings.js의 current 하나를 함께 쓴다
  engine: '불러오는 중', loop: null, cleanup: null,
};
export const set = (patch) => Object.assign(store, patch);
export const saved = () => readSave(); // 손상된 저장은 null
let ready;
/** 데이터를 읽고 게임 루프를 만든다 (한 번만) */
export const ensureLoop = () => (ready ??= loadData().then((data) => {
  set({ data, engine: `카드 ${data.cards.length}장` }); store.loop = createLoop({ data }); paintRail(); return store.loop;
}).catch((e) => { ready = null; set({ dataError: e.message, engine: '오류' }); paintRail(); console.error(e); throw e; }));

const SCREENS = { title: titleScreen, setup: setupScreen, game: gameScreen, result: resultScreen };
const STEPS = [['title', '01', '표지'], ['setup', '02', '편성'], ['game', '03', '작전']];
let main, rail, page, doc;

function shell() {
  const app = document.getElementById('app');
  rail = h('aside', { class: 'rail', 'aria-label': '사건 철' });
  main = h('main', { id: 'main', class: 'screen', tabIndex: -1 });
  page = h('span', { class: 'label num' });
  app.replaceChildren(doc = h('div', { class: 'doc' },
    h('header', { class: 'doc-head' }, h('span', { class: 'label' }, '문서 번호 OP-0001 · 대외비'), page),
    h('div', { class: 'doc-body' }, rail, main)));
}

function paintRail() {
  const i = STEPS.findIndex(([k]) => k === (store.screen === 'result' ? 'game' : store.screen));
  rail.replaceChildren(
    h('ol', { class: 'steps' }, STEPS.map(([k, n, t], j) => h('li', { 'aria-current': j === i ? 'step' : null }, h('span', {}, n), h('span', {}, t)))),
    h('div', { class: 'rail__extra' },
      h('span', { class: 'label' }, '사건 철'),
      h('dl', {}, ...[['파일', 'OP-0001'], ['분류', '대외비'], ['시대', '균열 이후'], ['저장', saved() ? '있음' : '없음'], ['엔진', store.engine]]
        .map(([a, b]) => h('div', { class: 'leader' }, h('dt', {}, a), h('i'), h('b', { class: 'num' }, b))))));
  page.textContent = `제 ${i + 1} 면`;
}

/** 화면 전환 */
export function show(name, { focus = true } = {}) {
  store.cleanup?.();
  set({ screen: name });
  doc.dataset.screen = name; main.classList.toggle('screen--board', name === 'game');
  document.body.classList.toggle('is-game', name === 'game');
  main.replaceChildren(SCREENS[name]({ store, set, show, saved }));
  setMusic(name === 'game' || name === 'result' ? 'game' : 'menu');
  paintRail();
  window.scrollTo(0, 0);
  if (focus) main.focus({ preventScroll: true });
}

shell();
initSettings();
armOnGesture(); onSettings(() => getAudio().refresh());
// 단추를 누르면 기본 클릭음 (더 알맞은 소리가 같은 순간에 나면 취소된다)
document.addEventListener('click', (e) => { if (e.target.closest?.('button:not(:disabled), a[href], summary')) clickSfx(); }, true);
show('title', { focus: false });
ensureLoop().catch(() => {});
window.__oop = { store, show };
