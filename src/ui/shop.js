// 상점 단계 화면: 인쇄된 카드 + 가격 도장 → 상세 시트 → 구매. 모바일은 전체 높이 시트, 데스크톱은 오른쪽 패널 (shop.css)
import { h, icon, openSheet } from './dom.js';
import { renderCard } from './card.js';
import { sfx } from './audio.js';
import { josa } from '../engine/countries.js';
import { shopView, deckSummary, rivalBuys, KIND_LABEL } from './shop-model.js';

const COIN = 'assets/icons/kenney-game-icons/coin.png';

export function createShop({ loop, data, view, repaint, submit, announce, fName }) {
  const me = () => loop.state.config.humanFaction;
  const btn = (label, fn, cls = '', extra = {}) => h('button', { class: `btn ${cls}`, type: 'button', onclick: fn, ...extra }, label);
  const priced = (it) => ({ ...it.card, cost: it.cost }); // 카드 모서리 가격표에는 지금 값을 보인다

  /** 가격 줄: 원가 취소선 → 현재가, 못 사면 취소선 + 사유 */
  function price(it) {
    return h('div', { class: `sp${it.afford ? '' : ' is-no'}` },
      h('span', { class: 'sp__v' }, icon(COIN),
        it.delta ? h('s', { class: 'sp__was num', 'aria-label': `원래 가격 ${it.base}` }, String(it.base)) : null,
        h('b', { class: `num${it.afford ? '' : ' sp__cut'}` }, String(it.cost))),
      it.note ? h('span', { class: 'sp__note' }, it.note) : null,
      it.reason ? h('span', { class: 'sp__why' }, it.reason) : null);
  }

  /** 카드 상세 + 구매 */
  function detail(id) {
    const s = loop.state, it = [...(v => [...v.market, ...v.first, ...v.growth])(shopView(s, data, me()))].find((x) => x.id === id);
    if (!it) return;
    let close; const f = me();
    const buy = () => {
      const r = submit({ type: 'BUY', faction: f, cardId: id });
      if (!r.ok) return announce(r.reason);
      sfx('coin');
      announce(`${josa(it.card.name, '을', '를')} 구매했습니다. 자본 ${loop.state.players[f].resources.capital}`);
      body.replaceChildren(h('div', { class: 'detail' }, renderCard(priced(it), { size: 'detail', iso: loop.state.players[f].iso }),
        h('div', { class: 'sbought' }, h('span', { class: 'stamp stamp--press stamp--brass' }, '구매 완료'),
          h('p', { class: 'num' }, `남은 자본 ${loop.state.players[f].resources.capital}`))));
      setTimeout(() => close?.(), 650);
    };
    const body = h('div', {}, h('div', { class: 'detail' }, renderCard(priced(it), { size: 'detail', iso: s.players[f].iso, state: it.afford ? 'normal' : 'normal' }),
      h('div', { class: 'sdet__price' }, price(it)),
      h('div', { class: 'detail__btns' },
        btn(it.afford ? `구매 · 자본 −${it.cost}` : it.reason, buy, 'btn--primary', { disabled: !it.afford }), btn('닫기', () => close()))));
    close = openSheet(`${it.card.name} · ${KIND_LABEL[it.kind]}`, body);
  }

  function dossier() {
    const d = deckSummary(loop.state, data, me());
    openSheet('내 나라 자료', h('div', { class: 'dos' },
      h('div', { class: 'leader' }, h('span', {}, '가진 카드'), h('i'), h('b', {}, `${d.total}장`)),
      h('div', { class: 'leader' }, h('span', {}, '덱 · 손패 · 버린 더미'), h('i'), h('b', {}, `${d.deck} · ${d.hand} · ${d.discard}`)),
      ...d.groups.map((g) => h('section', { class: 'dos__g' }, h('h3', {}, g.label, h('span', { class: 'num' }, `${g.count}장`)),
        h('ul', {}, g.items.map((x) => h('li', { class: 'leader' }, h('span', {}, x.name), h('i'), h('b', {}, `×${x.n}`)))))),
      h('section', { class: 'dos__g' }, h('h3', {}, '성장 카드', h('span', { class: 'num' }, `${d.growth.length}장`)),
        d.growth.length ? h('p', { class: 'stags' }, d.growth.map((n) => h('span', { class: 'stamp stamp--ink' }, n))) : h('p', { class: 'ph' }, '아직 없습니다.'))));
  }

  const item = (it, fresh) => h('button', { class: `sitem${it.afford ? '' : ' is-no'}${fresh ? ' is-new' : ''}`, type: 'button', 'data-id': it.id, 'data-kind': it.kind,
    'aria-label': `${it.card.name}, 가격 ${it.cost}${it.delta ? `, 원가 ${it.base}` : ''}. ${it.reason ?? '살 수 있음'}. 눌러서 자세히 보기`, 'aria-haspopup': 'dialog', onclick: () => detail(it.id) },
  renderCard(priced(it), { size: 'hand', iso: loop.state.players[me()].iso, state: it.afford ? 'normal' : 'disabled' }), price(it));

  /** 상점 패널 → 요소 하나 (act 영역에 들어간다) */
  function panel(s) {
    const f = me(), v = shopView(s, data, f), d = deckSummary(s, data, f);
    if (view.shopRound !== s.round) { view.shopRound = s.round; view.shopSeen = null; }
    const seen = view.shopSeen, ids = v.market.map((x) => x.id);
    view.shopSeen = ids;
    const prevBody = document.querySelector('.shop__body'), top = prevBody ? prevBody.scrollTop : 0;
    const grid = (list, title, note, fresh = false) => list.length ? h('section', { class: 'shop__sec' }, h('div', { class: 'shop__sech' }, h('h3', {}, title), h('span', { class: 'label' }, note)),
      h('div', { class: 'sgrid' }, list.map((it) => item(it, fresh && seen && !seen.includes(it.id))))) : null;
    const rivals = rivalBuys(s, f, fName), last = loop.feed.filter((e) => e.round === s.round && e.phase === 'shop' && e.faction !== f && /구매/.test(e.text));
    const body = h('div', { class: 'shop__body' },
      h('div', { class: 'shop__deck' },
        h('p', { class: 'num shop__stat' }, `덱 ${d.deck}장 · 버린 더미 ${d.discard}`),
        btn('내 나라 자료', dossier, 'btn--sm'),
        h('div', { class: 'stags', 'aria-label': '성장 카드' }, d.growth.length ? d.growth.map((n) => h('span', { class: 'stamp stamp--ink' }, n)) : h('span', { class: 'label' }, '성장 카드 없음'))),
      grid(v.market, '시장', `공개 ${v.market.length}장`, true),
      grid(v.first, '첫 구매 · 우리 나라 고유', '이 나라만 살 수 있음'),
      grid(v.growth, '성장 카드', '나라당 1회 · 덱에 넣지 않고 바로 적용'),
      h('section', { class: 'shop__sec' }, h('div', { class: 'shop__sech' }, h('h3', {}, '상대의 구매'), h('span', { class: 'label' }, `${s.round}라운드`)),
        rivals.length ? h('ul', { class: 'shop__log' }, (last.length ? last.map((e) => ({ text: e.text })) : rivals).map((e) => h('li', {}, e.text))) : h('p', { class: 'ph' }, '이번 라운드에는 구매가 없었습니다.')));
    queueMicrotask(() => { body.scrollTop = top; });
    return h('div', { class: 'shop', role: 'region', 'aria-label': '상점' },
      h('header', { class: 'shop__head' }, h('h2', {}, '상점'), h('span', { class: 'shop__cap' }, h('span', { class: 'label' }, '보유 자본'), icon(COIN), h('b', { class: 'num', 'aria-live': 'polite' }, String(v.capital)))),
      body,
      h('footer', { class: 'shop__foot' }, btn('상점 마치기', () => { const r = submit({ type: 'END_SHOP', faction: f }); if (!r.ok) announce(r.reason); }, 'btn--primary btn--block')));
  }
  return { panel };
}
