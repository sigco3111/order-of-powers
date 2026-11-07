// 규칙서(규칙 화면): 전체 화면 인쇄 매뉴얼. 내용은 rulesDoc(data)가 데이터·상수에서 만든다 (docs/RULES.md도 같은 내용).
// 순수 부분(CHAPTERS, rulesDoc, rulesMarkdown)은 DOM이 없어도 동작하고, openRules()만 화면에 그린다.
import { RULES, ARCHETYPES, ARCHETYPE_KO } from '../engine/index.js';
import { BASE_INCOME } from '../engine/income.js';

export const CHAPTERS = [
  ['goal', '게임 목표'], ['setup', '준비'], ['flow', '라운드 흐름'], ['resources', '자원'], ['regions', '지역과 점수'],
  ['cards', '카드 종류'], ['treaty', '조약·방어·기지'], ['assets', '전략 자산과 비밀 목표'], ['victory', '승리 조건과 동점'],
  ['countries', '국가 20개와 성향 4종'], ['glossary', '용어 사전'],
].map(([id, title], i) => ({ id, title, no: String(i + 1).padStart(2, '0') }));

export const PHASES = [['사건', '이벤트 카드 1장을 공개합니다.'], ['계획', '손패에서 카드를 골라 계획 칸에 놓습니다.'], ['공개', '모두 동시에 계획을 공개합니다.'],
  ['해결', '정해진 순서대로 계획 카드의 효과를 실행합니다.'], ['정산', '지역 점수와 수입을 받습니다.'], ['상점', '자본으로 카드를 삽니다. 마지막 라운드에는 없습니다.']];
const RES = { capital: '자본', energy: '에너지', industry: '산업' };
const FIG = (id, caption) => ({ t: 'fig', id, caption });

