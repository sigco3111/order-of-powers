// 설정 시트: 소리 · 화면 · 진행 · 데이터 관리 · 정보(크레딧). 제목 화면과 보드 머리띠에서 연다.
import { h, openSheet } from './dom.js';
import { current, update, exportData, importData, clearSave, clearRecords, VERSION, REPO } from './settings.js';
import { sfx, canPlayAudio } from './audio.js';

const CREDITS = [
  ['Kenney (kenney.nl) · CC0', 'UI Pack, UI Pack Adventure, Board Game Pack, Board Game Icons, Game Icons, Ranks Pack, Cartography Pack'],
  ['Kenney (kenney.nl) · CC0 · 소리', 'Casino Audio, UI Audio, Interface Sounds, RPG Audio'],
  ['OpenGameArt · CC0', 'CC0 Shield Icons (Commander), CC0 Currency Icons, Win sound effect (Snabisch), Game Over - Bad chest SFX (Felis Chaus)'],
  ['OpenGameArt · CC0 · 음악', 'Meadow Thoughts (mishonis), Contemplation (Pro Sensory)'],
  ['Natural Earth · 퍼블릭 도메인', '세계 지도 (world-atlas, ISC)'],
];

export function openSettings({ show, store } = {}) {
  const sec = (title, ...kids) => h('section', { class: 'set__sec' }, h('h3', {}, title), ...kids);
  const check = (key, label, after) => h('label', { class: 'check set__row' },
    h('input', { type: 'checkbox', checked: current[key], onchange: (e) => { update({ [key]: e.target.checked }); sfx('toggle'); after?.(); } }), label);
  const slider = (key, label) => {
    const out = h('b', { class: 'num set__val' }, `${current[key]}%`);
    const input = h('input', { type: 'range', class: 'slider', min: 0, max: 100, step: 5, value: current[key], 'aria-label': label,
      oninput: (e) => { update({ [key]: Number(e.target.value) }); out.textContent = `${current[key]}%`; },
      onchange: () => key === 'sfxVol' && sfx('click') });
    return h('div', { class: 'set__slider' }, h('span', { class: 'label' }, label), out, input);
  };
  const seg = (key, opts, label) => h('div', { class: 'set__seg', role: 'group', 'aria-label': label },
    opts.map(([v, t]) => h('button', { class: 'btn set__opt', type: 'button', 'aria-pressed': String(current[key] === v), onclick: (e) => {
      update({ [key]: v }); for (const b of e.currentTarget.parentNode.children) b.setAttribute('aria-pressed', String(b === e.currentTarget)); } }, t)));

  const status = h('p', { class: 'set__status', role: 'status', 'aria-live': 'polite' });
  const refresh = () => { if (show && store?.screen === 'title') show('title', { focus: false }); };
  const confirmBtn = (label, ask, fn) => {
    const row = h('div', { class: 'set__confirm' });
    const reset = () => row.replaceChildren(h('button', { class: 'btn', type: 'button', onclick: arm }, label));
    const arm = () => { row.replaceChildren(h('span', { class: 'set__ask' }, ask),
      h('button', { class: 'btn btn--primary', type: 'button', onclick: () => { status.textContent = fn() ? `${label} 완료` : `${label} 실패`; reset(); refresh(); } }, '삭제'),
      h('button', { class: 'btn', type: 'button', onclick: reset }, '취소')); };
    reset(); return row;
  };
  const out = h('textarea', { class: 'set__ta', readOnly: true, rows: 4, 'aria-label': '내보낸 데이터', hidden: true });
  const inp = h('textarea', { class: 'set__ta', rows: 4, 'aria-label': '가져올 데이터를 붙여넣으십시오', placeholder: '내보낸 JSON을 여기에 붙여넣기' });
  const doExport = async () => {
    out.value = exportData(); out.hidden = false; out.focus(); out.select();
    try { await navigator.clipboard.writeText(out.value); status.textContent = '복사했습니다. 아래 글을 보관하십시오.'; } catch { status.textContent = '아래 글을 직접 복사하십시오.'; }
  };
  const doImport = () => {
    const r = importData(inp.value);
    status.textContent = r.ok ? `가져왔습니다: ${r.imported.join(', ')}` : r.error;
    if (r.ok) { inp.value = ''; refresh(); } else sfx('error');
  };

  const body = h('div', { class: 'set' },
    sec('소리',
      check('muteAll', '전체 음소거'),
      check('sfxOn', '효과음'), slider('sfxVol', '효과음 크기'),
      check('musicOn', '음악'), slider('musicVol', '음악 크기'),
      h('p', { class: 'set__note' }, '음악은 켠 뒤에야 불러옵니다. 탭이 가려지면 소리가 멈춥니다.'),
      canPlayAudio() ? null : h('p', { class: 'set__note', role: 'status' }, '이 기기에서는 소리를 낼 수 없어요')),
    sec('화면',
      check('reduceMotion', '움직임 줄이기'),
      h('p', { class: 'set__note' }, '기기의 "동작 줄이기" 설정과 별개로 켤 수 있습니다. 연출이 빨라지고 도장 확대가 없어집니다.'),
      h('p', { class: 'label' }, '글자 크기'), seg('textSize', [['normal', '보통'], ['large', '크게'], ['xlarge', '아주 크게']], '글자 크기'),
      check('contrast', '색 대비 높임')),
    sec('진행', check('fast', '빠른 진행을 기본으로'), h('p', { class: 'set__note' }, '새 판의 "빠른 진행" 체크 기본값입니다.')),
    sec('데이터 관리',
      confirmBtn('저장 삭제', '이어하기 저장을 지울까요?', clearSave),
      confirmBtn('기록 삭제', '기록과 업적을 모두 지울까요?', clearRecords),
      h('div', { class: 'set__pair' }, h('button', { class: 'btn', type: 'button', onclick: doExport }, '내보내기')), out,
      inp, h('div', { class: 'set__pair' }, h('button', { class: 'btn', type: 'button', onclick: doImport }, '가져오기')), status),
    sec('정보',
      h('div', { class: 'leader' }, h('span', {}, '버전'), h('i'), h('b', { class: 'num' }, VERSION)),
      h('p', {}, h('a', { href: REPO, target: '_blank', rel: 'noopener' }, 'GitHub: sigco3111/order-of-powers')),
      h('h4', { class: 'set__h4' }, '크레딧'),
      h('p', { class: 'set__note' }, '소리·그림·지도는 모두 CC0 또는 퍼블릭 도메인입니다.'),
      h('dl', { class: 'set__credits' }, CREDITS.flatMap(([a, b]) => [h('dt', {}, a), h('dd', {}, b)])),
      h('p', {}, h('a', { href: `${REPO}/blob/main/docs/ASSETS.md`, target: '_blank', rel: 'noopener' }, '에셋 전체 목록 (docs/ASSETS.md)'))));
  return openSheet('설정', body);
}
