// 결과/엔딩 화면: "최종 보고서" 문서. 순위표 · 비밀 목표 · 점수 추이 · 하이라이트 · 설정. 기록과 업적을 저장한다.
import { h } from './dom.js';
import { sfx } from './audio.js';
import { buildReport, recordOf, shareText } from './report.js';
import { addRecord, updateMeta } from './records.js';
import { randomCountries } from '../engine/index.js';
import { reportKey } from './screen-game.js';
import { openRecords } from './records-view.js';
import { openRules } from './rules.js';
import { openSettings } from './settings-view.js';

const NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}, ...kids) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); e.append(...kids.filter((x) => x != null)); return e; };
const COL = (f) => `var(--f-${f})`;

/** 잉크 붓획 ✓ / ✗ (이모지·글리프가 아니라 SVG 획) */
export const mark = (ok) => svg('svg', { class: `rmark ${ok ? 'rmark--ok' : 'rmark--no'}`, viewBox: '0 0 24 24', role: 'img', 'aria-label': ok ? '달성' : '미달성' },
  ok ? svg('path', { d: 'M3.5 13.5 L9 19.5 L21 4.5' }) : svg('path', { d: 'M5 5 L19 19 M19 5 L5 19' }));

/** 누적 지역 점수 선 그래프: 세력색 선, 끝에 직접 이름 표시, 범례 상자 없음 */
export function chart(report) {
  const n = report.settings.rounds, W = 340, H = 190, L = 26, R = 78, T = 10, B = 24, pw = W - L - R, ph = H - T - B;
  const max = Math.max(5, ...Object.values(report.history).flat()), top = Math.ceil(max / 20) * 20;
  const X = (i) => L + (n === 1 ? 0 : (pw * i) / (n - 1)), Y = (v) => T + ph - (ph * v) / top;
  const g = svg('svg', { class: 'rchart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': '라운드별 누적 지역 점수 추이' });
  for (let v = 0; v <= top; v += top / 4) g.append(svg('line', { x1: L, x2: W - R, y1: Y(v), y2: Y(v), class: 'rchart__grid' }), svg('text', { x: L - 4, y: Y(v) + 3, class: 'rchart__y' }, String(Math.round(v))));
  for (let i = 0; i < n; i++) g.append(svg('text', { x: X(i), y: H - 7, class: 'rchart__x' }, String(i + 1)));
  const ends = report.rows.map((r) => ({ r, y: Y(report.history[r.f][n - 1]) })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 12) ends[i].y = ends[i - 1].y + 12; // 이름이 겹치지 않게
  const order = [...report.rows].sort((a, b) => Number(a.you) - Number(b.you)); // 내 선을 위에
  for (const r of order) {
    const pts = report.history[r.f].map((v, i) => `${X(i)},${Y(v)}`).join(' ');
    g.append(svg('polyline', { points: pts, class: `rchart__line${r.you ? ' is-you' : ''}`, style: `stroke:${COL(r.f)}` }));
  }
  for (const { r, y } of ends) g.append(svg('rect', { x: W - R + 6, y: y - 7, width: 8, height: 8, style: `fill:${COL(r.f)}`, class: 'rchart__sw' }),
    svg('text', { x: W - R + 18, y: y + 1, class: `rchart__name${r.you ? ' is-you' : ''}` }, r.name.length > 5 ? r.name.slice(0, 5) + '…' : r.name));
  g.append(svg('line', { x1: L, x2: L, y1: T, y2: T + ph, class: 'rchart__axis' }), svg('line', { x1: L, x2: W - R, y1: T + ph, y2: T + ph, class: 'rchart__axis' }));
  return g;
}