/** 장별 블록: p 문단 · ul 목록 · table 표 · fig 그림 · dl 용어. data는 엔진 data 묶음(regions, countries, factions, cards …) */
export function rulesDoc(data) {
  const R = data.regions, sv = (r) => r.scoreValue + (r.scoreBonus || 0), total = R.reduce((a, r) => a + sv(r), 0);
  const rn = Object.fromEntries(R.map((r) => [r.id, r.name]));
  const st = RULES.startResources, marketDeck = data.cards.filter((c) => c.deck === 'market').length;
  const byType = Object.fromEntries(ARCHETYPES.map((a) => [a, data.countries.filter((c) => c.archetype === a)]));
  const fac = Object.fromEntries(data.factions.map((f) => [f.id, f]));
  const body = {
    goal: [
      { t: 'p', text: `당신은 G20 국가 ${data.countries.length}개 가운데 하나를 맡아 세계 ${R.length}개 지역의 영향력을 겨룹니다. 한 판에는 언제나 ${RULES.factions}개 나라가 앉습니다. 나머지 셋은 AI입니다.` },
      { t: 'p', text: '카드를 계획해 지역에 영향력을 쌓고, 가장 많은 영향력을 가진 지역에서 매 라운드 점수를 받습니다. 마지막 라운드가 끝났을 때 총점이 가장 높은 나라가 이깁니다.' },
      { t: 'ul', items: ['총점 = 지역 점수(라운드마다 누적) + 위신 + 비밀 목표 점수', `라운드 수는 6 · 8 · 10 가운데 고릅니다 (기본 8). 한 판은 20~35분쯤 걸립니다.`, ...Object.values(data.roundModes || {}).map((m) => m.line)] },
    ],
    setup: [
      { t: 'p', text: '새 게임에서 국가 하나, 라운드 수, AI 난이도(쉬움·보통·어려움)를 고릅니다. 시드(고급)를 같게 하면 같은 판을 다시 할 수 있습니다.' },
      { t: 'table', head: ['항목', '값'], rows: [
        ['시작 자원', `자본 ${st.capital} · 에너지 ${st.energy} · 산업 ${st.industry} · 위신 ${RULES.startPrestige}`],
        ['손패', `${RULES.handSize}장`], ['계획 칸', `${RULES.planSlots}개 (성장 카드로 늘릴 수 있음)`],
        ['시장', `공개 ${RULES.marketSlots}칸 (시장 카드 ${marketDeck}장에서 채움)`],
        ['시작 덱', '유형마다 정해진 12장 (튜토리얼은 공용 10장)'],
        ['전략 자산', `${RULES.assetsDealt}장을 받아 1장 선택`], ['비밀 목표', `${RULES.goalsDealt}장을 받음`]] },
      { t: 'p', text: '자리마다 성향(유형) 하나가 정해져 있습니다. 규칙과 시작 덱은 성향이 정하고, 국가는 본거지 지역과 특성 하나만 더합니다.' },
    ],
    flow: [
      { t: 'p', text: `매 라운드는 여섯 단계로 흐릅니다. 마지막 라운드는 정산 뒤 바로 끝나며 상점이 없습니다.` },
      FIG('flow', '도 1 · 라운드 흐름'),
      { t: 'dl', items: PHASES.map(([a, b], i) => [`${i + 1}. ${a}`, b]) },
      { t: 'ul', items: [
        `계획: 라운드가 시작되면 손패가 ${RULES.handSize}장이 될 때까지 뽑고, ${RULES.planSlots}장 이하를 순서대로 놓습니다. 제출하면 고칠 수 없습니다.`,
        '해결 순서는 라운드마다 한 칸씩 돌아갑니다. 1라운드는 첫 번째 나라부터이고, 이후 한 나라씩 뒤로 밉니다. 각자 계획 카드를 앞에서부터 한 장씩 실행합니다.',
        `정산: 지역 점수 → 수입(자본 +${BASE_INCOME.capital}, 주도하는 지역마다 그 지역 산출 자원 +1) → 쓴 카드를 버린 더미로 → 시장 채움. 안 낸 손패는 다음 라운드로 이어집니다.`,
        '추격 보너스: 2라운드부터, 라운드 시작(이벤트 직후)에 누적 점수(지역+위신)가 가장 낮은 나라는 자본 +1과, 그 라운드 첫 영향력 배치 +1을 받습니다. 낮은 나라가 여럿이면 모두 받고, 전원이 같으면 아무도 받지 않습니다.',
        '이벤트: 라운드마다 1장입니다. 마지막 라운드 바로 앞 라운드에는 항상 큰 사건(대전환 임박)이 옵니다.'] },
    ],
    resources: [
      { t: 'table', head: ['자원', '쓰임'], rows: [
        ['자본', '카드를 사는 데만 씁니다. 구매 비용은 자본으로만 냅니다.'], ['에너지', '카드 효과와 수입으로 쌓입니다.'],
        ['산업', '카드 효과와 수입으로 쌓입니다.'], ['위신', '점수와 같습니다. 총점에 그대로 더해집니다.']] },
      { t: 'p', text: `수입은 정산 단계에 받습니다. 기본은 자본 +${BASE_INCOME.capital}이고, 주도하는 지역마다 그 지역의 산출 자원(자본·에너지·산업) +1을 더합니다. 자원 수입은 0 밑으로 내려가지 않습니다.` },
    ],
    regions: [
      { t: 'p', text: `세계는 ${R.length}개 지역으로 나뉩니다. 나라마다 한 지역에 영향력을 최대 ${RULES.maxInfluence}까지 놓을 수 있습니다. 지역에 놓인 전체 토큰 수는 제한이 없습니다.` },
      { t: 'table', head: ['지역', '점수 가치', '산출 자원'], rows: R.map((r) => [r.name, String(sv(r)), RES[r.produces?.resource] ?? '없음']) },
      { t: 'p', text: `점수 가치를 모두 더하면 ${total}점입니다. 그 지역에서 영향력이 가장 많은 나라가 주도 나라가 되어, 정산마다 그 지역의 점수 가치만큼 누적 점수를 얻습니다.` },
      { t: 'ul', items: ['영향력이 0이면 주도할 수 없습니다.', '가장 많은 영향력이 동률이면, 동률인 나라들이 서로 모두 조약 상대일 때만 함께 주도합니다 (각자 점수 전액). 아니면 그 지역은 주도 나라가 없습니다.'] },
      FIG('leader', '도 2 · 지역 주도 예시'),
      FIG('score', '도 3 · 점수 계산 예시'),
    ],
    cards: [
      { t: 'p', text: '카드는 세 계열입니다. 한 장은 이름, 계열, 비용, 효과 한 줄로 이루어집니다.' },
      { t: 'table', head: ['계열', '성격'], rows: [['내정', '경제·기술·안정. 자원을 얻고 덱을 키웁니다.'], ['외교', '조약·동맹·여론. 영향력을 놓고 상대와 거래합니다.'], ['군사', '기지·억지력·개입. 영향력을 늘리거나 상대 것을 줄입니다.']] },
      { t: 'ul', items: [
        `구매한 카드는 내 버린 더미로 갑니다. 상점에서는 ${RULES.marketSlots}칸 시장에서 사며, 사는 즉시 시장이 채워집니다.`,
        `나라마다 고유 카드 ${RULES.firstPurchaseCards}장이 개인 칸에 있고 그 나라만 살 수 있습니다. 이 칸은 시장을 채우지 않습니다.`,
        `성장 카드(${data.growth.length}종, 나라마다 1회씩)는 덱에 들어가지 않고 사는 즉시 영구 효과를 줍니다.`,
        '비용은 수정치를 합산해 정하며 최소 1입니다. 라운드의 첫 구매에 붙는 할인 같은 효과가 있습니다.',
        '손패와 덱이 비면 버린 더미를 섞어 다시 뽑습니다.'] },
    ],
    treaty: [
      { t: 'dl', items: [
        ['조약', '두 나라가 맺는 약속입니다. 서로 조약 상대인 나라끼리는 영향력이 동률이어도 함께 주도할 수 있습니다. 조약은 그 라운드가 끝나면 사라집니다.'],
        ['방어', '지역에 세운 방어 1점이 영향력 감소 1을 막고 사라집니다. 감소 수정치가 먼저 적용되고, 다음에 방어가 흡수하며, 남은 만큼 영향력이 제거됩니다. 방어는 라운드가 끝나면 사라집니다.'],
        ['기지', `군사 카드로 세웁니다. 세우면 그 지역 영향력 +1, 방어 +1을 얻고, 기지는 라운드가 지나도 남습니다. 비밀 목표에 쓰이고 상대의 기지 파괴 효과를 받을 수 있습니다.`]] },
      { t: 'p', text: '상대를 고르는 효과에서 상대가 둘 이상이면 대상을 직접 고릅니다. 가장 많은 영향력을 가진 나라를 겨누는 효과는 동률이면 모두에게 적용됩니다.' },
    ],
    assets: [
      { t: 'p', text: `전략 자산은 한 판에 한 번만 쓰는 특수 카드입니다. 시작할 때 ${RULES.assetsDealt}장을 받아 1장을 고르고, 계획 단계에서 제출 전에(또는 제출 직후) 한 번 사용합니다.` },
      { t: 'p', text: `비밀 목표는 시작할 때 ${RULES.goalsDealt}장을 받습니다. 조건(예: 서로 다른 2개 지역에 기지를 둔다)을 마지막에 채우면 그 점수를 총점에 더합니다. 끝나기 전에는 공개되지 않습니다.` },
    ],
    victory: [
      { t: 'p', text: '마지막 라운드의 정산이 끝나면 곧바로 최종 점수를 셉니다. 순위는 다음 순서로 가립니다.' },
      { t: 'table', head: ['순서', '비교 항목'], rows: [['1', '총점 (지역 점수 + 위신 + 비밀 목표)'], ['2', '위신'], ['3', '자본']] },
      { t: 'p', text: '세 가지가 모두 같으면 공동 승리입니다. 결과 화면에 공동 승리로 표시됩니다.' },
    ],
    countries: [
      { t: 'p', text: `국가는 ${data.countries.length}개이고 성향(유형)은 ${ARCHETYPES.length}종입니다. 유형마다 ${Math.round(data.countries.length / ARCHETYPES.length)}개 국가가 있습니다. 국가를 고르면 그 유형의 자리에 앉습니다.` },
      ...ARCHETYPES.flatMap((a) => [
        { t: 'h', text: `${ARCHETYPE_KO[a]} · ${fac[a]?.concept ?? ''}`, sub: (fac[a]?.strengths ?? []).join(' · ') },
        { t: 'table', head: ['국가', '본거지', '특성'], rows: byType[a].map((c) => [c.nameKo, rn[c.homeRegion] ?? c.homeRegion, `${c.trait.nameKo}: ${c.trait.text}`]) }]),
    ],
    glossary: [
      { t: 'dl', items: [
        ['주도', '한 지역에서 영향력이 가장 많은 상태.'], ['영향력', '지역에 놓는 토큰. 나라마다 지역당 최대 ' + RULES.maxInfluence + '.'],
        ['누적 점수', '라운드마다 주도한 지역 점수를 더한 값.'], ['추격 보너스', '가장 뒤진 나라가 받는 자본 +1과 첫 영향력 +1.'],
        ['계획 칸', `카드를 놓는 자리. 기본 ${RULES.planSlots}개.`], ['시장', `공개된 ${RULES.marketSlots}장의 구매 카드.`], ['성장 카드', '사는 즉시 영구 효과를 주는 카드. 덱에 들어가지 않음.'],
        ['전략 자산', '한 판에 한 번 쓰는 특수 카드.'], ['비밀 목표', '끝에 조건을 채우면 점수를 주는 카드.'], ['조약', '두 나라 사이의 약속. 라운드가 끝나면 사라짐.'],
        ['방어', '영향력 감소를 1점씩 막는 표시. 라운드가 끝나면 사라짐.'], ['기지', '영향력 +1, 방어 +1. 남아 있음.'], ['유형', '외교형·산업형·군사형·성장형.'], ['시드', '같은 판을 다시 만드는 숫자.']] },
    ],
  };
  return CHAPTERS.map((c) => ({ ...c, blocks: body[c.id] }));
}

