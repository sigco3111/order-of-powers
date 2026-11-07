// 튜토리얼: 고정 시드 4라운드 연습판 위에 14단계 코치 마크를 얹는다.
// 위쪽 절반(코어)은 DOM 없이 동작해 node 테스트가 가능하고, 아래쪽(initTutorial)이 실제 화면에 코치 패널과 스포트라이트를 그린다.
import { h } from './dom.js';
import { createLoop, SAVE_KEY } from './loop.js';
import { waitingFor } from '../engine/index.js';
import { shopView } from './shop-model.js';
import { unlockAchievement } from './records.js';

export const TUT_KEY = 'oop-tutorial-v1', OFFER_KEY = 'oop-tutorial-offer', HINT_KEY = 'oop-seen-hints';
export const ME = 'redDragon', CARD = 'st-common-4'; // 한국(산업형) · 지정 카드 '외교 서한'
export const TUT_SEED = 2;
export const TUT_CONFIG = Object.freeze({
  rounds: 4, tutorial: true, factions: ['atlas', 'redDragon', 'polarStar', 'emerald'], humanFaction: ME, seed: TUT_SEED, aiLevel: 'easy',
  countries: { atlas: 'deu', redDragon: 'kor', polarStar: 'rus', emerald: 'ind' },
});
const REJECT = '튜토리얼: 안내된 행동만 할 수 있습니다';

