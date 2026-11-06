// 앱 뼈대: 작은 저장소(store) + 화면 관리자 show('title'|'setup'|'game').
import { h } from './dom.js';
import { loadData } from '../engine/browser-data.js';
import { titleScreen } from './screen-title.js';
import { setupScreen } from './screen-setup.js';
import { gameScreen } from './screen-game.js';

export const SAVE_KEY = 'oop-save-v1', SETTINGS_KEY = 'oop-settings-v1';
const read = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };

/** 화면들이 공유하는 상태. 바꿀 때는 set()으로 */
export const store = {
  screen: 'title', data: null, dataError: null, game: null,
  ui: { faction: 'atlas', rounds: 8, level: 'normal', seed: 1 + Math.floor(Math.random() * 999999) },
  settings: { reduceMotion: false, sound: true, ...read(SETTINGS_KEY) },
  engine: '불러오는 중',
};
export const set = (patch) => Object.assign(store, patch);
export const saved = () => read(SAVE_KEY);
export const saveGame = () => localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 1, savedAt: Date.now(), ui: store.ui, state: store.game }));
export const applySettings = () => {
  document.documentElement.dataset.motion = store.settings.reduceMotion ? 'reduce' : 'auto';
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(store.settings));
};

const SCREENS = { title: titleScreen, setup: setupScreen, game: gameScreen };
const STEPS = [['title', '01', '표지'], ['setup', '02', '편성'], ['game', '03', '작전']];
let main, rail, page;

function shell() {
  const app = document.getElementById('app');
  rail = h('aside', { class: 'rail', 'aria-label': '사건 철' });
  main = h('main', { id: 'main', class: 'screen', tabIndex: -1 });
  page = h('span', { class: 'label num' });
  app.replaceChildren(h('div', { class: 'doc' },
    h('header', { class: 'doc-head' }, h('span', { class: 'label' }, '문서 번호 OP-0001 · 대외비'), page),
    h('div', { class: 'doc-body' }, rail, main)));
}

function paintRail() {
  const i = STEPS.findIndex(([k]) => k === store.screen);
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
  set({ screen: name });
  main.replaceChildren(SCREENS[name]({ store, set, show, saved, saveGame }));
  paintRail();
  window.scrollTo(0, 0);
  if (focus) main.focus({ preventScroll: true });
}

shell();
applySettings();
show('title', { focus: false });
loadData().then((data) => {
  set({ data, engine: `카드 ${data.cards.length}장` });
  paintRail();
}).catch((e) => { set({ dataError: e.message, engine: '오류' }); paintRail(); console.error(e); });
window.__oop = { store, show };