/** docs/RULES.md 본문 (같은 내용) */
export function rulesMarkdown(data) {
  const out = ['# 규칙서 (Order of Powers · 권력의 질서)', '', '게임 안 규칙서와 같은 내용입니다. 숫자는 현재 규칙([RULES_DECISIONS.md](RULES_DECISIONS.md))과 데이터에서 만들었습니다.', '', '## 차례', ''];
  const doc = rulesDoc(data);
  doc.forEach((c) => out.push(`${c.no}. [${c.title}](#${c.no}-${c.id})`));
  const esc = (s) => String(s).replace(/\|/g, '\\|');
  for (const c of doc) {
    out.push('', `<a id="${c.no}-${c.id}"></a>`, `## ${c.no} ${c.title}`, '');
    for (const b of c.blocks) {
      if (b.t === 'p') out.push(b.text, '');
      else if (b.t === 'ul') out.push(...b.items.map((i) => `- ${i}`), '');
      else if (b.t === 'dl') out.push(...b.items.map(([a, d]) => `- **${a}**: ${d}`), '');
      else if (b.t === 'h') out.push(`### ${b.text}`, '', b.sub ? `강점: ${b.sub}` : '', '');
      else if (b.t === 'table') out.push(`| ${b.head.join(' | ')} |`, `| ${b.head.map(() => '---').join(' | ')} |`, ...b.rows.map((r) => `| ${r.map(esc).join(' | ')} |`), '');
      else if (b.t === 'fig') out.push(`*${b.caption} (게임 안 규칙서에 그림이 있습니다)*`, '');
    }
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
}

// ── 그림 (SVG, 인쇄물 느낌: 2px 잉크선, 각진 모서리) ──
const NS = 'http://www.w3.org/2000/svg';
const svgEl = (h, tag, a = {}, ...k) => { const e = document.createElementNS(NS, tag); for (const [x, v] of Object.entries(a)) e.setAttribute(x, v); e.append(...k.filter((n) => n != null)); return e; };
function figure(h, id, data) {
  const S = (tag, a, ...k) => svgEl(h, tag, a, ...k), T = (x, y, t, cls = '', extra = {}) => S('text', { x, y, class: `rf__t ${cls}`, ...extra }, t);
  if (id === 'flow') { // 여섯 칸 띠. 좁으면 2줄 3칸
    const g = S('svg', { viewBox: '0 0 360 150', class: 'rules__svg', role: 'img', 'aria-label': '라운드 흐름: 사건, 계획, 공개, 해결, 정산, 상점' });
    PHASES.forEach(([n], i) => {
      const x = 8 + (i % 3) * 115, y = i < 3 ? 10 : 80, last = i === 5;
      g.append(S('rect', { x, y, width: 104, height: 52, class: `rf__box${last ? ' is-dash' : ''}` }), T(x + 8, y + 18, String(i + 1).padStart(2, '0'), 'num'), T(x + 8, y + 40, n, 'b'));
      if (i % 3 < 2) g.append(S('path', { d: `M${x + 104} ${y + 26}h11`, class: 'rf__ln' }), S('path', { d: `M${x + 111} ${y + 22}l4 4l-4 4`, class: 'rf__ln' }));
    });
    g.append(S('path', { d: 'M60 62v8h240v10', class: 'rf__ln is-dot' }), T(180, 143, '마지막 라운드: 정산 뒤 바로 종료 (상점 없음)', 'm'));
    return g;
  }
  if (id === 'leader') { // 같은 지역의 토큰 막대 둘: 단독 선두 / 동률
    const g = S('svg', { viewBox: '0 0 360 168', class: 'rules__svg', role: 'img', 'aria-label': '지역 주도 예시: 영향력 4 대 2는 선두가 주도, 3 대 3은 조약이 있을 때만 공동 주도' });
    const rows = [['A', 4, 'B', 2, 'A 단독 주도', 28], ['A', 3, 'B', 3, '조약 있음: 공동 주도 / 없음: 주도 없음', 100]];
    g.append(T(8, 14, '예 1 · 영향력이 더 많은 나라가 주도', 'l'), T(8, 86, '예 2 · 동률', 'l'));
    for (const [a, na, b, nb, note, y] of rows) {
      [[a, na, 0], [b, nb, 22]].forEach(([n, v, dy]) => {
        g.append(T(8, y + dy + 13, n, 'b'));
        for (let i = 0; i < 6; i++) g.append(S('rect', { x: 28 + i * 26, y: y + dy, width: 22, height: 18, class: i < v ? (n === 'A' ? 'rf__fill' : 'rf__hatch') : 'rf__empty' }));
        g.append(T(190, y + dy + 14, String(v), 'num'));
      });
      g.append(T(8, y + 58, note, 'm'));
    }
    return g;
  }
  // score: 한 나라의 8라운드 합산 예시 (유럽 주도 5번 + 동아시아 주도 2번 + 위신 + 목표)
  const R = Object.fromEntries(data.regions.map((r) => [r.id, r.scoreValue + (r.scoreBonus || 0)]));
  const parts = [['유럽 주도 5번', R.europe * 5], ['동아시아 주도 2번', R.eastAsia * 2], ['위신', 4], ['비밀 목표', 5]], sum = parts.reduce((a, [, v]) => a + v, 0), u = 300 / sum;
  const g = S('svg', { viewBox: '0 0 360 150', class: 'rules__svg', role: 'img', 'aria-label': `점수 계산 예시: ${parts.map(([n, v]) => `${n} ${v}`).join(', ')}, 합계 ${sum}` });
  let x = 8;
  parts.forEach(([n, v], i) => { const w = v * u; g.append(S('rect', { x, y: 40, width: w, height: 30, class: i % 2 ? 'rf__hatch' : 'rf__fill' }), T(x + 4, 60, String(v), `num${i % 2 ? '' : ' inv'}`), S('path', { d: `M${x + w / 2} 70v${10 + (i % 2) * 20}`, class: 'rf__ln is-dot' }), T(Math.min(x + 2, 250), 92 + (i % 2) * 20, n, 'm')); x += w; });
  g.append(T(8, 20, `8라운드 판의 한 나라 (예) 합계 ${sum}점`, 'l'), S('path', { d: 'M8 36h300', class: 'rf__ln' }), T(8, 142, '총점 = 지역 점수(라운드마다 누적) + 위신 + 비밀 목표', 'm'));
  return g;
}

// ── 화면 ──
let openClose = null;
/** 규칙서를 전체 화면으로 연다. { h } 는 dom.js의 h (순환 import를 피하려고 늦게 불러온다) */
export async function openRules({ data, at = null } = {}) {
  if (openClose) return openClose; // 이미 열려 있음
  const { h } = await import('./dom.js');
  if (!data) { try { const app = await import('./app.js'); await app.ensureLoop(); data = app.store.data; } catch { data = null; } }
  if (!data) return null;
  const doc = rulesDoc(data), from = document.activeElement;
  const scroller = h('div', { class: 'rules__scroll', tabIndex: -1 });
  const jump = (id) => { const el = root.querySelector(`#rules-${id}`); if (!el) return; mdet.open = false; /* 차례를 먼저 접어야 위쪽 높이가 변하지 않는다 */ requestAnimationFrame(() => el.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })); };
  const tocItem = (c) => h('li', {}, h('a', { href: `#rules-${c.id}`, 'data-ch': c.id, onclick: (e) => { e.preventDefault(); jump(c.id); } }, h('span', { class: 'num' }, c.no), h('span', {}, c.title)));
  const side = h('nav', { class: 'rules__toc', 'aria-label': '규칙서 차례' }, h('p', { class: 'label' }, '차례'), h('ol', {}, doc.map(tocItem)));
  const mdet = h('details', { class: 'rules__mtoc' }, h('summary', {}, h('span', { class: 'label' }, '차례'), h('span', { class: 'rules__cur' }, doc[0].title)), h('ol', {}, doc.map(tocItem)));
  const block = (b) => {
    if (b.t === 'p') return h('p', {}, b.text);
    if (b.t === 'ul') return h('ul', { class: 'rules__ul' }, b.items.map((i) => h('li', {}, i)));
    if (b.t === 'dl') return h('dl', { class: 'rules__dl' }, b.items.map(([a, d]) => h('div', {}, h('dt', {}, a), h('dd', {}, d))));
    if (b.t === 'h') return h('h3', { class: 'rules__h3' }, b.text, b.sub ? h('small', {}, b.sub) : null);
    if (b.t === 'table') return h('div', { class: 'rules__tw' }, h('table', { class: 'rules__table' }, h('thead', {}, h('tr', {}, b.head.map((x) => h('th', { scope: 'col' }, x)))), h('tbody', {}, b.rows.map((r) => h('tr', {}, r.map((x, i) => h(i ? 'td' : 'th', i ? {} : { scope: 'row' }, x)))))));
    if (b.t === 'fig') return h('figure', { class: 'rules__fig' }, figure(h, b.id, data), h('figcaption', { class: 'label' }, b.caption));
    return null;
  };
  const close = () => { root.remove(); document.removeEventListener('keydown', onKey); document.body.classList.remove('has-rules'); openClose = null; if (from?.isConnected) from.focus?.(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const root = h('div', { class: 'rules', role: 'dialog', 'aria-modal': 'true', 'aria-label': '규칙서' },
    h('header', { class: 'rules__bar' }, h('span', { class: 'label' }, '규칙서 · RULES MANUAL'), h('button', { class: 'btn btn--sm', type: 'button', onclick: close }, '닫기')),
    scroller);
  scroller.append(h('div', { class: 'rules__wrap' }, h('aside', { class: 'rules__side' }, side),
    h('article', { class: 'rules__doc' },
      h('header', { class: 'rules__title' }, h('p', { class: 'label' }, '문서 번호 OP-0001 · 규칙서 · 제 1 판'), h('h1', {}, '규칙서'), h('p', { class: 'rules__lead' }, '권력의 질서의 규칙을 처음부터 끝까지 정리했습니다. 게임 중에도 언제든 열 수 있습니다.'), mdet),
      doc.map((c) => h('section', { class: 'rules__ch', id: `rules-${c.id}`, 'aria-labelledby': `rules-${c.id}-h` }, h('h2', { id: `rules-${c.id}-h` }, h('span', { class: 'num' }, c.no), c.title), c.blocks.map(block))),
      h('p', { class: 'label rules__end' }, '끝 · 규칙서'))));
  document.body.append(root); document.body.classList.add('has-rules');
  document.addEventListener('keydown', onKey);
  // 읽는 위치를 차례에 표시: 위쪽에서 가장 가까이 지나간 장
  const spy = () => {
    const top = scroller.getBoundingClientRect().top + 90, secs = [...root.querySelectorAll('.rules__ch')];
    const cur = secs.filter((e) => e.getBoundingClientRect().top <= top).pop() ?? secs[0], id = cur.id.slice(6);
    root.querySelectorAll('[data-ch]').forEach((a) => a.toggleAttribute('aria-current', a.dataset.ch === id));
    mdet.querySelector('.rules__cur').textContent = doc.find((c) => c.id === id)?.title ?? '';
  };
  scroller.addEventListener('scroll', spy, { passive: true }); spy();
  openClose = close;
  if (at) jump(at); else scroller.focus({ preventScroll: true });
  return close;
}
