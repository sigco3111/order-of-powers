// 아주 작은 DOM 도우미: h('div', { class: 'a', onclick }, '글', node)
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k in el && k !== 'list') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  el.append(...kids.flat().filter((c) => c != null && c !== false));
  return el;
}

/** 단색 마스크 아이콘 (assets/ 의 CC0 PNG) */
export const icon = (path) => h('span', { class: 'icon', 'aria-hidden': 'true', style: `--src:url(${new URL('../../' + path, import.meta.url).href})` });

/** 모달 시트. 닫기/Esc/바깥 클릭으로 닫히고 포커스를 돌려준다 */
export function openSheet(title, body) {
  const from = document.activeElement;
  const close = () => { back.remove(); document.removeEventListener('keydown', onKey); from?.focus?.(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const x = h('button', { class: 'btn btn--sm', onclick: close }, '닫기');
  const back = h('div', { class: 'sheet-backdrop', onclick: (e) => e.target === back && close() },
    h('section', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('div', { class: 'sheet__head' }, h('h2', { style: 'font-size:1.25rem' }, title), x),
      h('div', { class: 'sheet__body' }, body)));
  document.body.append(back);
  document.addEventListener('keydown', onKey);
  x.focus();
  return close;
}
