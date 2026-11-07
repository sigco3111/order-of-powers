import { h, icon, openSheet } from './dom.js';
import { createMap } from './map.js';
import { legalActions } from '../engine/index.js';
import { regionLeaders } from '../engine/score.js';
import { aiMeta } from '../ai/ai.js';

const PHASE = { setup: '준비', event: '사건', plan: '계획', reveal: '공개', resolve: '해결', upkeep: '정산', shop: '상점', end: '종료' };
const RIBBON = ['event', 'plan', 'reveal', 'resolve', 'upkeep', 'shop'];
const PAD = (n) => String(n).padStart(2, '0');
const IC = { capital: 'assets/icons/kenney-game-icons/coin.png', energy: 'assets/icons/kenney-board-game-icons/fire.png', industry: 'assets/icons/kenney-board-game-icons/resource_iron.png', prestige: 'assets/icons/kenney-game-icons/star.png' };
const RES_KO = { capital: '자본', energy: '에너지', industry: '산업', prestige: '위신' };
const CAT_KO = { domestic: '내정', diplomatic: '외교', military: '군사' };
const EVT_TYPE = { '01': '경제', '02': '경제', '03': '경제', '04': '경제', '16': '경제', '17': '경제', '05': '위기', '06': '위기', '09': '위기', '10': '위기', '12': '위기', '13': '위기', '18': '위기', '07': '정세', '08': '정세', '14': '정세', '15': '정세', '11': '기회', '19': '기회', '20': '기회' };
const PROMPT = { influence: '영향력을 놓을 곳', removeInfluence: '영향력을 줄일 곳', defense: '방어를 세울 곳', base: '기지를 세울 곳', treaty: '조약을 맺을 세력' };
/** 엔진 문구의 이모지를 글자로 바꾼다 (UI에는 이모지를 쓰지 않는다) */
export const plain = (t = '') => t.replace(/\u{1F4B0}/gu, '자본').replace(/\u{1F6E2}\uFE0F?/gu, '에너지').replace(/\u{1F3ED}/gu, '산업').replace(/\u2B50\uFE0F?/gu, '위신').replace(/[\u{1F300}-\u{1FAFF}\uFE0F]/gu, '');
const by = (a) => Object.fromEntries(a.map((x) => [x.id, x]));

