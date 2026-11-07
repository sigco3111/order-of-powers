// 연출기: 엔진이 한 번에 끝낸 사건·공개·해결·정비를 한 장씩 보여준다. loop.present에 꽂아 쓴다.
// 순서: 사건 카드 → 계획 공개(순서 도장) → 카드 한 장씩 해결(지도 깜빡임·토큰 도장) → 정비 요약. 상태는 이미 끝나 있고 화면만 이전 모습에서 따라간다.
import { h, icon } from './dom.js';
import { renderCard, renderEventCard } from './card.js';
import { stepsOf, revealOf, summaryOf } from './timeline.js';
import { plainText } from './effect-text.js';

const ORD = ['1st', '2nd', '3rd', '4th'];
const RES = { capital: 'assets/icons/kenney-game-icons/coin.png', energy: 'assets/icons/kenney-board-game-icons/fire.png', industry: 'assets/icons/kenney-board-game-icons/resource_iron.png', prestige: 'assets/icons/kenney-game-icons/star.png' };
const RES_KO = { capital: '자본', energy: '에너지', industry: '산업', prestige: '위신' };

export function createPresenter({ loop, data, C, E, fName, regionName, isFast, onChange }) {
  const P = { active: false, display: null, fx: null, step: null, skipping: false, dead: false, tail: Promise.resolve(), modal: null };
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'reduce';
  const stepMs = () => (isFast() || reduced() ? 350 : 700);
  let wake = null;
  const wait = (ms) => new Promise((res) => { const t = setTimeout(done, ms); function done() { clearTimeout(t); wake = null; res(); } wake = done; });
  const emblem = (f) => h('img', { class: 'pe', src: new URL(`../../assets/ui/emblem-${f}.svg`, import.meta.url).href, alt: '', width: 28, height: 28 });
  const me = () => loop.state?.config.humanFaction;

  /** 모달 상자 하나를 띄우고 버튼 중 하나가 눌리거나 auto(ms)가 지나면 닫는다 */
  function dialog({ title, stamp, body, buttons, auto = 0, cls = '' }) {
    return new Promise((resolve) => {
      if (P.dead) return resolve();
      const from = document.activeElement;
      let timer = 0;
      const end = (v) => { clearTimeout(timer); box.remove(); P.modal = null; from?.focus?.(); resolve(v); };
      const btns = buttons.map((b, i) => h('button', { class: `btn ${b.primary ? 'btn--primary' : ''}`, type: 'button', onclick: () => { b.fn?.(); end(i); } }, b.label));
      const box = h('div', { class: `ovl ${cls}` }, h('section', { class: 'ovl__box', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
        h('div', { class: 'ovl__head' }, h('h2', {}, title), stamp ? h('span', { class: 'stamp stamp--press stamp--ink' }, stamp) : null), h('div', { class: 'ovl__body' }, body), h('div', { class: 'ovl__btns' }, btns)));
      document.body.append(box); P.modal = { end };
      (btns.find((b) => b.classList.contains('btn--primary')) || btns[0]).focus();
      if (auto) timer = setTimeout(() => end(-1), auto);
    });
  }

  async function eventCard(id) {
    const e = E[id]; if (!e || P.dead) return;
    await dialog({ title: '이번 라운드 사건', stamp: '사건', cls: 'ovl--event', body: h('div', { class: 'ovl__card', onclick: () => P.modal?.end(0) }, renderEventCard(e)), buttons: [{ label: '확인 — 계획으로', primary: true }], auto: isFast() ? 1200 : 0 });
  }

  async function reveal(rows) {
    if (P.skipping || !rows.length) return;
    const body = h('ol', { class: 'rev' }, rows.map((r) => h('li', { class: `rev__row${r.faction === me() ? ' is-you' : ''}` },
      h('span', { class: 'stamp stamp--ink rev__ord' }, ORD[r.rank - 1]), h('div', { class: 'rev__who' }, emblem(r.faction), h('b', {}, fName(r.faction)), r.faction === me() ? h('span', { class: 'tag' }, '당신') : null),
      h('div', { class: 'rev__cards' }, r.cards.length ? r.cards.map((c) => renderCard(C[c], { size: 'mini', mark: '' })) : h('span', { class: 'rev__none' }, '계획 없음')))));
    await dialog({ title: '계획 공개', stamp: '해결 순서', cls: 'ovl--reveal', body, buttons: [{ label: '해결 시작', primary: true }, { label: '연출 건너뛰기', fn: () => { P.skipping = true; } }], auto: isFast() ? 1500 : 9000 });
  }

  async function summary(rows, batch) {
    const last = batch.after.phase === 'end';
    const head = h('tr', {}, ['국가', '이번 점수', '수입', '누계'].map((t) => h('th', {}, t)));
    const body = h('div', { class: 'sum' }, h('table', {}, h('thead', {}, head), h('tbody', {}, rows.map((r) => h('tr', { class: r.faction === me() ? 'is-you' : '' },
      h('td', {}, emblem(r.faction), h('span', {}, fName(r.faction))), h('td', { class: 'num' }, (r.delta >= 0 ? '+' : '−') + Math.abs(r.delta)),
      h('td', { class: 'sum__inc' }, Object.entries(r.income).filter(([, n]) => n).map(([k, n]) => h('span', { class: 'sum__i num', title: RES_KO[k] }, icon(RES[k]), (n > 0 ? '+' : '−') + Math.abs(n))), Object.values(r.income).every((n) => !n) ? '—' : null),
      h('td', { class: 'num sum__tot' }, String(r.total)))))));
    await dialog({ title: `${batch.before.round}라운드 정비 요약`, stamp: '정산', cls: 'ovl--sum', body, buttons: [{ label: last ? '최종 결과 보기' : '다음 — 상점으로', primary: true }], auto: isFast() ? 1400 : 0 });
  }

  async function runSteps(batch, steps) {
    const after = batch.after;
    P.display = { ...batch.before, phase: 'resolve', log: after.log }; onChange();
    for (const [i, st] of steps.entries()) {
      if (P.skipping || P.dead) break;
      const players = Object.fromEntries(Object.entries(after.players).map(([f, p]) => [f, { ...p, ...st.snap.players[f] }]));
      P.display = { ...after, round: batch.before.round, phase: 'resolve', regions: st.snap.regions, players, pending: [] };
      P.step = { ...st, i, n: steps.length }; P.fx = st.fx; onChange();
      await wait(stepMs());
    }
    P.step = null; P.fx = null; P.display = null; onChange();
  }

  async function run(batch) {
    P.active = true; P.skipping = false; onChange();
    try {
      const evs = batch.events, steps = stepsOf(batch, { regionName }), isMove = (e) => e.type === 'play' || e.type === 'choose' || e.type === 'deferred';
      let stepped = false;
      for (const ev of evs) {
        if (P.dead) break;
        if (ev.type === 'event') await eventCard(ev.id);
        else if ((ev.type === 'order' || isMove(ev)) && !stepped) {
          stepped = true;
          if (ev.type === 'order') await reveal(revealOf(evs));
          if (steps.length && !P.skipping) await runSteps(batch, steps);
        }
      }
      const sum = summaryOf(batch);
      if (sum && !P.dead) await summary(sum, batch);
    } catch (e) { console.error(e); }
    finally { P.active = false; P.display = null; P.step = null; P.fx = null; P.skipping = false; onChange(); }
  }

  Object.assign(P, {
    enqueue(batch) { return (P.tail = P.tail.then(() => run(batch))); },
    skip() { P.skipping = true; wake?.(); P.modal?.end(-1); },
    destroy() { P.dead = true; P.modal?.end(); wake?.(); P.display = null; },
    /** '현재 행동' 띠: 미니 카드 + 한국어 설명 + 결과 문장 */
    strip() {
      const st = P.step;
      if (!st) return h('p', { class: 'strip__idle' }, '연출 중입니다…');
      const card = st.cardId ? C[st.cardId] : null, evt = st.eventId ? E[st.eventId] : null;
      const who = st.faction ?? loop.state.pending?.[0]?.faction;
      return h('div', { class: 'strip', 'aria-label': '현재 행동' },
        h('div', { class: 'strip__head' }, h('span', { class: 'label' }, `현재 행동 · ${st.i + 1}/${st.n}`), h('button', { class: 'btn btn--sm', type: 'button', onclick: () => P.skip() }, '연출 건너뛰기')),
        h('div', { class: 'strip__body' }, card ? h('div', { class: 'strip__card is-stamped' }, renderCard(card, { size: 'mini' })) : null,
          h('div', { class: 'strip__txt' }, h('p', { class: 'strip__who' }, evt ? `사건 · ${evt.name}` : `${st.faction ? fName(st.faction) : ''} · ${card?.name ?? ''}`),
            h('p', { class: 'strip__desc' }, plainText((card ?? evt)?.text ?? '')),
            h('ul', { class: 'strip__out' }, st.lines.slice(0, 4).map((l) => h('li', {}, l))))));
    },
  });
  loop.present = (b) => P.enqueue(b);
  return P;
}
