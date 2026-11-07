// 소리 관리자: 첫 사용자 동작 뒤에 켜지고, 어떤 실패에도 던지지 않는다 (Web Audio 효과음 + HTMLAudio 음악).
// 효과음은 켜졌을 때만 받아 디코딩하고, 음악은 음악이 켜진 뒤에야 불러온다.
import { current } from './settings.js';

export const FADE_MS = 1200;
let A_support = () => true;
/** 이 기기에서 소리 파일(ogg 또는 mp3)을 읽을 수 있는가 (설정 화면 안내용) */
export const canPlayAudio = () => { try { return A_support(); } catch { return true; } };
const safe = (fn) => { try { return fn(); } catch { return undefined; } };

export function createAudio({ settings = () => current, map = null, base = '', fetchFn = globalThis.fetch?.bind(globalThis), AudioCtx = globalThis.AudioContext || globalThis.webkitAudioContext, AudioEl = globalThis.Audio, doc = globalThis.document, tick = 50 } = {}) {
  let ctx = null, master = null, unlocked = false, wanted = null, cur = null, clickTimer = 0;
  const bufs = new Map(), music = new Map(), fading = new Set();
  const A = { get unlocked() { return unlocked; }, get state() { return ctx?.state ?? 'none'; }, get track() { return cur?.name ?? null; }, bufs, setMap(m) { map = m; } };
  // 일부 iPhone은 ogg(vorbis)를 못 읽는다: canPlayType이 ''이면 mp3 파일로 대체한다 (한 번만 확인)
  let mp3 = null;
  const needMp3 = () => (mp3 ??= safe(() => { const a = doc?.createElement?.('audio'); return typeof a?.canPlayType === 'function' && a.canPlayType('audio/ogg; codecs=vorbis') === ''; }) ?? false);
  const url = (f, d) => base + (map?.base ?? '') + (d && needMp3() && d.mp3 ? d.mp3 : f);
  A_support = () => safe(() => { const a = doc?.createElement?.('audio'); if (typeof a?.canPlayType !== 'function') return true; return a.canPlayType('audio/ogg; codecs=vorbis') !== '' || a.canPlayType('audio/mpeg') !== ''; }) ?? true;
  const sfxOn = () => { const s = settings(); return s.sfxOn && !s.muteAll && s.sfxVol > 0; };
  const musicVol = (name) => { const s = settings(); return s.musicOn && !s.muteAll ? (s.musicVol / 100) * (map?.music?.[name]?.volume ?? 1) : 0; };

  function load(name) { // 소리 하나를 받아 디코딩. 실패하면 null을 기억해 다시 시도하지 않는다
    if (bufs.has(name)) return bufs.get(name);
    const def = map?.sfx?.[name];
    const p = !def || !ctx || !fetchFn ? Promise.resolve(null)
      : Promise.resolve().then(() => fetchFn(url(def.file, def))).then((r) => (r && r.ok ? r.arrayBuffer() : null))
        .then((ab) => (ab ? new Promise((res) => { const r = ctx.decodeAudioData(ab, res, () => res(null)); r?.then?.(res, () => res(null)); }) : null)).catch(() => null);
    bufs.set(name, p); return p;
  }
  function preload() { if (map && sfxOn()) for (const n of Object.keys(map.sfx)) load(n); }

  /** 첫 사용자 동작에서 부른다. 이미 열렸으면 상태만 이어 붙인다 */
  A.unlock = () => {
    if (!unlocked) {
      unlocked = true;
      safe(() => { if (AudioCtx) { ctx = new AudioCtx(); master = ctx.createGain(); master.connect(ctx.destination); } });
    }
    safe(() => ctx?.state === 'suspended' && ctx.resume()?.catch?.(() => {}));
    preload(); A.refresh();
  };

  /** 효과음 하나. 아직 못 받았으면 건너뛴다 (UI를 막지 않는다) */
  A.play = (name, o = {}) => {
    safe(() => {
      if (name !== 'click') { clearTimeout(clickTimer); clickTimer = 0; }
      const def = map?.sfx?.[name];
      if (!unlocked || !ctx || !def || !sfxOn() || doc?.hidden) return;
      const p = load(name);
      p.then((buf) => {
        if (!buf || !sfxOn() || ctx.state === 'closed') return;
        safe(() => {
          const src = ctx.createBufferSource(), g = ctx.createGain();
          src.buffer = buf; src.playbackRate.value = (o.rate ?? def.rate ?? 1) * (o.detune ? 1 + o.detune : 1);
          g.gain.value = (settings().sfxVol / 100) * (def.volume ?? 1) * (o.volume ?? 1);
          src.connect(g); g.connect(master); src.start(0);
        });
      }).catch(() => {});
    });
  };
  /** 일반 단추 클릭음: 같은 순간에 더 알맞은 소리가 나오면 취소된다 */
  A.click = () => { safe(() => { clearTimeout(clickTimer); clickTimer = setTimeout(() => { clickTimer = 0; A.play('click'); }, 0); }); };

  // ── 음악 ──
  function track(name) {
    if (music.has(name)) return music.get(name);
    const def = map?.music?.[name]; if (!def || !AudioEl) return null;
    const el = safe(() => { const a = new AudioEl(url(def.file, def)); a.loop = true; a.preload = 'none'; a.volume = 0; a.addEventListener?.('error', () => { t.failed = true; }); return a; });
    const t = el ? { name, el, vol: 0, goal: 0, failed: false } : null;
    music.set(name, t); return t;
  }
  let timer = 0;
  function step() {
    for (const t of fading) {
      const d = tick / FADE_MS; // 1.2초에 0↔1
      t.vol = t.goal > t.vol ? Math.min(t.goal, t.vol + d) : Math.max(t.goal, t.vol - d);
      safe(() => { t.el.volume = Math.min(1, Math.max(0, t.vol)); });
      if (t.vol === t.goal) { fading.delete(t); if (t.goal === 0) safe(() => t.el.pause()); }
    }
    if (!fading.size) { clearInterval(timer); timer = 0; }
  }
  function fade(t, goal) { t.goal = goal; fading.add(t); if (!timer) timer = setInterval(step, tick); }

  /** 원하는 곡을 알린다 (null이면 없음). 실제 재생은 refresh가 설정·제스처·탭 가시성에 맞춰 정한다 */
  A.setMusic = (name) => { wanted = name; A.refresh(); };
  A.refresh = () => {
    safe(() => {
      const want = unlocked && !doc?.hidden && wanted && musicVol(wanted) > 0 ? wanted : null;
      if (cur && (cur.name !== want || cur.failed)) { fade(cur, 0); cur = null; }
      for (const t of music.values()) if (t !== cur && !fading.has(t) && t.vol > 0) fade(t, 0);
      if (!want) return;
      const t = track(want); if (!t || t.failed) return;
      cur = t;
      if (t.el.paused) { const p = safe(() => t.el.play()); p?.catch?.(() => { t.failed = true; }); }
      fade(t, musicVol(want));
    });
  };
  /** 탭이 숨겨지면 모두 멈추고, 돌아오면 이어서 */
  A.onVisibility = () => {
    safe(() => {
      if (doc?.hidden) { for (const t of music.values()) safe(() => t.el.pause()); fading.clear(); for (const t of music.values()) t.vol = 0; cur = null; safe(() => ctx?.suspend?.()?.catch?.(() => {})); }
      else { safe(() => ctx?.resume?.()?.catch?.(() => {})); A.refresh(); }
    });
  };
  safe(() => doc?.addEventListener?.('visibilitychange', A.onVisibility));
  return A;
}

// ── 앱 전체에서 쓰는 하나뿐인 관리자 ──
let shared = null;
export function getAudio() {
  if (!shared) {
    shared = createAudio({ base: new URL('../../', import.meta.url).href });
    safe(() => fetch(new URL('./sounds.json', import.meta.url)).then((r) => r.json()).then((m) => { shared.setMap(m); if (shared.unlocked) shared.unlock(); }).catch(() => {}));
  }
  return shared;
}
export const sfx = (name, o) => safe(() => getAudio().play(name, o));
export const clickSfx = () => safe(() => getAudio().click());
export const setMusic = (name) => safe(() => getAudio().setMusic(name));
/** 첫 사용자 동작(포인터·터치·클릭·키)에서 소리를 연다. 문맥이 실제로 돌기 시작하면 감시를 끝낸다 */
export function armOnGesture(doc = globalThis.document) {
  const EV = ['pointerdown', 'touchend', 'click', 'keydown'];
  const go = () => {
    safe(() => getAudio().unlock());
    setTimeout(() => { if (safe(() => getAudio().state) !== 'suspended') for (const e of EV) doc.removeEventListener(e, go, true); }, 300);
  };
  for (const e of EV) doc.addEventListener(e, go, true);
}