// ── 단계표 ──  kind: info(다음으로 넘김) | action(직접 해야 넘어감). ready: 이 단계를 보여도 되는 게임 상태. done: action 완료 조건. allow: 사람이 낼 수 있는 엔진 행동.
const planNow = (c) => c.s.round === 1 && c.s.phase === 'plan' && waitingFor(c.s).includes(ME);
const shopNow = (c) => c.s.round === 1 && c.s.phase === 'shop';
const planFlag = (k) => (c) => !!c.flags[k] || c.s.phase !== 'plan' || !waitingFor(c.s).includes(ME);
export const STEPS = [
  { id: 1, title: '목표', kind: 'info', target: '.frow.is-you', ready: planNow,
    text: '이 판의 목표는 가장 높은 점수를 얻는 것입니다. 점수는 세 가지의 합입니다. 지역 우위(영향력이 가장 많은 지역에서 얻는 점수), 위신, 그리고 마지막에 공개되는 비밀 목표. 여기가 당신 나라(한국)의 현황 줄입니다.' },
  { id: 2, title: '지도와 영향력', kind: 'info', target: '.map', ready: planNow, dock: 'closed',
    text: '세계는 8개 지역입니다. 지역마다 영향력 칩이 가장 많은 세력이 그 지역을 주도하고, 정산 때 그 지역의 점수 가치를 얻습니다.' },
  { id: 3, title: '자원', kind: 'info', target: '.frow.is-you .frow__res', ready: planNow,
    text: '자본은 카드를 사는 데, 에너지와 산업은 카드 효과에 쓰입니다. 위신은 점수에 바로 더해집니다. 지역이 자원을 만들어 주며 정산 때 수입으로 들어옵니다.' },
  { id: 4, title: '이벤트 카드', kind: 'info', target: '.bhead .evt', ready: planNow,
    text: '라운드마다 이벤트 카드가 한 장 공개되어 모든 세력에 영향을 줍니다. 계획을 세우기 전에 이번 라운드의 사건을 먼저 읽으세요.' },
  { id: 5, title: '손패와 계획 칸', kind: 'info', target: '.hand', ready: planNow, dock: 'open',
    text: '손패 5장 가운데 최대 3장을 계획 칸 ① ② ③에 비공개로 놓습니다. 모두가 동시에 공개한 뒤 칸 순서대로 해결됩니다.' },
  { id: 6, title: '카드 한 장 고르기', kind: 'action', target: '.hand__c[aria-label^="외교 서한"], .sheet .detail__btns .btn--primary', ready: planNow, dock: 'open',
    done: planFlag('placed'), ask: "손패의 '외교 서한' 카드를 눌러 연 뒤 '계획에 넣기'를 누르세요.",
    text: '이 카드는 영향력 1을 원하는 지역에 놓게 해 줍니다. 오늘은 지정된 카드만 쓸 수 있습니다.' },
  { id: 7, title: '지역 선택', kind: 'action', target: '.map', ready: planNow, dock: 'closed',
    done: planFlag('region'), ask: '지도에서 지역 하나를 눌러 보세요.',
    text: '지역을 누르면 점수 가치, 주도 세력, 산출 자원, 세력별 영향력이 열립니다. 외교 서한은 해결할 때 어느 지역에 놓을지 묻습니다.' },
  { id: 8, title: '계획 확정', kind: 'action', target: '.tray__bar .btn--primary, .dock__go', ready: planNow, dock: 'open',
    done: (c) => c.s.phase !== 'plan' || !waitingFor(c.s).includes(ME), ask: "'계획 확정'을 누르세요.",
    allow: (a) => a.type === 'PLAN' && a.cards?.length === 1 && a.cards[0] === CARD && !a.assetUse,
    text: '확정하면 비공개로 제출되며 고칠 수 없습니다.' },
  { id: 9, title: '공개와 해결', kind: 'action', target: '.ovl--reveal .ovl__box, .act', ready: (c) => c.s.round === 1 && c.s.phase !== 'plan',
    done: (c) => c.s.phase === 'shop' && !c.s.pending?.length, ask: "'해결 시작'을 누르고, 지역을 물으면 하나 골라 '확정'하세요.", allow: (a) => a.type === 'CHOOSE',
    text: '모든 계획이 공개되고, 우선권 순서대로 카드가 해결됩니다. 외교 서한은 영향력을 놓을 지역을 묻습니다.' },
  { id: 10, title: '정산과 지역 점수', kind: 'info', target: '.ovl--sum .ovl__box, .frow.is-you .frow__score, .shop__head', ready: shopNow, click: '.ovl--sum .btn--primary',
    text: '정산: 지역마다 영향력이 가장 많은 세력이 그 지역의 점수를 얻고, 지역이 만든 자원이 수입으로 들어옵니다. 내 점수는 현황 줄에서 확인합니다.' },
  { id: 11, title: '상점에서 카드 사기', kind: 'action', target: '.sitem:not(.is-no), .sheet .detail__btns .btn--primary', ready: shopNow,
    done: (c) => c.s.players[ME].purchases >= 1, ask: '살 수 있는 카드를 눌러 연 뒤 구매하세요.', allow: (a) => a.type === 'BUY',
    stuck: (c, data) => { const v = shopView(c.s, data, ME); return ![...v.market, ...v.first, ...v.growth].some((x) => x.afford); },
    text: '라운드 끝마다 자본으로 카드를 한 장 이상 살 수 있습니다. 산 카드는 덱에 들어가 이후 손패로 돌아옵니다.' },
  { id: 12, title: '방어·영향력 제거·조약', kind: 'info', target: '.shop__body', ready: shopNow,
    text: '방어 칩은 상대의 영향력 제거를 막아 주고, 영향력 제거 카드는 상대 칩을 줄입니다. 조약을 맺은 세력은 이름 옆에 겹친 두 고리로 표시됩니다. 연습판에서는 나오지 않지만 정식 게임의 핵심입니다.' },
  { id: 13, title: '비밀 목표·전략 자산·따라잡기', kind: 'info', target: '.shop__deck', ready: shopNow,
    text: '비밀 목표 2장은 게임이 끝날 때 공개되어 점수가 됩니다. 전략 자산은 한 판에 한 번 쓰는 특별 카드입니다. 라운드 시작 때 점수가 가장 낮은 세력은 자본 +1과 첫 영향력 +1을 받습니다(따라잡기).' },
  { id: 14, title: '끝', kind: 'info', target: '.shop__foot', ready: shopNow, last: true,
    text: '튜토리얼을 마쳤습니다. 연습판은 4라운드였고, 정식 게임은 8라운드(약 28분)입니다. 이제 직접 세력을 골라 겨뤄 보세요.' },
];