export function resultScreen({ store, show }) {
  const loop = store.loop, s = loop?.state, data = store.data;
  if (!s || s.phase !== 'end') { queueMicrotask(() => show(s ? 'game' : 'title')); return h('section', { class: 'rep' }); }
  const rep = buildReport(s, data), rec = recordOf(s, rep);
  store.reported = reportKey(s);
  // 기록과 업적 (같은 판은 한 번만)
  const practice = !!s.config.tutorial; // 튜토리얼 판은 기록·업적에 쓰지 않는다
  const { added } = practice ? { added: false } : addRecord(localStorage, rec);
  const unlocked = added ? updateMeta(localStorage, rec, rep.goalsMet).unlocked : [];

  const win = rep.winner, you = rep.me;
  const th = (r) => h('th', { scope: 'col', class: `${r.win ? 'is-win' : ''}${r.you ? ' is-you' : ''}`, style: `--fc:${COL(r.f)}` },
    h('span', { class: 'rep__cn' }, r.name), h('span', { class: 'rep__iso num' }, r.iso), h('span', { class: 'rep__rk num' }, `${r.rank}위`), r.you ? h('span', { class: 'tag rep__you' }, '당신') : null);
  const cell = (r, v, cls = '') => h('td', { class: `num${r.win ? ' is-win' : ''}${cls}` }, String(v));
  const table = h('table', { class: 'rep__tbl' },
    h('caption', { class: 'sr-only' }, '국가별 점수표'),
    h('thead', {}, h('tr', {}, h('td', {}), rep.rows.map(th))),
    h('tbody', {},
      [['지역 점수(누적)', 'regions'], ['위신', 'prestige'], ['비밀 목표', 'goalPoints']].map(([t, k]) => h('tr', {}, h('th', { scope: 'row' }, t), rep.rows.map((r) => cell(r, r[k])))),
      h('tr', { class: 'rep__sum' }, h('th', { scope: 'row' }, '합계'), rep.rows.map((r) => cell(r, r.total)))));

  const goals = h('section', { class: 'rep__sec' }, h('h3', {}, '내 비밀 목표 공개'),
    h('ul', { class: 'goals' }, rep.goals.map((g) => h('li', { class: g.met ? 'is-ok' : 'is-no' }, mark(g.met),
      h('div', {}, h('b', {}, g.name), h('p', {}, g.condition)), h('span', { class: 'num goals__pt' }, g.met ? `+${g.earned}` : `0/${g.points}`)))));

  const status = h('p', { class: 'rep__status', role: 'status' });
  const ta = h('textarea', { class: 'rep__ta', readOnly: true, rows: 5, hidden: true, 'aria-label': '복사할 기록 요약' });
  const share = async (e) => {
    const t = shareText(rep);
    try { await navigator.clipboard.writeText(t); status.textContent = '기록 요약을 복사했습니다.'; e.currentTarget.blur(); }
    catch { ta.value = t; ta.hidden = false; ta.focus(); ta.select(); status.textContent = '복사 권한이 없어 아래 글을 직접 복사하십시오.'; }
  };
  const again = async () => {
    const seed = 1 + Math.floor(Math.random() * 999999), cfg = s.config, ui = loop.ui || {}, human = cfg.humanFaction;
    const fixed = { ...Object.fromEntries(Object.entries(store.ui.opp || {}).filter(([, v]) => v)), [human]: cfg.countries?.[human] };
    store.ui.seed = seed;
    loop.start({ rounds: cfg.rounds, factions: s.turnOrder.slice(), humanFaction: human, seed, aiLevel: cfg.aiLevel, countries: randomCountries(data, seed, fixed) });
    show('game');
  };
  const sheetRecords = () => openRecords();

  setTimeout(() => sfx(rep.humanWon ? 'win' : 'lose'), 250);
  const dateStr = new Date(rec.date).toLocaleDateString('ko-KR');
  return h('section', { class: 'rep', 'aria-labelledby': 'rep-title' },
    h('p', { class: 'label' }, `최종 보고서 · FINAL REPORT · ${dateStr}`),
    h('header', { class: 'rep__head', style: `--fc:${COL(win.f)}` },
      h('div', {}, h('p', { class: 'label' }, rep.tie ? '공동 승리' : '승자'),
        h('h2', { id: 'rep-title', class: 'rep__title' }, rep.winnerNames.join(' · ')),
        h('p', { class: 'rep__sub' }, rep.humanWon ? '당신의 나라가 승리했습니다.' : `당신은 ${you.rank}위 (${you.total}점)로 마쳤습니다.`)),
      h('div', { class: 'rep__stamps' }, h('span', { class: `stamp ${rep.humanWon ? 'stamp--brass' : 'stamp--ink'} stamp--press rep__win` }, rep.humanWon ? (rep.tie ? '공동 승리' : '승리') : '패배'), h('span', { class: 'stamp stamp--ink rep__iso-s num' }, win.iso))),
    table,
    rep.tieNote ? h('p', { class: 'rep__tie' }, h('span', { class: 'tag' }, '동점 처리'), rep.tieNote) : null,
    unlocked.length ? h('p', { class: 'rep__ach' }, h('span', { class: 'label' }, '새 업적'), unlocked.map((a) => h('span', { class: 'stamp stamp--brass', title: a.desc }, a.name))) : null,
    goals,
    h('section', { class: 'rep__sec' }, h('h3', {}, '점수 추이'), h('p', { class: 'label' }, '라운드별 누적 지역 점수 (위신·목표 제외)'), chart(rep)),
    rep.highlights.length ? h('section', { class: 'rep__sec' }, h('h3', {}, '하이라이트'), rep.highlights.map((x) => h('div', { class: 'leader' }, h('span', {}, x.label), h('i'), h('b', { class: 'rep__hv' }, x.value, h('small', {}, ` ${x.note}`))))) : null,
    h('section', { class: 'rep__sec' }, h('h3', {}, '작전 조건'),
      [['국가', rep.settings.country], ['라운드 수', `${rep.settings.rounds}`], ['AI 난이도', rep.settings.levelKo], ['시드', String(rep.settings.seed)]].map(([a, b]) => h('div', { class: 'leader' }, h('span', {}, a), h('i'), h('b', {}, b)))),
    h('div', { class: 'rep__btns' },
      h('button', { class: 'btn btn--primary', type: 'button', onclick: again }, '다시 하기'),
      h('button', { class: 'btn', type: 'button', onclick: () => show('setup') }, '설정으로'),
      h('button', { class: 'btn', type: 'button', onclick: share }, '기록 공유'),
      h('button', { class: 'btn', type: 'button', onclick: sheetRecords }, '기록 보기'),
      h('button', { class: 'btn', type: 'button', onclick: () => show('game') }, '보드 보기'),
      h('button', { class: 'btn', type: 'button', onclick: () => openRules({ data }) }, '규칙'),
      h('button', { class: 'btn', type: 'button', onclick: () => openSettings({ show, store }), 'aria-haspopup': 'dialog' }, '설정')),
    status, ta);
}

