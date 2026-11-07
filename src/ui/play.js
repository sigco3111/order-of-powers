// 계획 단계 화면(손패 · 계획 칸 · 확정)과 대기 선택 패널, 첫 판 안내 메모. screen-game.js가 불러 쓴다.
import { h, icon, openSheet } from './dom.js';
import { renderCard, CAT_KO } from './card.js';
import { effectsToKorean, previewChips, plainText } from './effect-text.js';
import { planSlotsOf } from '../engine/state.js';
import { josa } from '../engine/countries.js';

const NUM = ['①', '②', '③', '④', '⑤', '⑥'];
const HINT_KEY = 'oop-seen-hints';
const HINTS = [
  ['손패', '아래 줄이 이번 라운드 손패입니다. 카드를 누르면 큰 카드와 쉬운 설명이 열립니다.'],
  ['계획 칸', '카드는 ① ② ③ 순서대로 해결됩니다. ◀ ▶로 순서를 바꾸고, 칸을 누르면 손패로 돌아갑니다.'],
  ['확정', '계획 확정을 누르면 비공개로 제출되며 고칠 수 없습니다. 카드를 내지 않으려면 건너뛰기.'],
  ['지도', '영향력 칩이 가장 많은 세력이 그 지역을 주도해 매 라운드 점수를 얻습니다. 지역을 누르면 정보가 열립니다.'],
];
const DO = { influence: '에 영향력 놓기', removeInfluence: '에서 영향력 줄이기', defense: '에 방어 세우기', base: '에 기지 세우기' };
const ASK = { influence: '영향력을 놓을 지역', removeInfluence: '영향력을 줄일 지역', defense: '방어를 세울 지역', base: '기지를 세울 지역', treaty: '조약을 맺을 세력', drain: '자원을 빼앗을 세력', destroyBase: '기지를 부술 세력', discard: '손패를 버릴 대상', peek: '확인할 대상', custom: '효과의 대상' };