// ── 저장: 튜토리얼 판은 일반 저장(oop-save-v1)을 건드리지 않고 oop-tutorial-v1 안에 단계와 함께 둔다 ──
const parse = (raw) => { try { return JSON.parse(raw); } catch { return null; } };
export function readProgress(storage = globalThis.localStorage) {
  let raw; try { raw = storage.getItem(TUT_KEY); } catch { return null; }
  const o = raw && parse(raw);
  return o && o.v === 1 && Number.isInteger(o.step) && o.step >= 0 && o.step < STEPS.length && !o.done && o.save?.state?.phase ? o : null;
}
export const hasProgress = (storage) => !!readProgress(storage);
export const offerSeen = (storage = globalThis.localStorage) => { try { return !!storage.getItem(OFFER_KEY); } catch { return true; } };
export const setOfferSeen = (storage = globalThis.localStorage) => { try { storage.setItem(OFFER_KEY, '1'); } catch { /* 무시 */ } };
export const clearProgress = (storage = globalThis.localStorage) => { try { storage.removeItem(TUT_KEY); } catch { /* 무시 */ } };

/** 저장된 단계를 게임 상태에 맞게 고른다 (계획 칸에 놓은 임시 카드는 저장되지 않으므로 6단계부터 다시) */
export function resumeStep(step, s) {
  if (s.phase === 'plan' && s.round === 1) return Math.min(step, 5);
  if (s.round > 1 || s.phase === 'end') return STEPS.length - 1;
  if (s.phase === 'shop') return Math.max(step, 9);
  return Math.max(step, 8);
}

/**
 * createTutorial({ data, storage, resume }) — 화면 없는 코어.
 * loop: 튜토리얼 전용 게임 루프(자기 저장소 사용), step: 0부터, flags: UI가 알려 주는 일(placed, region)
 */
