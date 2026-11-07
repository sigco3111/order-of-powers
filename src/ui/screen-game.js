import { h, icon, openSheet } from './dom.js';
import { createMap } from './map.js';
import { legalActions, seatName, ARCHETYPE_KO } from '../engine/index.js';
import { regionLeaders } from '../engine/score.js';
import { aiMeta } from '../ai/ai.js';
import { createPlay } from './play.js';
import { createShop } from './shop.js';
import { createPresenter } from './presenter.js';
import { openSettings } from './settings-view.js';
import { sfx } from './audio.js';
import { effectsToKorean } from './effect-text.js';

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
const rx = new RegExp(`\\b(northAmerica|southAmerica|europe|russiaCentralAsia|middleEastNorthAfrica|subSaharanAfrica|eastAsia|southAsiaOceania)\\b`, 'g');
const by = (a) => Object.fromEntries(a.map((x) => [x.id, x]));

export const reportKey = (s) => `${s.seed}-${s.config.rounds}-${s.config.humanFaction}`;

export function gameScreen({ store, show }) {
  const loop = store.loop, data = store.data, F = by(data.factions), R = by(data.regions), C = { ...by(data.cards), ...by(data.growth) }, A = by(data.assets), E = by(data.events);
  const me = () => loop.state.config.humanFaction;
  const view = { sel: null, tab: 'f', pick: null, fast: !!store.settings.fast, plan: [] };
  const debug = new URLSearchParams(location.search).get('debug') === '1'; // 임시 자동 계획 버튼은 ?debug=1 에서만
  const root = h('div', { class: 'board' });
  const live = h('div', { class: 'sr-only', role: 'status', 'aria-live': 'polite' });
  const mapHost = h('div', { class: 'map-host' });
  let map = null, raf = 0;

  const head = h('header', { class: 'bhead' }), rail = h('aside', { class: 'brail', 'aria-label': '세력과 지역 정보' }), act = h('section', { class: 'act', 'aria-label': '지금 할 일', 'aria-live': 'polite' });
  const bodyEl = h('div', { class: 'pbody-host' });
  root.append(head, bodyEl, mapHost, rail, act, live);

  const fName = (f) => seatName(loop.state, f, data), fShort = fName; // 좌석 이름 = 국가 이름
  const run = (o = {}) => loop.run({ pace: 0, ...o });
  const dispatch = (a) => { const r = loop.dispatch(a); if (!r.ok) console.warn(r.reason); else run(); return r; };
  /** 사람의 행동: 합법 수인지 검사하고 적용한 뒤 AI 진행을 이어간다 */
  const submit = (a) => { const r = loop.submit(a); if (!r.ok) { console.warn(r.reason); sfx('error'); } else run(); return r; };
  const announce = (t) => { live.textContent = ''; setTimeout(() => { live.textContent = t; }, 30); };
  const regionName = (id) => R[id]?.name ?? id;
  const modLine = (m, key, v, scope) => effectsToKorean([{ type: 'modifier', key, value: Number(String(v).replace('−', '-')), scope: scope === '게임' ? 'game' : 'round' }], null)[0] ?? m;
  const nice = (t = '') => plain(t).replace(/^수정치 (\S+) ([+−-]\d+) \((게임|라운드)\)/, (m, k, v, sc) => modLine(m, k, v, sc)).replace(/(^|\s)(자본|에너지|산업|위신) \2(?=\s)/g, '$1$2').replace(rx, regionName).replace(/^선택: .*/, (m) => m.replace(/[\[\]"]/g, ''));
  const P = createPresenter({ loop, data, C, E, fName, regionName, isFast: () => view.fast, onChange: () => schedule() });
  const play = createPlay({ loop, data, view, repaint: () => paint(), submit, announce, C, A, E, R, F, fName, regionName });
  const shop = createShop({ loop, data, view, repaint: () => paint(), submit, announce, fName });
  const shown = () => P.display || loop.state; // 연출 중에는 단계별로 따라가는 화면 상태

  // ── 머리띠: 라운드, 단계 도장, 이벤트 카드 ──
  function paintHead(s) {
    const e = E[s.currentEvent], type = e ? EVT_TYPE[e.id.slice(4)] || '정세' : null, i = RIBBON.indexOf(s.phase);
    head.replaceChildren(...[
      h('div', { class: 'bhead__round' }, h('div', {}, h('p', { class: 'label', style: 'margin:0' }, '라운드'), h('span', { class: 'numeral', 'aria-label': `${s.round}라운드, 전체 ${s.config.rounds}` }, PAD(s.round))), h('small', { 'aria-hidden': 'true' }, '/' + PAD(s.config.rounds))),
      h('div', { class: 'bhead__phase' }, h('span', { class: 'label' }, '현재 단계'),
        h('span', { class: 'stamp stamp--press stamp--ink' }, PHASE[s.phase]),
        h('ol', { class: 'ribbon', 'aria-hidden': 'true' }, RIBBON.map((p, j) => h('li', { 'aria-current': j === i ? 'step' : null }, PHASE[p])))),
      e ? h('div', { class: 'evt', style: `border-left-color:var(--${type === '위기' ? 'stamp' : 'brass'})` }, h('span', { class: 'label' }, `이벤트 카드 · ${e.id.toUpperCase()}`), h('div', { class: 'evt__name' }, e.name),
        h('p', { class: 'evt__text' }, plain(e.text)), h('span', { class: `stamp ${type === '위기' ? '' : type === '기회' ? 'stamp--brass' : 'stamp--ink'}` }, type))
        : h('div', { class: 'evt evt--empty' }, h('span', { class: 'label' }, '이벤트 카드'), h('div', { class: 'evt__text' }, s.phase === 'end' ? '게임이 끝났습니다.' : '라운드가 시작되면 사건이 공개됩니다.')),
      s.phase === 'end' ? null : tools()].filter(Boolean));
  }

  // ── 레일: 세력 / 지역 / 기록 ──
  const pairStamp = (p) => h('span', { class: 'pair', title: `${fName(p)}와 조약` }, (() => { const d = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); d.setAttribute('viewBox', '0 0 17 11'); d.setAttribute('aria-hidden', 'true'); d.innerHTML = '<circle cx="5.5" cy="5.5" r="4" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="11.5" cy="5.5" r="4" fill="none" stroke="currentColor" stroke-width="1.6"/>'; return d; })(), fShort(p));
  function factionRow(s, f) {
    const p = s.players[f], you = f === me(), acting = loop.acting?.faction === f;
    return h('article', { class: `frow frow--${f}${you ? ' is-you' : ''}${acting ? ' is-acting' : ''}`, 'aria-label': `${fName(f)}${you ? ', 당신' : ''}` },
      h('img', { class: 'frow__emb', src: `assets/ui/emblem-${f}.svg`, alt: '', width: 40, height: 40 }),
      h('div', {}, h('h3', {}, fName(f), h('small', { class: 'frow__iso' }, p.iso ?? '')), h('p', { class: 'frow__arch' }, ARCHETYPE_KO[f]),
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
  const logLi = (e) => h('li', { 'data-sys': e.actor === 'system' ? '' : null }, h('b', {}, 'R' + e.round), h('span', {}, nice(e.text)));
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
  const tools = () => h('div', { class: 'act__tools' },
    h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: view.fast, onchange: (e) => { view.fast = e.target.checked; paint(); } }), '빠른 진행'),
    btn('설정', () => openSettings({ show, store }), 'btn--sm', { 'aria-haspopup': 'dialog' }),
    debug ? (loop.running ? btn('멈춤', () => { loop.stop(); paint(); }, 'btn--sm') : btn('다음 라운드까지(디버그)', () => run({ auto: true, untilRound: loop.state.round + 1, pace: 120 }), 'btn--sm')) : null);
  /** 반환: 지도에서 강조할 후보 지역 */
  function paintAct(s) {
    const human = me(), waiting = loop.waiting(), mine = waiting.includes(human) && s.phase !== 'end';
    const pc = s.pending?.[0], status = (title, text) => h('div', { class: 'act__status' }, h('p', {}, h('strong', {}, title), ' ', text));
    const feed = loop.feed.length ? h('p', { class: 'act__feed', 'aria-label': '최근 진행' }, `R${loop.feed[0].round} ${nice(loop.feed[0].text)}`) : null;
    const bar = [], body = [];
    let cand = [], kind = '';
    const panel = (title, tag, ...kids) => h('section', { class: 'panel pbody' }, h('div', { class: 'panel__head' }, h('h3', { style: 'font-size:1rem' }, title), h('span', { class: 'label' }, tag)), h('div', { class: 'panel__body' }, ...kids));
    if (P.active) {
      kind = 'strip'; bar.push(P.strip());
    } else if (s.phase === 'end') {
      const w = s.result.winners.map(fName).join(', ');
      bar.push(status('게임 종료', `${s.config.rounds}라운드를 마쳤습니다. ${s.result.tie ? '공동 승리' : '승자'}: ${w}.`), h('div', { class: 'act__row' }, btn('최종 보고서 보기', () => { store.reported = reportKey(s); show('result'); }, 'btn--primary'), btn('표지로', () => show('title'))));
    } else if (mine && s.phase === 'setup') {
      const opts = s.players[human].assetOptions;
      body.push(panel('전략 자산 선택', '게임당 1회 사용', h('div', { class: 'assets', role: 'group', 'aria-label': '전략 자산 두 장' }, opts.map((id) => { const a = A[id]; return h('button', { class: `acard acard--${a.category}`, type: 'button', 'aria-pressed': String(view.pick === id), onclick: () => { view.pick = id; paint(); } },
        h('span', { class: 'tag' }, CAT_KO[a.category] || a.category), h('h4', {}, a.name), h('p', {}, plain(a.text)), h('span', { class: 'stamp stamp--ink' }, '지정')); }))));
      bar.push(status('전략 자산', '둘 중 하나를 고르십시오.'), h('div', { class: 'act__row' }, btn(view.pick ? `${A[view.pick].name} 확정` : '자산을 먼저 고르십시오', () => submit({ type: 'PICK_ASSET', faction: human, assetId: view.pick }), 'btn--primary', { disabled: !view.pick })));
    } else if (mine && pc) {
      kind = 'choice'; cand = play.candidates(s); bar.push(...play.choice(s));
    } else if (mine && s.phase === 'plan') {
      kind = 'tray'; bar.push(...play.tray(s));
      if (debug) bar.push(h('div', { class: 'act__row' }, btn('자동 계획(디버그)', () => dispatch(loop.pick(human)))));
    } else if (mine && s.phase === 'shop') {
      kind = 'shop'; bar.push(shop.panel(s));
    } else {
      const a = loop.acting;
      bar.push(status(a ? '컴퓨터 차례' : '진행 중', a ? nice(a.text) + '…' : '다음 입력을 기다립니다.'));
    }
    act.className = `act${kind ? ` act--${kind}` : ''}`; root.classList.toggle('is-tray', kind === 'tray'); root.classList.toggle('is-shop', kind === 'shop');
    act.replaceChildren(...bar.filter(Boolean), ...(kind || !feed ? [] : [feed]));
    bodyEl.replaceChildren(...body);
    return cand;
  }

  // ── 전체 ──
  let cands = [], kind0 = '';
  const actKind = () => (act.className.match(/act--(\w+)/) || [])[1] || '';
  let seenRound = null, seenPhase = null;
  function paint() {
    const s = shown();
    if (!P.active) { // 연출이 끝난 뒤에만 라운드·단계 소리를 낸다 (처음 그릴 때는 조용히)
      const ls = loop.state;
      if (seenRound != null && ls.round !== seenRound && ls.phase !== 'end') sfx('round');
      else if (seenPhase != null && ls.phase !== seenPhase && ['plan', 'shop'].includes(ls.phase)) sfx('phase');
      seenRound = ls.round; seenPhase = ls.phase;
    }
    paintHead(s); paintRail(s); cands = paintAct(loop.state); maybeReport();
    const k = actKind();
    map?.update({ state: s, selected: k === 'choice' && view.choice != null ? view.choice : view.sel, candidates: P.active ? [] : cands, fx: P.fx });
    if (kind0 !== k) { kind0 = k; if (k === 'choice' || k === 'strip' || (k === 'tray' && matchMedia('(max-width: 899px)').matches)) map?.el.scrollIntoView({ block: 'start', behavior: 'auto' }); }
  }
  /** 게임이 끝나고 연출이 멈추면 한 번만 최종 보고서로 넘어간다 */
  function maybeReport() {
    const s = loop.state;
    if (s.phase !== 'end' || P.active || store.reported === reportKey(s)) return;
    store.reported = reportKey(s);
    setTimeout(() => { if (root.isConnected && loop.state.phase === 'end') show('result'); }, 1200);
  }
  const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; if (root.isConnected) paint(); }); };
  function select(id) { sfx('region'); if (play.pickRegion(id)) return; view.sel = id; view.tab = 'r'; paint(); }

  const off = loop.subscribe(schedule);
  store.cleanup = () => { off(); P.destroy(); loop.stop(); loop.present = null; loop.hold = null; cancelAnimationFrame(raf); map?.destroy(); store.cleanup = null; };
  createMap({ data, onSelect: select }).then((m) => {
    map = m; mapHost.replaceWith(m.el); paint();
  }).catch((e) => { mapHost.textContent = '지도를 불러오지 못했습니다: ' + e.message; });
  paint();
  run();
  return h('section', { class: 'game' }, h('h2', { class: 'sr-only' }, '작전 보드'), root);
}