export function createPlay({ loop, data, view, repaint, submit, announce, C, A, E, R, F, fName, regionName }) {
  const me = () => loop.state.config.humanFaction;
  const btn = (label, fn, cls = '', extra = {}) => h('button', { class: `btn ${cls}`, type: 'button', onclick: fn, ...extra }, label);
  const seen = () => { try { return localStorage.getItem(HINT_KEY); } catch { return '1'; } };
  const setSeen = () => { try { localStorage.setItem(HINT_KEY, '1'); } catch { /* 무시 */ } };

  /** 손패가 바뀌면(새 라운드·다른 저장) 임시 계획을 비운다 */
  function sync(s) {
    const key = `${s.round}|${s.players[me()].hand.join(',')}`;
    if (view.planKey !== key) { view.planKey = key; view.plan = []; view.focus = null; view.dock = undefined; }
  }

  // ── 계획 칸 ──
  const chips = (card) => h('span', { class: 'pchips' }, previewChips(card).map((c) => h('span', { class: `pchip pchip--${c.kind}` }, c.text)));
  function slot(s, i, hand) {
    const idx = view.plan[i], n = view.plan.length;
    if (idx == null) return h('li', { class: 'slot slot--empty', 'aria-label': `${i + 1}번 칸, 비어 있음` }, h('span', { class: 'slot__no num' }, NUM[i]), h('span', { class: 'slot__ph' }, '빈 칸'));
    const card = C[hand[idx]];
    const move = (d) => { const a = view.plan; [a[i], a[i + d]] = [a[i + d], a[i]]; announce(`${card.name}을 ${i + d + 1}번 칸으로 옮겼습니다`); repaint(); };
    return h('li', { class: 'slot slot--full' },
      h('button', { class: 'slot__main', type: 'button', 'aria-label': `${i + 1}번 칸 ${card.name}. 누르면 손패로 되돌립니다`, onclick: () => { view.plan.splice(i, 1); announce(`${card.name}을 손패로 되돌렸습니다`); repaint(); } },
        h('span', { class: 'slot__no num' }, NUM[i]), renderCard(card, { size: 'mini' })),
      chips(card),
      h('div', { class: 'slot__ord' }, h('button', { class: 'ord', type: 'button', 'aria-label': `${card.name} 앞으로`, disabled: i === 0, onclick: () => move(-1) }, '◀'),
        h('button', { class: 'ord', type: 'button', 'aria-label': `${card.name} 뒤로`, disabled: i >= n - 1, onclick: () => move(1) }, '▶')));
  }

  // ── 카드 상세 시트 ──
  function detail(idx) {
    const s = loop.state, p = s.players[me()], card = C[p.hand[idx]], slots = planSlotsOf(s, me()), at = view.plan.indexOf(idx);
    view.focus = idx; repaint();
    let close;
    const body = h('div', { class: 'detail' }, renderCard(card, { size: 'detail', iso: p.iso }),
      h('div', { class: 'detail__btns' },
        at >= 0 ? btn('계획에서 빼기', () => { view.plan.splice(at, 1); announce(`${card.name}을 손패로 되돌렸습니다`); close(); repaint(); }, 'btn--primary')
          : btn(view.plan.length >= slots ? '계획 칸이 가득 참' : '계획에 넣기', () => { view.plan.push(idx); view.focus = null; announce(`${card.name}을 ${view.plan.length}번 칸에 넣었습니다`); close(); repaint(); }, 'btn--primary', { disabled: view.plan.length >= slots }),
        btn('닫기', () => close())));
    close = openSheet(card.name, body);
  }

  function useAsset() {
    const s = loop.state, p = s.players[me()], a = A[p.strategicAsset];
    let close;
    const body = h('div', { class: 'detail' }, h('p', { class: 'label' }, `전략 자산 · ${CAT_KO[a.category === 'diplomatic' ? 'diplomatic' : a.category] ?? ''} · 게임당 1회`), h('h3', {}, a.name), h('p', {}, plainText(a.text)),
      h('ul', { class: 'card__plain', style: 'margin:0 0 var(--s4)' }, effectsToKorean(a.effects, a).map((t) => h('li', {}, t))),
      h('div', { class: 'detail__btns' }, btn('지금 사용', () => { close(); const r = submit({ type: 'USE_ASSET', faction: me() }); if (!r.ok) announce(r.reason); else announce(`전략 자산 ${a.name}을 사용했습니다`); }, 'btn--primary'), btn('닫기', () => close())));
    close = openSheet('전략 자산 사용', body);
  }

  function skip() {
    let close;
    close = openSheet('이번 라운드를 건너뛸까요?', h('div', { class: 'detail' }, h('p', {}, '카드를 한 장도 내지 않습니다. 손패는 그대로 남고 계획 단계가 끝납니다.'),
      h('div', { class: 'detail__btns' }, btn('건너뛰기 확정', () => { close(); view.plan = []; const r = submit({ type: 'SKIP_PLAN', faction: me() }); if (!r.ok) announce(r.reason); else announce('이번 라운드 계획을 건너뛰었습니다'); }, 'btn--primary'), btn('취소', () => close()))));
  }

  function confirmPlan(hand) {
    const cards = view.plan.map((i) => hand[i]);
    const r = submit({ type: 'PLAN', faction: me(), cards });
    if (!r.ok) return announce(r.reason);
    view.plan = []; view.stamped = true;
    announce(`계획을 제출했습니다: ${cards.map((c) => C[c].name).join(', ')}`);
  }

  // ── 첫 판 안내 메모 ──
  function note() {
    if (view.hint == null || seen()) return null;
    const i = view.hint, [t, body] = HINTS[i], done = () => { view.hint = null; setSeen(); document.querySelector('.map')?.classList.remove('hint-target'); repaint(); };
    document.querySelector('.map')?.classList.toggle('hint-target', i === 3);
    return h('aside', { class: 'note', 'aria-label': '안내 메모' },
      h('p', { class: 'label' }, `메모 ${i + 1}/${HINTS.length} · ${t}`), h('p', { class: 'note__t' }, body),
      h('div', { class: 'note__btns' }, i < HINTS.length - 1 ? btn('다음 메모', () => { view.hint = i + 1; repaint(); }, 'btn--sm') : btn('알겠습니다', done, 'btn--sm'), btn('모두 닫기', done, 'btn--sm')));
  }

  /** 계획 단계 트레이 → 요소 배열 */
  function tray(s) {
    sync(s);
    if (view.hint === undefined) view.hint = s.round === 1 && !seen() ? 0 : null;
    const f = me(), p = s.players[f], hand = p.hand, slots = planSlotsOf(s, f), placed = view.plan, a = p.strategicAsset && A[p.strategicAsset];
    const hi = view.hint;
    const cardEls = hand.map((id, i) => {
      const at = placed.indexOf(i), card = C[id];
      return h('button', { class: 'hand__c', type: 'button', role: 'listitem', 'aria-label': `${card.name}${at >= 0 ? `, ${at + 1}번 칸에 넣음` : ''}. 눌러서 자세히 보기`, 'aria-haspopup': 'dialog', onclick: () => detail(i) },
        renderCard(card, { size: 'hand', iso: p.iso, state: at >= 0 ? 'disabled' : view.focus === i ? 'selected' : 'normal', mark: at >= 0 ? `계획 ${NUM[at]}` : null }));
    });
    // 모바일 독: 접힌 상태는 64px 띠(계획 칸 3개 + 확정 + 손패 손잡이), 펼치면 지도 위로 시트가 올라온다. 데스크톱은 늘 펼친 트레이.
    const open = view.dock ?? hi != null, setDock = (v) => () => { view.dock = v; repaint(); };
    const strip = h('div', { class: 'dock__strip' },
      h('ol', { class: 'dock__slots', 'aria-label': '계획 칸' }, Array.from({ length: slots }, (_, i) => { const at = placed[i];
        return h('li', {}, h('button', { class: `dockslot${at != null ? ' is-full' : ''}`, type: 'button', 'aria-label': at != null ? `${i + 1}번 칸 ${C[hand[at]].name}. 손패 열기` : `${i + 1}번 칸 비어 있음. 손패 열기`, onclick: setDock(true) },
          h('span', { class: 'num' }, NUM[i]), at != null ? h('span', { class: 'dockslot__n' }, C[hand[at]].name) : null)); })),
      btn(placed.length ? `계획 확정 ${placed.length}` : '계획 확정', () => confirmPlan(hand), 'btn--primary dock__go', { disabled: !placed.length, 'aria-label': placed.length ? `계획 확정 (${placed.length}장)` : '카드를 넣은 뒤 계획 확정' }),
      h('button', { class: 'dock__handle', type: 'button', 'aria-expanded': 'false', 'aria-label': `손패 ${hand.length}장 펼치기`, onclick: setDock(true) }, h('span', { class: 'dock__car', 'aria-hidden': 'true' }), h('span', { class: 'num' }, `손패 ${hand.length}`)));
    const sheet = h('div', { class: 'dock__sheet' },
      h('button', { class: 'dock__handle dock__handle--close', type: 'button', 'aria-expanded': 'true', onclick: setDock(false) }, h('span', { class: 'dock__car dock__car--dn', 'aria-hidden': 'true' }), '손패 접기'),
      note(),
      h('div', { class: 'tray__head' }, h('p', { class: 'tray__t' }, h('strong', {}, '계획 단계'), ' ', h('span', { class: 'num' }, `손패 ${hand.length} · 칸 ${slots}`)),
        a ? btn(p.usedAsset ? `자산 사용함` : `자산 ${a.name}`, useAsset, 'btn--sm tray__asset', { disabled: p.usedAsset, 'aria-label': p.usedAsset ? `전략 자산 ${a.name} 사용함` : `전략 자산 ${a.name} 사용하기` }) : null),
      h('ol', { class: `slots${hi === 1 ? ' hint-target' : ''}`, 'aria-label': '계획 칸. 위에서부터 해결 순서', style: `--slots:${slots}` }, Array.from({ length: slots }, (_, i) => slot(s, i, hand))),
      h('div', { class: `hand${hi === 0 ? ' hint-target' : ''}`, role: 'list', 'aria-label': '손패' }, cardEls),
      h('div', { class: `tray__bar${hi === 2 ? ' hint-target' : ''}` }, btn('건너뛰기', skip), btn(placed.length ? `계획 확정 (${placed.length}장)` : '카드를 넣으십시오', () => confirmPlan(hand), 'btn--primary', { disabled: !placed.length })));
    return [h('div', { class: `dock${open ? ' is-open' : ''}` }, strip, sheet)];
  }

  // ── 대기 선택 ──
  const optLabel = (pc, c) => (typeof c === 'boolean' ? (c ? '예' : '아니오') : Array.isArray(c) ? c.map(regionName).join(' + ') : pc.kind === 'region' ? regionName(c) : pc.kind === 'faction' ? fName(c) : C[c]?.name ?? String(c));
  const sentence = (pc, c) => {
    const t = pc.effect?.type, n = optLabel(pc, c);
    if (pc.kind === 'region' || pc.kind === 'regionPair') return `${n}${DO[t] ?? (pc.kind === 'regionPair' ? '에 영향력 놓기' : ' 선택')}`;
    if (pc.kind === 'faction') return { treaty: `${n}와(과) 조약 맺기`, drain: `${n}에게서 빼앗기`, destroyBase: `${n}의 기지 부수기`, removeInfluence: `${n}의 영향력 줄이기`, discard: `${n}의 손패 버리기` }[t] ?? `${n} 선택`;
    return `${n} ${t === 'discard' ? '버리기' : '선택'}`;
  };
  const source = (pc) => {
    const x = pc.ctx || {};
    if (x.cardId && C[x.cardId]) return { card: C[x.cardId], name: C[x.cardId].name, text: C[x.cardId].text, label: fName(pc.actor ?? pc.faction) };
    if (x.eventId && E[x.eventId]) return { name: E[x.eventId].name, text: E[x.eventId].text, label: '사건' };
    const a = A[loop.state.players[pc.actor ?? pc.faction]?.strategicAsset];
    return a ? { name: a.name, text: a.text, label: '전략 자산' } : { name: '효과', text: '', label: '' };
  };
  /** 지도에서 강조할 후보 지역 */
  const candidates = (s) => { const pc = s.pending?.[0]; return pc && s.pending[0].faction === me() && (pc.kind === 'region' || pc.kind === 'regionPair') ? pc.options : []; };
  /** 지도/목록에서 지역을 눌렀을 때. 처리했으면 true */
  function pickRegion(id) {
    const pc = loop.state.pending?.[0];
    if (!pc || pc.faction !== me() || !pc.options.includes(id) || (pc.kind !== 'region' && pc.kind !== 'regionPair')) return false;
    if (pc.kind === 'region') view.choice = id;
    else { const a = Array.isArray(view.choice) ? view.choice.slice() : []; const k = a.indexOf(id); if (k >= 0) a.splice(k, 1); else { if (a.length >= 2) a.shift(); a.push(id); } view.choice = a; }
    repaint(); return true;
  }
  function choice(s) {
    const pc = s.pending[0];
    if (view.choiceFor !== pc.id) { view.choiceFor = pc.id; view.choice = null; }
    const src = source(pc), c = view.choice, ready = pc.kind === 'regionPair' ? Array.isArray(c) && c.length === 2 : c != null;
    const go = (v) => { const r = submit({ type: 'CHOOSE', faction: me(), pendingId: pc.id, choice: v }); if (!r.ok) announce(r.reason); else { view.choice = null; announce('선택을 확정했습니다'); } };
    const ask = ASK[pc.effect?.type] ?? { region: '지역', regionPair: '지역 두 곳', faction: '세력', card: '카드', confirm: '확인' }[pc.kind];
    let list;
    if (pc.kind === 'region' || pc.kind === 'regionPair') {
      list = h('div', { class: 'copts copts--row', role: 'group', 'aria-label': '선택할 수 있는 지역' }, pc.options.map((id) => { const on = pc.kind === 'region' ? c === id : c?.includes?.(id); return h('button', { class: 'opt', type: 'button', 'aria-pressed': String(!!on), onclick: () => pickRegion(id) }, regionName(id)); }));
    } else if (pc.kind === 'faction') {
      const rid = pc.ctx?.region;
      list = h('div', { class: 'copts', role: 'group', 'aria-label': '선택할 수 있는 세력' }, pc.options.map((f) => h('button', { class: 'opt opt--f', type: 'button', 'aria-pressed': String(c === f), onclick: () => { view.choice = f; repaint(); } },
        h('img', { src: new URL(`../../assets/ui/emblem-${f}.svg`, import.meta.url).href, alt: '', width: 28, height: 28 }), h('b', {}, fName(f)),
        h('span', { class: 'num' }, rid ? `${regionName(rid)} 영향력 ${s.regions[rid].influence[f]}` : `위신 ${s.players[f].prestige}`))));
    } else if (pc.kind === 'card') {
      list = h('div', { class: 'copts copts--row', role: 'group', 'aria-label': '선택할 수 있는 카드' }, pc.options.map((id) => h('button', { class: 'opt opt--c', type: 'button', 'aria-pressed': String(c === id), 'aria-label': C[id]?.name, onclick: () => { view.choice = id; repaint(); } }, renderCard(C[id], { size: 'mini', state: c === id ? 'selected' : 'normal' }))));
    } else {
      const cond = pc.effect?.if?.payOptional, thenTxt = effectsToKorean(pc.effect?.then || [], null).join(', ');
      return [h('div', { class: 'chead' }, h('p', { class: 'label' }, '선택 필요 · 확인'), h('p', { class: 'cq' }, cond ? `${{ capital: '자본', energy: '에너지', industry: '산업' }[cond.res]} ${cond.amount}을 내고 효과를 얻으시겠습니까?` : '진행하시겠습니까?'), thenTxt ? h('p', { class: 'cdesc' }, `얻는 효과: ${thenTxt}`) : null), h('div', { class: 'cyn' }, btn('예', () => go(true), 'btn--primary stampbtn'), btn('아니오', () => go(false), 'stampbtn'))];
    }
    return [
      h('div', { class: 'chead' }, h('p', { class: 'label' }, `선택 필요 · ${src.label}`),
        h('div', { class: 'csrc' }, src.card ? renderCard(src.card, { size: 'mini' }) : null, h('div', {}, h('b', {}, src.name), h('p', { class: 'cdesc' }, plainText(src.text)))),
        h('p', { class: 'cq' }, `${josa(ask, '을', '를')} 고르십시오${pc.kind === 'regionPair' ? ' (서로 다른 두 곳)' : ''}. ${pc.kind.startsWith('region') ? '지도의 점선 지역을 눌러도 됩니다.' : ''}`)),
      list,
      h('div', { class: 'cbar' }, h('p', { class: 'cbar__t', 'aria-live': 'polite' }, ready ? sentence(pc, c) : '아직 고르지 않았습니다'), h('div', { class: 'cbar__b' }, btn('확정', () => go(c), 'btn--primary', { disabled: !ready }), btn('취소', () => { view.choice = null; repaint(); }, '', { disabled: c == null }))),
    ];
  }
  return { tray, choice, candidates, pickRegion, detail };
}