export function createTutorial({ data, storage = globalThis.localStorage, resume = false } = {}) {
  let rec = (resume && readProgress(storage)) || { v: 1, step: 0, save: null, done: false };
  const write = () => { try { storage.setItem(TUT_KEY, JSON.stringify(rec)); } catch { /* 무시 */ } };
  const inner = {
    getItem: (k) => (k === SAVE_KEY && rec.save ? JSON.stringify(rec.save) : null),
    setItem: (k, v) => { if (k === SAVE_KEY) { rec.save = parse(v); write(); } },
    removeItem: (k) => { if (k === SAVE_KEY) { rec.save = null; write(); } },
  };
  const loop = createLoop({ data, storage: inner });
  const subs = new Set(), flags = {};
  const ctx = () => ({ s: loop.state, flags, data });
  const core = {
    loop, flags, alive: true, human: ME,
    get step() { return rec.step; }, get cur() { return STEPS[rec.step]; }, get done() { return !!rec.done; },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    _emit() { for (const fn of subs) fn(core); },
    ready() { return core.alive && !!loop.state && core.cur.ready(ctx()); },
    stuck() { return !!core.cur.stuck?.(ctx(), data); },
    canNext() { const c = core.cur; return !c.last && (c.kind === 'info' || core.stuck()); },
    canPrev() { const p = STEPS[rec.step - 1]; return !!p && p.kind === 'info' && p.ready(ctx()) && !core.cur.last; },
    /** 엔진 행동 검사: 안내된 행동이 아니면 이유를 돌려준다 */
    reject(a) {
      if (!core.alive || a?.faction !== ME) return null;
      return core.cur.allow?.(a, ctx()) ? null : REJECT;
    },
    flag(k, v = true) { if (!!flags[k] === !!v) return; flags[k] = v; core.check(); },
    go(i) { rec.step = Math.max(0, Math.min(STEPS.length - 1, i)); if (core.cur.last) core.complete(); write(); core._emit(); },
    /** action 단계가 끝났으면 다음 단계로 (연쇄 가능) */
    check() {
      if (!core.alive || !loop.state) return;
      for (let n = 0; n < STEPS.length && core.cur.kind === 'action' && core.cur.done(ctx()); n++) core.go(rec.step + 1);
      core._emit();
    },
    next() { if (!core.canNext()) return false; core.go(rec.step + 1); return true; },
    prev() { if (!core.canPrev()) return false; core.go(rec.step - 1); return true; },
    /** 마지막 단계에 닿으면 수료: 첫 판 안내를 봤다고 표시하고 업적을 준다 (한 번만) */
    complete() {
      if (rec.done) return;
      rec.done = true;
      try { storage.setItem(HINT_KEY, '1'); } catch { /* 무시 */ }
      unlockAchievement(storage, 'tutorial', new Date().toISOString());
    },
    /** 새 판: 한국 vs 쉬움 AI 셋. 사람의 전략 자산은 첫 번째 것으로 대신 정한다 */
    async start() {
      rec = { v: 1, step: 0, save: null, done: false };
      loop.start({ ...TUT_CONFIG });
      await loop.run();
      if (waitingFor(loop.state).includes(ME)) loop.dispatch(loop.pick(ME));
      core.install(); write(); return loop.state;
    },
    /** 저장에서 이어하기 */
    resume() {
      if (!loop.load()) return null;
      rec.step = resumeStep(rec.step, loop.state); write();
      core.install(); return loop.state;
    },
    /** 루프의 dispatch에 가드를 씌운다: 안내된 행동과 AI 차례만 통과 */
    install() {
      if (core._orig) return;
      const orig = core._orig = loop.dispatch;
      loop.dispatch = (a) => { const why = core.reject(a); return why ? { ok: false, reason: why, events: [] } : orig(a); };
      loop.subscribe((s, kind) => { if (kind === 'state') core.check(); });
    },
    exit({ erase = true } = {}) { core.alive = false; loop.stop(); if (erase) clearProgress(storage); core._emit(); },
  };
  return core;
}

// ═════════ 화면: 코치 패널 + 스포트라이트 ═════════
const css = () => { if (document.getElementById('tut-css')) return; document.head.append(h('link', { id: 'tut-css', rel: 'stylesheet', href: new URL('./tutorial.css', import.meta.url).href })); };
const pad2 = (n) => String(n).padStart(2, '0');