export function gameScreen({ store, show }) {
  const loop = store.loop, data = store.data, F = by(data.factions), R = by(data.regions), C = { ...by(data.cards), ...by(data.growth) }, A = by(data.assets), E = by(data.events);
  const me = () => loop.state.config.humanFaction;
  const view = { sel: null, tab: 'f', pick: null, fast: false };
  const root = h('div', { class: 'board' });
  const mapHost = h('div', { class: 'map-host' });
  let map = null, raf = 0;

  const head = h('header', { class: 'bhead' }), rail = h('aside', { class: 'brail', 'aria-label': '세력과 지역 정보' }), act = h('section', { class: 'act', 'aria-label': '지금 할 일', 'aria-live': 'polite' });
  const bodyEl = h('div', { class: 'pbody-host' });
  root.append(head, bodyEl, mapHost, rail, act);

  const fName = (f) => F[f]?.name ?? f, fShort = (f) => fName(f).split(' ')[0];
  const run = (o = {}) => loop.run({ pace: view.fast ? 350 : 0, auto: view.fast, ...o });
  const dispatch = (a) => { const r = loop.dispatch(a); if (!r.ok) console.warn(r.reason); else run(); return r; };

  // ── 머리띠: 라운드, 단계 도장, 이벤트 카드 ──
  function paintHead(s) {
    const e = E[s.currentEvent], type = e ? EVT_TYPE[e.id.slice(4)] || '정세' : null, i = RIBBON.indexOf(s.phase);
    head.replaceChildren(
      h('div', { class: 'bhead__round' }, h('div', {}, h('p', { class: 'label', style: 'margin:0' }, '라운드'), h('span', { class: 'numeral', 'aria-label': `${s.round}라운드, 전체 ${s.config.rounds}` }, PAD(s.round))), h('small', { 'aria-hidden': 'true' }, '/' + PAD(s.config.rounds))),
      h('div', { class: 'bhead__phase' }, h('span', { class: 'label' }, '현재 단계'),
        h('span', { class: 'stamp stamp--press stamp--ink' }, PHASE[s.phase]),
        h('ol', { class: 'ribbon', 'aria-hidden': 'true' }, RIBBON.map((p, j) => h('li', { 'aria-current': j === i ? 'step' : null }, PHASE[p])))),
      e ? h('div', { class: 'evt', style: `border-left-color:var(--${type === '위기' ? 'stamp' : 'brass'})` }, h('span', { class: 'label' }, `이벤트 카드 · ${e.id.toUpperCase()}`), h('div', { class: 'evt__name' }, e.name),
        h('p', { class: 'evt__text' }, plain(e.text)), h('span', { class: `stamp ${type === '위기' ? '' : type === '기회' ? 'stamp--brass' : 'stamp--ink'}` }, type))
        : h('div', { class: 'evt evt--empty' }, h('span', { class: 'label' }, '이벤트 카드'), h('div', { class: 'evt__text' }, s.phase === 'end' ? '게임이 끝났습니다.' : '라운드가 시작되면 사건이 공개됩니다.')));
  }

  // ── 레일: 세력 / 지역 / 기록 ──
  const pairStamp = (p) => h('span', { class: 'pair', title: `${fName(p)}와 조약` }, (() => { const d = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); d.setAttribute('viewBox', '0 0 17 11'); d.setAttribute('aria-hidden', 'true'); d.innerHTML = '<circle cx="5.5" cy="5.5" r="4" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="11.5" cy="5.5" r="4" fill="none" stroke="currentColor" stroke-width="1.6"/>'; return d; })(), fShort(p));
  function factionRow(s, f) {
    const p = s.players[f], you = f === me(), acting = loop.acting?.faction === f;
    return h('article', { class: `frow frow--${f}${you ? ' is-you' : ''}${acting ? ' is-acting' : ''}`, 'aria-label': `${fName(f)}${you ? ', 당신' : ''}` },
      h('img', { class: 'frow__emb', src: `assets/ui/emblem-${f}.svg`, alt: '', width: 40, height: 40 }),
      h('div', {}, h('h3', {}, fName(f)),
        h('div', { class: 'frow__tags' }, you ? h('span', { class: 'tag tag--you' }, '당신') : h('span', { class: 'tag', title: aiMeta[s.config.aiLevel]?.description }, 'AI ' + (aiMeta[s.config.aiLevel]?.name ?? '')),
          acting && h('span', { class: 'tag' }, '행동 중'),
          s.treaties.filter((t) => t.includes(f)).map((t) => pairStamp(t.find((x) => x !== f))))),
      h('div', { class: 'frow__score' }, h('b', { 'aria-label': `누적 점수 ${p.regionScore}` }, String(p.regionScore)), h('span', { class: 'label' }, '점수')),
      h('dl', { class: 'frow__res' }, ['capital', 'energy', 'industry', 'prestige'].map((k) =>
        h('div', { title: RES_KO[k], 'aria-label': `${RES_KO[k]} ${k === 'prestige' ? p.prestige : p.resources[k]}` }, icon(IC[k]), h('b', {}, String(k === 'prestige' ? p.prestige : p.resources[k]))))));
  }
  function regionPanel(s) {
    const id = view.sel;
    if (!id) return h('p', { class: 'ph' }, '지도에서 지역을 선택하면 점수 가치와 영향력 분포가 여기에 표시됩니다.');
    const r = R[id], rs = s.regions[id], lead = regionLeaders(s)[id], tie = !lead.length && Object.values(rs.influence).some((n) => n > 0);
    const res = rs.produces;
    return h('div', { class: 'panel rinfo' }, h('p', { class: 'label', style: 'margin:0' }, '지역 정보'), h('h3', {}, r.name),
      h('div', { class: 'leader' }, h('span', {}, '점수 가치'), h('i'), h('b', {}, `+${rs.scoreValue + rs.scoreBonus}${rs.scoreBonus ? ` (기본 ${rs.scoreValue})` : ''}`)),
      h('div', { class: 'leader' }, h('span', {}, '주도'), h('i'), h('b', { style: 'font-family:var(--font-body)' }, lead.length ? lead.map(fShort).join(' · ') : tie ? '경합' : '없음')),
      h('div', { class: 'leader' }, h('span', {}, '산출 자원'), h('i'), h('b', { style: 'font-family:var(--font-body);display:flex;gap:4px;align-items:center' }, res ? [icon(IC[res]), RES_KO[res]] : '없음')),
      h('div', { class: 'rinfo__inf' }, s.turnOrder.map((f) => h('div', {}, h('span', { class: `chip chip--${f}${rs.influence[f] ? '' : ' chip--zero'}` }, String(rs.influence[f])), fName(f), rs.bases[f] ? h('span', { class: 'tag base' }, '기지') : null, rs.defense[f] ? h('span', { class: 'tag' }, `방어 ${rs.defense[f]}`) : null))),
      h('p', { class: 'label', style: 'margin:var(--s3) 0 0' }, '인접 지역'),
      h('div', { class: 'nbrs' }, r.neighbors.map((n) => h('button', { type: 'button', onclick: () => select(n) }, R[n].name))));
  }
  const logLi = (e) => h('li', { 'data-sys': e.actor === 'system' ? '' : null }, h('b', {}, 'R' + e.round), h('span', {}, plain(e.text)));
  function paintRail(s) {
    const tab = (k, t) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(view.tab === k), onclick: () => { view.tab = k; paintRail(loop.state); } }, t);
    rail.dataset.tab = view.tab;
    rail.replaceChildren(
      h('div', { class: 'tabs', role: 'tablist' }, tab('f', '세력'), tab('r', view.sel ? R[view.sel].name.split('·')[0].slice(0, 6) : '지역'), tab('l', '기록')),
      h('section', { class: 'sec-f', 'aria-label': '세력 현황' }, h('div', { class: 'sec-h' }, h('span', { class: 'label' }, '세력 현황'), h('span', { class: 'label' }, '점수 · 자본 · 에너지 · 산업 · 위신')), s.turnOrder.map((f) => factionRow(s, f))),
      h('section', { class: 'sec-r', 'aria-label': '지역 정보' }, regionPanel(s)),
      h('section', { class: 'sec-l', 'aria-label': '기록' }, h('div', { class: 'sec-h' }, h('span', { class: 'label' }, '최근 기록'),
        h('button', { class: 'btn btn--sm', type: 'button', style: 'min-height:36px;padding:0 10px', onclick: () => openSheet('전체 기록', h('ol', { class: 'log' }, s.log.slice().reverse().map(logLi))) }, '전체 기록')),
        h('ol', { class: 'log' }, s.log.slice(-12).reverse().map(logLi))));
  }

  // ── 단계 행동 영역 ──
  const btn = (label, fn, cls = '', extra = {}) => h('button', { class: `btn ${cls}`, type: 'button', onclick: fn, ...extra }, label);
  function paintAct(s) {
    const human = me(), waiting = loop.waiting(), mine = waiting.includes(human) && s.phase !== 'end', busy = loop.running;
    const pc = s.pending?.[0], status = (title, text) => h('div', { class: 'act__status' }, h('p', {}, h('strong', {}, title), ' ', text));
    const feed = loop.feed.length ? h('p', { class: 'act__feed', 'aria-label': '최근 진행' }, `R${loop.feed[0].round} ${plain(loop.feed[0].text)}`) : null;
    const bar = [], body = [];
    let cand = [];
    const panel = (title, tag, ...kids) => h('section', { class: 'panel pbody' }, h('div', { class: 'panel__head' }, h('h3', { style: 'font-size:1rem' }, title), h('span', { class: 'label' }, tag)), h('div', { class: 'panel__body' }, ...kids));
    if (s.phase === 'end') {
      const res = s.result, w = res.winners.map(fName).join(', ');
      body.push(panel('최종 순위', '결과 화면은 U4', h('div', { class: 'result' }, h('span', { class: 'stamp' }, res.tie ? '공동 승리' : '승리'), h('p', {}, h('strong', { style: 'font:800 1.25rem var(--font-display)' }, w)),
        h('table', {}, h('thead', {}, h('tr', {}, ['순위', '세력', '지역', '위신', '목표', '합계'].map((t) => h('th', {}, t)))),
          h('tbody', {}, res.ranking.map((f, i) => { const c = res.scores[f]; return h('tr', {}, [i + 1, fName(f), c.regions, c.prestige, c.goalPoints, c.total].map((v) => h('td', {}, String(v)))); }))))));
      bar.push(status('게임 종료', `${s.config.rounds}라운드를 마쳤습니다.`), h('div', { class: 'act__row' }, btn('새 게임', () => show('setup'), 'btn--primary'), btn('표지로', () => show('title'))));
    } else if (mine && s.phase === 'setup') {
      const opts = s.players[human].assetOptions;
      body.push(panel('전략 자산 선택', '게임당 1회 사용', h('div', { class: 'assets', role: 'group', 'aria-label': '전략 자산 두 장' }, opts.map((id) => { const a = A[id]; return h('button', { class: `acard acard--${a.category}`, type: 'button', 'aria-pressed': String(view.pick === id), onclick: () => { view.pick = id; paint(); } },
        h('span', { class: 'tag' }, CAT_KO[a.category] || a.category), h('h4', {}, a.name), h('p', {}, plain(a.text)), h('span', { class: 'stamp stamp--ink' }, '지정')); }))));
      bar.push(status('전략 자산', '둘 중 하나를 고르십시오.'), h('div', { class: 'act__row' }, btn(view.pick ? `${A[view.pick].name} 확정` : '자산을 먼저 고르십시오', () => dispatch({ type: 'PICK_ASSET', faction: human, assetId: view.pick }), 'btn--primary', { disabled: !view.pick })));
    } else if (mine && pc) {
      const acts = legalActions(s, human, data), label = (c) => (typeof c === 'boolean' ? (c ? '지불한다' : '지불하지 않는다') : Array.isArray(c) ? c.map((x) => R[x]?.name ?? x).join(' + ') : R[c]?.name ?? F[c]?.name ?? C[c]?.name ?? String(c));
      if (pc.kind === 'region' || pc.kind === 'regionPair') cand = pc.options;
      body.push(panel('선택 필요', PROMPT[pc.effect?.type] || '효과의 대상', h('div', { class: 'opts' }, acts.map((a) => btn(label(a.choice), () => dispatch(a))))));
      bar.push(status('선택 필요', `${PROMPT[pc.effect?.type] || '효과의 대상'}을 고르십시오.`), h('div', { class: 'act__row' }, btn('자동 선택(임시)', () => dispatch(loop.pick(human)), 'btn--primary')));
    } else if (mine && s.phase === 'plan') {
      bar.push(status('계획 단계', `손패 ${s.players[human].hand.length}장 중 최대 3장을 비공개로 냅니다. 손패 화면은 U3.`), h('div', { class: 'act__row' }, btn('자동 계획(임시)', () => dispatch(loop.pick(human)), 'btn--primary')));
    } else if (mine && s.phase === 'shop') {
      bar.push(status('상점 단계', `자본 ${s.players[human].resources.capital}. 구매 화면은 U3.`), h('div', { class: 'act__row' }, btn('자동 상점(임시)', () => dispatch(loop.pick(human)), 'btn--primary'), btn('상점 종료', () => dispatch({ type: 'END_SHOP', faction: human }))));
    } else {
      const a = loop.acting;
      bar.push(status(a ? '컴퓨터 차례' : '진행 중', a ? plain(a.text) + '…' : view.fast ? '자동으로 진행합니다.' : '다음 입력을 기다립니다.'));
    }
    if (s.phase !== 'end') {
      bar.push(h('div', { class: 'act__tools' },
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: view.fast, onchange: (e) => { view.fast = e.target.checked; if (view.fast) run(); else loop.stop(); paint(); } }), '빠른 진행'),
        busy ? btn('멈춤', () => { view.fast = false; loop.stop(); paint(); }, 'btn--sm') : btn('다음 라운드까지', () => run({ auto: true, untilRound: s.round + 1, pace: view.fast ? 350 : 120 }), 'btn--sm')));
    }
    act.replaceChildren(...bar, feed);
    bodyEl.replaceChildren(...body);
    return cand;
  }

  // ── 전체 ──
  let cands = [];
  function paint() {
    const s = loop.state;
    paintHead(s); paintRail(s); cands = paintAct(s);
    map?.update({ state: s, selected: view.sel, candidates: cands });
  }
  const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; if (root.isConnected) paint(); }); };
  function select(id) { view.sel = id; view.tab = 'r'; paint(); }

  const off = loop.subscribe(schedule);
  store.cleanup = () => { off(); loop.stop(); cancelAnimationFrame(raf); map?.destroy(); store.cleanup = null; };
  createMap({ data, onSelect: select }).then((m) => {
    map = m; mapHost.replaceWith(m.el); paint();
  }).catch((e) => { mapHost.textContent = '지도를 불러오지 못했습니다: ' + e.message; });
  paint();
  run();
  return h('section', { class: 'game' }, h('h2', { class: 'sr-only' }, '작전 보드'), root);
}
