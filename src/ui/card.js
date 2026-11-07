// 카드 부품: renderCard(card, { size:'hand'|'detail'|'mini', state:'normal'|'selected'|'disabled', iso, mark }) → 요소.
// 상점(U3b)도 같은 마크업을 쓴다. 분류 띠 + 비용 도장 + 아이콘 + 본문 + 소유 문양, 모서리를 깎은 프레임 (components.css .card).
import { h, icon } from './dom.js';
import { plainText, timingTag, effectsToKorean } from './effect-text.js';

export const CAT_KO = { domestic: '내정', diplomatic: '외교', military: '군사', economy: '경제' };
const CAT_CLS = { domestic: 'domestic', diplomatic: 'diplomacy', military: 'military', economy: 'economy' };
const DECK_KO = { starter: '기본', market: '시장', faction: '고유', neutral: '중립' };
const G = 'assets/icons/kenney-game-icons/', B = 'assets/icons/kenney-board-game-icons/';
const RES_IC = { capital: G + 'coin.png', energy: B + 'fire.png', industry: B + 'resource_iron.png', prestige: G + 'star.png' };
const TYPE_IC = { base: B + 'structure_tower.png', destroyBase: B + 'skull.png', removeInfluence: B + 'token_remove.png', influence: B + 'token_add.png', defense: B + 'shield.png', treaty: B + 'hand_token.png',
  drain: B + 'pouch_remove.png', draw: B + 'cards_take.png', peek: B + 'cards_seek.png', discard: B + 'card_outline_remove.png', modifier: B + 'hourglass.png', custom: B + 'puzzle.png' };
const CAT_IC = { domestic: B + 'structure_house.png', diplomatic: B + 'flag_triangle.png', military: B + 'sword.png' };
const ORDER = ['base', 'destroyBase', 'removeInfluence', 'influence', 'defense', 'treaty', 'drain', 'gain', 'draw', 'peek', 'discard', 'conditional', 'modifier', 'custom'];

/** 카드 아이콘: 가장 비중 큰 효과의 단색 아이콘 (없으면 분류 아이콘) */
export function cardIconPath(card) {
  const fx = (card.effects || []).flatMap((e) => (e.type === 'conditional' ? [e, ...(e.then || [])] : [e]));
  const top = ORDER.map((t) => fx.find((e) => e.type === t)).find(Boolean);
  if (!top) return CAT_IC[card.category] || B + 'card.png';
  if (top.type === 'gain') return RES_IC[top.res] || B + 'card.png';
  if (top.type === 'conditional') return TYPE_IC.influence;
  return TYPE_IC[top.type] || CAT_IC[card.category];
}
export const catClass = (c) => `card--${CAT_CLS[c] || 'domestic'}`;

const tag = (t, cls = '') => h('span', { class: `ctag ${cls}` }, t);

/** 카드 한 장. size: hand(112×160 / 데스크톱 140×200) · detail(큰 카드) · mini(계획 칸·공개·선택용) */
export function renderCard(card, { size = 'hand', state = 'normal', iso = null, mark = null, count = null } = {}) {
  const text = plainText(card.text || ''), long = text.length > 24 ? (text.length > 32 ? 'xl' : 'l') : 'm';
  const own = card.faction ? h('span', { class: 'card__own' }, h('img', { src: new URL(`../../assets/ui/emblem-${card.faction}.svg`, import.meta.url).href, alt: '', width: 18, height: 18 }), h('span', { class: 'card__iso' }, iso || 'ISO')) : null;
  const name = card.name, cat = CAT_KO[card.category] || '카드';
  const aria = `${name}, ${cat}, 비용 ${card.cost ?? 0}. ${text}`;
  if (size === 'mini') {
    return h('div', { class: `card card--mini ${catClass(card.category)}`, 'data-card': card.id, 'data-state': state, title: `${name} — ${text}` },
      h('div', { class: 'card__frame' }, h('div', { class: 'card__in' }, icon(cardIconPath(card)), h('span', { class: 'card__name' }, name), mark ? h('span', { class: 'card__mark num' }, mark) : null)));
  }
  const detail = size === 'detail';
  return h('div', { class: `card card--${size} ${catClass(card.category)}`, 'data-card': card.id, 'data-state': state, 'data-len': long, role: 'img', 'aria-label': aria },
    h('div', { class: 'card__frame' }, h('div', { class: 'card__in' },
      h('div', { class: 'card__top' }, h('span', { class: 'card__cat' }, cat), own, h('span', { class: 'card__cost num', title: '시장 가격' }, String(card.cost ?? 0))),
      h('div', { class: 'card__name' }, name),
      h('div', { class: 'card__mid' }, icon(cardIconPath(card)), h('span', { class: 'card__tags' }, tag(timingTag(card)), detail || card.faction ? tag(DECK_KO[card.deck] || (card.permanent ? '성장' : '카드'), 'ctag--ink') : null, detail && card.oncePerGame ? tag('1회') : null)),
      h('p', { class: 'card__text' }, text),
      detail ? h('ul', { class: 'card__plain', 'aria-label': '쉬운 말로' }, effectsToKorean(card.effects, card).map((t) => h('li', {}, t))) : null,
      state === 'disabled' && mark ? h('span', { class: 'stamp stamp--ink card__placed' }, mark) : null,
      count > 1 ? h('span', { class: 'card__count num' }, '×' + count) : null)));
}

const EVT_TYPE = { '01': '경제', '02': '경제', '03': '경제', '04': '경제', '16': '경제', '17': '경제', '05': '위기', '06': '위기', '09': '위기', '10': '위기', '12': '위기', '13': '위기', '18': '위기', '07': '정세', '08': '정세', '14': '정세', '15': '정세', '11': '기회', '19': '기회', '20': '기회' };
export const eventType = (e) => EVT_TYPE[e.id.slice(4)] || '정세';
/** 사건 카드: 큰 카드 + '사건' 도장 + 유형 도장 */
export function renderEventCard(evt, { size = 'detail' } = {}) {
  const type = eventType(evt), danger = type === '위기';
  return h('div', { class: `card card--${size} card--event`, role: 'img', 'aria-label': `사건 카드 ${evt.name}. ${plainText(evt.text)}` },
    h('div', { class: 'card__frame' }, h('div', { class: 'card__in' },
      h('div', { class: 'card__top' }, h('span', { class: 'card__cat' }, evt.id.toUpperCase()), h('span', { class: 'stamp card__evstamp' }, '사건')),
      h('div', { class: 'card__name' }, evt.name),
      h('div', { class: 'card__mid' }, icon(B + (danger ? 'exploding.png' : type === '기회' ? 'award.png' : type === '경제' ? 'dollar.png' : 'flag_square.png')), h('span', { class: 'card__tags' }, tag(type, danger ? 'ctag--stamp' : 'ctag--ink'))),
      h('p', { class: 'card__text' }, plainText(evt.text)),
      h('ul', { class: 'card__plain', 'aria-label': '쉬운 말로' }, effectsToKorean(evt.effects, evt).map((t) => h('li', {}, t))))));
}