/** initTutorial({ store, show, ensureLoop }) → { start, resume, onScreen, active } */
export function initTutorial({ store, show, ensureLoop, storage = globalThis.localStorage }) {
  let core = null, main = null, ui = null;

  async function open(resume) {
    const base = await ensureLoop();
    main ??= base;
    if (core) detach();
    core = createTutorial({ data: store.data, storage, resume });
    if (resume ? !core.resume() : !(await core.start())) { core = null; return false; }
    setOfferSeen(storage);
    store.loop = core.loop; Object.assign(store.ui, core.loop.ui);
    show('game'); ui = mount(core);
    return true;
  }
  function detach() { // 코치를 내리고 일반 루프를 되돌린다 (진행은 저장돼 있다)
    ui?.destroy(); ui = null;
    if (core) { core.exit({ erase: false }); core = null; }
    if (main) store.loop = main;
  }
  function finish(to) { // 수료 또는 건너뛰기: 연습판을 지우고 이동
    const done = core?.done; ui?.destroy(); ui = null;
    core?.exit({ erase: true }); core = null; store.loop = main;
    if (done && to === 'setup') { store.ui.rounds = 8; store.ui.level = 'normal'; }
    show(to);
  }
  function mount(c) {
    css();
    const live = h('div', { class: 'sr-only', 'aria-live': 'polite', role: 'status' });
    const panel = h('aside', { class: 'tut__panel', role: 'region', 'aria-label': '튜토리얼 안내', tabIndex: -1 });
    const dims = [0, 1, 2, 3].map(() => h('div', { class: 'tut__dim' })), frame = h('div', { class: 'tut__frame' });
    const root = h('div', { class: 'tut', hidden: true }, ...dims, frame, panel, live);
    document.body.append(root);
    let key = '', last = '', skipAsk = false, tgt = null, lost = 0;

    const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1 ? r : null; };
    function find(sel) {
      root.hidden = true; // 덮개가 눈에 띄지 않게 하고 실제 화면을 잰다
      try {
        for (const el of document.querySelectorAll(sel)) {
          let r = visible(el); if (!r) continue;
          if ((r.top < 0 || r.bottom > innerHeight) && r.height < innerHeight * .8 && !el.closest('.sheet-backdrop, .ovl')) { el.scrollIntoView({ block: 'center', inline: 'nearest' }); r = visible(el) || r; } // 화면 밖이면 먼저 가운데로
          const x = Math.min(innerWidth - 1, Math.max(0, (Math.max(r.left, 0) + Math.min(r.right, innerWidth)) / 2)), y = Math.min(innerHeight - 1, Math.max(0, (Math.max(r.top, 0) + Math.min(r.bottom, innerHeight)) / 2));
          const top = document.elementFromPoint(x, y);
          if (top && (el.contains(top) || top.contains(el))) return el;
        }
      } finally { root.hidden = false; }
      return null;
    }
    const dock = (want) => { // 모바일: 손패 독을 단계에 맞게 열고 닫는다
      if (!want || !matchMedia('(max-width: 899px)').matches) return;
      const open = !!document.querySelector('.dock.is-open');
      if (want === 'open' && !open) document.querySelector('.dock__handle:not(.dock__handle--close)')?.click();
      if (want === 'closed' && open) document.querySelector('.dock__handle--close')?.click();
    };
    function buttons(s) {
      const b = (label, fn, cls = '', extra = {}) => h('button', { class: `btn btn--sm ${cls}`, type: 'button', onclick: fn, ...extra }, label);
      if (s.last) return [b('정식 게임 시작 (8라운드)', () => finish('setup'), 'btn--primary'), b('표지로', () => finish('title'))];
      const act = s.kind === 'action' && !c.stuck();
      return [b('이전', () => c.prev(), '', { disabled: !c.canPrev() }),
        b(act ? '직접 해 보세요' : '다음', () => { const el = s.click && document.querySelector(s.click); c.next(); el?.click(); }, 'btn--primary', { disabled: act }),
        b(skipAsk ? '정말 건너뛰기' : '건너뛰기', () => { if (skipAsk) finish('title'); else { skipAsk = true; render(); } }, skipAsk ? 'tut__warn' : '')];
    }
    function render() {
      const s = c.cur;
      panel.replaceChildren(
        h('div', { class: 'tut__top' }, h('span', { class: 'tut__count num' }, `${pad2(s.id)} / ${pad2(STEPS.length)}`), h('span', { class: 'stamp stamp--ink' }, s.kind === 'action' ? '직접 하기' : '튜토리얼')),
        h('h3', { class: 'tut__title' }, s.title), h('p', { class: 'tut__text' }, s.text),
        s.ask ? h('p', { class: 'tut__ask' }, s.ask) : null, h('div', { class: 'tut__btns' }, ...buttons(s)));
      live.textContent = `${s.id}단계 ${s.title}. ${s.text}${s.ask ? ' ' + s.ask : ''}`;
      if (s.kind === 'info') panel.querySelector('.btn--primary')?.focus({ preventScroll: true }); else panel.focus({ preventScroll: true });
    }
    function place(r) {
      const vw = innerWidth, vh = innerHeight, m = 8, w = Math.min(panel.offsetWidth || 340, vw - 2 * m), ph = panel.offsetHeight;
      let top = (vh - ph) / 2, left = (vw - w) / 2;
      if (r) {
        left = Math.min(Math.max(r.left, m), vw - w - m);
        if (r.bottom + 12 + ph <= vh - m) top = r.bottom + 12;
        else if (r.top - 12 - ph >= m) top = r.top - 12 - ph;
        else top = (r.top + r.bottom) / 2 > vh / 2 ? m : vh - ph - m;
      }
      panel.style.cssText = `left:${Math.round(left)}px;top:${Math.round(Math.max(m, top))}px`;
    }
    function cut(r, over) { // 네 장의 덮개로 사각형 구멍을 낸다. r이 없으면 덮개 없이 패널만
      const vw = innerWidth, vh = innerHeight, P = 6;
      if (!r) { dims.forEach((d) => { d.style.cssText = 'display:none'; }); frame.style.cssText = 'display:none'; return; }
      if (over) { dims.forEach((d, i) => { d.style.cssText = i === 0 && !over ? `left:0;top:0;width:${vw}px;height:${vh}px` : 'display:none'; }); frame.style.cssText = r ? '' : 'display:none'; }
      const L = Math.max(0, r.left - P), T = Math.max(0, r.top - P), R = Math.min(vw, r.right + P), B = Math.min(vh, r.bottom + P);
      if (!over) [[0, 0, vw, T], [0, B, vw, vh - B], [0, T, L, B - T], [R, T, vw - R, B - T]].forEach(([x, y, w, hh], i) => { dims[i].style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${hh}px`; });
      frame.style.cssText = `left:${L}px;top:${T}px;width:${R - L}px;height:${B - T}px`;
      frame.classList.toggle('is-over', !!over);
    }
    function tick() {
      if (!c.alive || store.screen !== 'game') { root.hidden = true; return; }
      c.flag('placed', !!document.querySelector('.slot--full')); c.flag('region', !!document.querySelector('.rinfo'));
      if (!c.alive) return;
      const s = c.cur;
      if (!c.ready()) { root.hidden = true; return; }
      dock(s.dock);
      const el = find(s.target);
      if (!el && ++lost < 6) { root.hidden = true; return; } // 잠깐 안 보이는 것은 기다리고, 계속 못 찾으면 스포트라이트 없이 패널만 (막히지 않게)
      if (el) lost = 0;
      root.hidden = false;
      const over = !!el?.closest('.sheet-backdrop, .ovl'), k = `${s.id}|${over}|${!el}|${skipAsk}|${c.canPrev()}|${c.stuck()}`;
      if (k !== key) { key = k; render(); }
      if (!el) { if (last !== 'none') { last = 'none'; cut(null); place(null); } return; }
      tgt = el;
      const r = el.getBoundingClientRect(), sig = [r.left, r.top, r.width, r.height, innerWidth, innerHeight, panel.offsetHeight].map(Math.round).join();
      if (sig !== last) { last = sig; cut(r, over); place(r); }
    }
    const onKey = (e) => { if (!panel.contains(document.activeElement)) return; if (e.key === 'ArrowRight' && c.canNext() && !c.cur.last) { e.preventDefault(); c.next(); } else if (e.key === 'ArrowLeft') { e.preventDefault(); c.prev(); } };
    const off = c.subscribe(() => { skipAsk = false; tick(); });
    const timer = setInterval(tick, 200);
    document.addEventListener('keydown', onKey); addEventListener('resize', tick);
    tick();
    return { destroy() { clearInterval(timer); off(); document.removeEventListener('keydown', onKey); removeEventListener('resize', tick); root.remove(); } };
  }

  return {
    get active() { return !!core; },
    start: () => open(false), resume: () => open(true),
    hasProgress: () => hasProgress(storage),
    /** 화면이 바뀌면 코치를 내리고 일반 루프를 되돌린다 */
    onScreen(name) { if (core && name !== 'game') detach(); },
  };
}
