// 세계 지도 컴포넌트: world-regions.svg를 인라인으로 넣고 8개 지역을 버튼으로 만든다.
// 지역 색은 종이색 바탕 + 주도 세력 해칭, 영향력은 세력당 사각 칩 하나(2×2 묶음). 칩·라벨은 지도 위의 HTML 층이라
// 확대해도 크기가 같고, 겹치면 화면 좌표에서 서로 밀어내며 점선 리더로 지역 위치를 가리킨다.
import { h, icon } from './dom.js';
import { regionLeaders } from '../engine/score.js';

const VB = { x: 60, y: 30, w: 950, h: 455 };           // 땅이 있는 부분만 자른 viewBox
export const SHORT = { // 좁은 화면용 짧은 이름 / 넓은 화면용 이름
  northAmerica: ['북미', '북아메리카'], southAmerica: ['남미', '남아메리카'], europe: ['유럽', '유럽'],
  russiaCentralAsia: ['러·중앙아', '러시아·중앙아시아'], middleEastNorthAfrica: ['중동', '중동·북아프리카'],
  subSaharanAfrica: ['아프리카', '사하라 이남'], eastAsia: ['동아시아', '동아시아'], southAsiaOceania: ['남아·대양', '남아시아·오세아니아'],
};
/** 라벨 묶음 시작 위치 보정(px, T=22 기준): 북미·남미는 육지 한가운데라 라벨이 지도 그림을 덮으므로 바다 쪽으로 미리 밀어 둔다 */
export const LABEL_NUDGE = { northAmerica: [-16, -36], southAmerica: [-34, 34], eastAsia: [10, 4] };
const NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs = {}, ...kids) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); e.append(...kids); return e; };
let svgText;
const loadSvg = () => (svgText ??= fetch(new URL('../../assets/map/world-regions.svg', import.meta.url)).then((r) => { if (!r.ok) throw new Error('지도를 불러오지 못했습니다'); return r.text(); }));

/** 지역 상태: 'lead'(단독 주도) | 'shared'(조약 공동 주도) | 'contested'(동률·경합) | 'free'(아무도 없음) */
export function regionStatus(state, rid, leaders = regionLeaders(state)) {
  const inf = state.regions[rid].influence, any = Object.values(inf).some((n) => n > 0), l = leaders[rid];
  if (l.length === 1) return { kind: 'lead', factions: l };
  if (l.length > 1) return { kind: 'shared', factions: l };
  return { kind: any ? 'contested' : 'free', factions: [] };
}

function patterns(ids) {
  const css = getComputedStyle(document.documentElement), col = (f) => css.getPropertyValue(`--f-${f}`).trim() || '#1B2230';
  const ink = css.getPropertyValue('--ink').trim(), paper = css.getPropertyValue('--paper-light').trim();
  const tile = (id, ...parts) => svgEl('pattern', { id, width: 8, height: 8, patternUnits: 'userSpaceOnUse' }, svgEl('rect', { width: 8, height: 8, fill: paper }), ...parts);
  const rect = (c) => svgEl('rect', { width: 8, height: 8, fill: c, 'fill-opacity': '.35' });
  const line = (c, a, w = 1.5, o = 1) => svgEl('path', { d: a ? 'M-1 9L9 -1M-1 1L1 -1M7 9L9 7' : 'M-1 -1L9 9M7 -1L9 1M-1 7L1 9', stroke: c, 'stroke-width': w, 'stroke-opacity': o, fill: 'none' });
  const defs = svgEl('defs');
  for (const f of ids) defs.append(tile(`pat-${f}`, rect(col(f)), line(col(f), true, 1.7)));
  ids.forEach((a, i) => ids.slice(i + 1).forEach((b) => defs.append(tile(`pat-${a}-${b}`, rect(col(a)), line(col(a), true, 1.6), line(col(b), false, 1.6)))));
  defs.append(tile('pat-contested', line(ink, true, 1.1, .7), line(ink, false, 1.1, .7)));
  return defs;
}

