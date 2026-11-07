// 기록 모달: 최근 20판 괘선 표 + 라운드 수별 최고 점수 + 승리 횟수 + 업적 도장 (title 화면과 결과 화면이 함께 쓴다)
import { h, openSheet } from './dom.js';
import { readRecords, readMeta, bestByRounds, winCount, ACHIEVEMENTS } from './records.js';
import { LEVEL_KO } from './report.js';

export function openRecords() {
  const recs = readRecords(), meta = readMeta(), best = bestByRounds(recs);
  const body = h('div', { class: 'recs' },
    h('div', { class: 'leader' }, h('span', {}, '기록된 판'), h('i'), h('b', {}, `${recs.length}판`)),
    h('div', { class: 'leader' }, h('span', {}, '승리'), h('i'), h('b', {}, `${winCount(recs)}회`)),
    [6, 8, 10].map((r) => h('div', { class: 'leader' }, h('span', {}, `${r}라운드 최고 점수`), h('i'), h('b', {}, r in best ? `${best[r]}점` : '—'))),
    recs.length ? h('table', { class: 'recs__tbl' }, h('thead', {}, h('tr', {}, ['날짜', '국가', '라운드', '난이도', '점수', '순위'].map((t) => h('th', {}, t)))),
      h('tbody', {}, recs.map((r) => h('tr', { class: r.win ? 'is-win' : '' }, h('td', {}, new Date(r.date).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })), h('td', {}, r.countryName),
        h('td', { class: 'num' }, r.rounds), h('td', {}, LEVEL_KO[r.level] ?? r.level), h('td', { class: 'num' }, r.score), h('td', { class: 'num' }, r.win ? '1위 승' : `${r.rank}위`)))))
      : h('p', { class: 'ph' }, '아직 끝낸 판이 없습니다. 한 판을 끝까지 마치면 여기에 남습니다.'),
    h('h3', { class: 'recs__h' }, '업적'),
    h('ul', { class: 'ach' }, ACHIEVEMENTS.map((a) => { const got = meta.achievements[a.id]; return h('li', { class: got ? 'is-got' : '' },
      h('span', { class: `stamp ${got ? 'stamp--brass' : 'stamp--ink'}` }, a.name), h('span', { class: 'ach__d' }, got ? `달성 ${new Date(got).toLocaleDateString('ko-KR')}` : a.desc)); })));
  return openSheet('기록', body);
}