/** createMap({ data, onSelect }) → { el, update({ state, selected, candidates }), destroy() } */
export async function createMap({ data, onSelect }) {
  const regions = data.regions, byId = Object.fromEntries(regions.map((r) => [r.id, r]));
  const doc = new DOMParser().parseFromString(await loadSvg(), 'image/svg+xml').documentElement;
  const svg = svgEl('svg', { viewBox: `${VB.x} ${VB.y} ${VB.w} ${VB.h}`, class: 'map__svg', 'aria-hidden': 'false', focusable: 'false' });
  const paths = {};
  const land = svgEl('g', { class: 'map__land' });
  for (const r of regions) {
    const src = doc.querySelector(`#${r.id}`), p = svgEl('path', { d: src.getAttribute('d'), class: 'region', 'data-region': r.id, role: 'button', tabindex: '0', 'aria-pressed': 'false' });
    paths[r.id] = p; land.append(p);
  }
  const sel = svgEl('path', { class: 'map__sel', fill: 'none' }), cand = svgEl('g', { class: 'map__cands' });
  svg.append(land, cand, sel);

  const world = h('div', { class: 'map__world' }, svg);
  const links = svgEl('svg', { class: 'map__links', 'aria-hidden': 'true' });
  const nodesEl = h('div', { class: 'map__nodes' });
  const stage = h('div', { class: 'map__stage' }, world, links, nodesEl);
  const nodes = {};
  for (const r of regions) {
    nodes[r.id] = { el: h('div', { class: 'node', 'data-region': r.id, 'aria-hidden': 'true' }, h('span', { class: 'node__label' }), h('div', { class: 'node__tok' })), w: 0, h: 0, x: 0, y: 0 };
    nodesEl.append(nodes[r.id].el);
  }
  const btn = (label, name, fn, ic) => h('button', { class: 'map__btn', type: 'button', 'aria-label': label, title: label, onclick: fn }, ic ? icon(ic) : name);
  const ctl = h('div', { class: 'map__ctl', role: 'group', 'aria-label': '지도 확대' },
    btn('확대', null, () => zoomBy(1.6), 'assets/icons/kenney-game-icons/plus.png'),
    btn('축소', null, () => zoomBy(1 / 1.6), 'assets/icons/kenney-game-icons/minus.png'),
    btn('지도 맞춤', '맞춤', () => reset()));
  const el = h('div', { class: 'map', role: 'group', 'aria-label': '세계 지도' }, stage, ctl);

  // ── 상태 ──
  let st = null, selected = null, candidates = [], factions = [];
  let W = 0, H = 0, k0 = 1, z = 1, tx = 0, ty = 0, T = 22, compact = true, laid = {};
  const worldW = () => VB.w * k0 * z, worldH = () => VB.h * k0 * z;
  const clampPan = () => {
    tx = worldW() <= W ? (W - worldW()) / 2 : Math.min(0, Math.max(W - worldW(), tx));
    ty = worldH() <= H ? (H - worldH()) / 2 : Math.min(0, Math.max(H - worldH(), ty));
  };
  const toWorld = (a) => [(a.x - VB.x) * k0 * z, (a.y - VB.y) * k0 * z];

  // 칩 묶음/라벨 상자 크기를 정하고 겹침을 푼다 (세계 좌표, 팬 이전)
  function relayout() {
    if (!W) return;
    const G = compact ? 4 : 6, lh = compact ? 14 : 17, cw = 2 * T + G, ch = 2 * T + G;
    const items = regions.map((r) => {
      const [ax, ay] = toWorld(r.mapAnchor), name = SHORT[r.id][compact ? 0 : 1];
      const lw = name.length * (compact ? 10.5 : 13) + 6;
      const [nx, ny] = (LABEL_NUDGE[r.id] || [0, 0]).map((v) => v * T / 22);
      return { id: r.id, ax, ay, w: Math.max(cw, lw), h: ch + lh + 2, lh, cy: ay - (lh + 2) / 2 + ny, cx: ax + nx };
    });
    const m = 4, padY = z === 1 ? Math.max(0, (H - worldH()) / 2) : 6;
    for (let it = 0; it < 120; it++) {
      let moved = false;
      for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
        const a = items[i], b = items[j], dx = b.cx - a.cx, dy = b.cy - a.cy;
        const ox = (a.w + b.w) / 2 + m - Math.abs(dx), oy = (a.h + b.h) / 2 + m - Math.abs(dy);
        if (ox <= 0 || oy <= 0) continue;
        moved = true;
        if (ox < oy) { const s = (dx >= 0 ? 1 : -1) * ox / 2; a.cx -= s; b.cx += s; } else { const s = (dy >= 0 ? 1 : -1) * oy / 2; a.cy -= s; b.cy += s; }
      }
      for (const a of items) { // 지도 영역 밖으로 나가지 않게, 확대·축소 버튼(오른쪽 위) 아래로도 안 들어가게
        a.cx = Math.min(worldW() - a.w / 2, Math.max(a.w / 2, a.cx));
        a.cy = Math.min(worldH() + padY - a.h / 2, Math.max(a.h / 2 - padY, a.cy));
        if (z === 1) {
          if (compact) a.cy = Math.max(a.cy, 56 - ty + a.h / 2); // 버튼은 위쪽 가로 한 줄
          else if (a.cy - a.h / 2 < 156 - ty) a.cx = Math.min(a.cx, W - tx - 58 - a.w / 2); // 버튼은 오른쪽 세로 한 줄
        }
      }
      if (!moved) break;
    }
    laid = {};
    for (const a of items) {
      const n = nodes[a.id];
      n.el.style.cssText = `width:${a.w}px;height:${a.h}px;--T:${T}px;--G:${G}px;--lh:${a.lh}px`;
      n.el.firstChild.textContent = SHORT[a.id][compact ? 0 : 1];
      laid[a.id] = { x: a.cx - a.w / 2, y: a.cy - a.h / 2, ax: a.ax, ay: a.ay, cx: a.cx, cy: a.cy + (a.lh + 2) / 2, w: a.w, h: a.h };
    }
    paint();
  }

  function paint() {
    world.style.transform = `translate(${tx}px,${ty}px) scale(${z})`;
    links.replaceChildren();
    for (const r of regions) {
      const L = laid[r.id]; if (!L) continue;
      nodes[r.id].el.style.transform = `translate(${tx + L.x}px,${ty + L.y}px)`;
      const d = Math.hypot(L.cx - L.ax, L.cy - L.ay);
      if (d > T * 0.9) links.append(svgEl('line', { x1: tx + L.ax, y1: ty + L.ay, x2: tx + L.cx, y2: ty + L.cy, class: 'map__leader' }));
      links.append(svgEl('circle', { cx: tx + L.ax, cy: ty + L.ay, r: 3, class: 'map__dot' }));
    }
    stage.style.touchAction = z > 1.01 ? 'none' : 'pan-y';
    stage.dataset.zoom = z.toFixed(2); el.dataset.compact = compact ? '1' : '0';
  }

  function measure() {
    const r = stage.getBoundingClientRect();
    if (!r.width) return;
    W = r.width; H = r.height; k0 = Math.min(W / VB.w, H / VB.h); compact = W < 640; T = W < 460 ? 22 : W < 760 ? 26 : 30;
    world.style.cssText = `width:${VB.w * k0}px;height:${VB.h * k0}px`;
    svg.style.width = '100%'; svg.style.height = '100%';
    stage.style.setProperty('--k', k0 * z);
    clampPan(); relayout();
  }
  function zoomAt(nz, px = W / 2, py = H / 2) {
    nz = Math.min(5, Math.max(1, nz));
    tx = px - (px - tx) * (nz / z); ty = py - (py - ty) * (nz / z); z = nz;
    clampPan(); relayout();
  }
  function zoomBy(f) { zoomAt(z * f); }
  function reset() { z = 1; tx = 0; ty = 0; clampPan(); relayout(); }

  // ── 입력: 끌기/모으기/두 번 누르기 ──
  const ptrs = new Map(); let drag = 0, last = 0, pinch = 0;
  const local = (e) => { const r = stage.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  stage.addEventListener('pointerdown', (e) => {
    ptrs.set(e.pointerId, local(e)); drag = 0;
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); }
  });
  stage.addEventListener('pointermove', (e) => {
    if (!ptrs.has(e.pointerId)) return;
    const [x, y] = local(e), [ox, oy] = ptrs.get(e.pointerId);
    if (ptrs.size === 2) {
      ptrs.set(e.pointerId, [x, y]);
      const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (pinch) { zoomAt(z * d / pinch, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); drag = 9; }
      pinch = d; return;
    }
    if (z <= 1.01) return;
    drag += Math.abs(x - ox) + Math.abs(y - oy);
    if (drag > 6) { stage.setPointerCapture?.(e.pointerId); tx += x - ox; ty += y - oy; clampPan(); paint(); }
    ptrs.set(e.pointerId, [x, y]);
  });
  const up = (e) => { ptrs.delete(e.pointerId); pinch = 0; };
  stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
  stage.addEventListener('wheel', (e) => { if (!(e.ctrlKey || e.metaKey)) return; e.preventDefault(); const [x, y] = local(e); zoomAt(z * (e.deltaY < 0 ? 1.25 : 0.8), x, y); }, { passive: false });
  stage.addEventListener('dblclick', (e) => { e.preventDefault(); const [x, y] = local(e); z > 1.5 ? reset() : zoomAt(z * 2.2, x, y); });
  stage.addEventListener('click', (e) => {
    if (drag > 6) { drag = 0; return; }
    const id = e.target.closest?.('[data-region]')?.dataset.region;
    if (id) onSelect?.(id);
  });
  stage.addEventListener('keydown', (e) => {
    const id = e.target.dataset?.region;
    if (id && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onSelect?.(id); }
    if (e.key === '+' || e.key === '=') zoomBy(1.6); else if (e.key === '-') zoomBy(1 / 1.6); else if (e.key === '0') reset();
  });

  // ── 그리기 ──
  function update({ state, selected: s, candidates: c = [], hint = null, fx = null }) {
    st = state; selected = s; candidates = c;
    if (state) {
      factions = state.turnOrder;
      if (!svg.querySelector('defs')) svg.prepend(patterns(factions.slice().sort()));
      const leaders = regionLeaders(state), ix = Object.fromEntries(data.factions.map((f) => [f.id, f.name]));
      for (const r of regions) {
        const rs = state.regions[r.id], stt = regionStatus(state, r.id, leaders), p = paths[r.id], n = nodes[r.id];
        const fill = stt.kind === 'lead' ? `url(#pat-${stt.factions[0]})` : stt.kind === 'shared' ? `url(#pat-${stt.factions.slice().sort().join('-')})` : stt.kind === 'contested' ? 'url(#pat-contested)' : '';
        p.style.fill = fill; p.dataset.status = stt.kind;
        const inf = factions.filter((f) => rs.influence[f] > 0).map((f) => `${ix[f]} ${rs.influence[f]}`).join(', ') || '영향력 없음';
        p.setAttribute('aria-label', `${byId[r.id].name}, ${stt.kind === 'lead' ? '주도 ' + ix[stt.factions[0]] : stt.kind === 'shared' ? '공동 주도' : stt.kind === 'contested' ? '경합' : '주도 없음'}, ${inf}`);
        const on = Array.isArray(selected) ? selected.includes(r.id) : selected === r.id;
        p.setAttribute('aria-pressed', String(on));
        n.el.classList.toggle('is-sel', on);
        n.el.classList.toggle('is-cand', candidates.includes(r.id));
        const rfx = fx?.[r.id];
        p.classList.toggle('is-flash', !!rfx); n.el.classList.toggle('is-flash', !!rfx);
        n.el.querySelector('.node__tok').replaceChildren(...factions.map((f) => {
          const v = rs.influence[f], ch = rfx?.[f]?.find((c) => c.kind === 'influence');
          if (!v && ch) return h('span', { class: `tok tok--${f} tok--gone`, title: `${ix[f]} 영향력 ${ch.prev} → 0` }, String(ch.prev)); // 사라진 토큰: 취소선 + 흐려짐
          if (!v) return h('span', { class: `tok tok--empty tok--${f}` });
          return h('span', { class: `tok tok--${f}${stt.factions.includes(f) ? ' tok--lead' : ''}${ch ? (ch.dir === 'up' ? ' tok--new' : ' tok--hit') : ''}`, title: `${ix[f]} 영향력 ${v}${rs.bases[f] ? ' · 기지' : ''}` }, String(v), rs.bases[f] ? h('i', { class: 'tok__base' }) : null);
        }));
      }
    }
    const d = (Array.isArray(selected) ? selected : [selected]).map((id) => id && paths[id]?.getAttribute('d')).filter(Boolean).join(' ') || null;
    sel.setAttribute('d', d || ''); sel.style.display = d ? '' : 'none';
    for (const [id, p] of Object.entries(paths)) p.classList.toggle('is-cand', candidates.includes(id));
    cand.replaceChildren();
    el.dataset.hint = hint || '';
  }

  const ro = new ResizeObserver(() => measure());
  ro.observe(stage);
  requestAnimationFrame(measure);
  return { el, update, destroy: () => ro.disconnect(), reset, get zoom() { return z; }, zoomBy, layout: () => laid };
}
