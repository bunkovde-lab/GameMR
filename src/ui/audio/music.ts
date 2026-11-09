/**
 * Фоновая музыка (AUDIO v1): тема меню и фон игры.
 *
 * - Браузеры не дают запускать звук без действия игрока, поэтому музыка стартует с первого касания/клика/клавиши.
 *   До этого игра работает как обычно — звук ничего не блокирует и не задерживает игровой цикл.
 * - Смена сцены (меню ↔ игра) — плавный переход: старый трек затухает, новый нарастает, оба на полной громкости не звучат.
 * - Повтор: треки не бесшовные (в конце затухание, в начале тихое вступление), поэтому за OVERLAP_S до конца
 *   запускается вторая копия трека с начала и они плавно перетекают друг в друга.
 * - Громкость и выключение сохраняются в браузере. На iPhone/iPad свойство volume у <audio> не работает —
 *   там громкость задаётся через Web Audio (узел усиления).
 * - Когда вкладка скрыта (свернули браузер, заблокировали телефон), музыка ставится на паузу.
 */
import menuUrl from '../../../assets/audio/menu_theme.mp3';
import gameUrl from '../../../assets/audio/gameplay_ambient.mp3';

export type MusicScene = 'menu' | 'game';
export interface MusicSettings { volume: number; muted: boolean }

/** Минимум от HTMLAudioElement, нужный движку (для тестов подставляется заглушка). */
export interface AudioLike {
  src: string;
  preload: string;
  currentTime: number;
  readonly duration: number;
  readonly paused: boolean;
  readonly ended: boolean;
  volume: number;
  muted: boolean;
  play(): Promise<void> | void;
  pause(): void;
}

export interface MusicEnv {
  createAudio(url: string): AudioLike;
  /** Web Audio — только там, где volume у <audio> не меняется (iOS). */
  createContext?: () => AudioContext | null;
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null;
}

export const SCENE_FADE_S = 2.5;
export const OVERLAP_S = 4;
const MASTER_FADE_S = 0.35;
export const SETTINGS_KEY = 'gamemr-music';
export const DEFAULT_SETTINGS: MusicSettings = { volume: 0.6, muted: false };
const TRACK_URL: Record<MusicScene, string> = { menu: menuUrl, game: gameUrl };

interface Voice {
  el: AudioLike;
  gain: GainNode | null;
  level: number;
  target: number;
  /** Скорость изменения level в секунду */
  rate: number;
  started: boolean;
  /** Элемент уже хотя бы раз запускался по действию игрока (Safari/iOS разрешают звук каждому элементу отдельно) */
  primed: boolean;
  /** Браузер отказал в запуске — ждём следующего действия игрока */
  blocked: boolean;
}

interface Track { scene: MusicScene; voices: [Voice, Voice]; current: 0 | 1; handedOver: boolean }

export interface MusicSnapshot {
  settings: MusicSettings;
  scene: MusicScene | null;
  /** Ждём первого действия игрока (ограничение автозапуска) */
  waitingForGesture: boolean;
  /** Сцена, которая реально звучит сейчас (громкость > 0) */
  audible: MusicScene | null;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export class MusicEngine {
  private settings: MusicSettings;
  private scene: MusicScene | null = null;
  private unlocked = false;
  /** Браузер хотя бы раз реально запустил звук */
  private confirmed = false;
  private autoplayTried = false;
  private hidden = false;
  private master = 0;
  private tracks = new Map<MusicScene, Track>();
  private ctx: AudioContext | null = null;
  private useWebAudio: boolean | null = null;
  private listeners = new Set<() => void>();
  private snapshot: MusicSnapshot;

  constructor(private env: MusicEnv) {
    this.settings = this.loadSettings();
    this.snapshot = this.makeSnapshot();
  }

  // ——— публичное API ———

  getSettings(): MusicSettings { return this.settings; }
  getSnapshot = (): MusicSnapshot => this.snapshot;
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };

  setScene(scene: MusicScene | null) {
    if (scene === this.scene) return;
    this.scene = scene;
    for (const t of this.tracks.values()) {
      if (t.scene !== scene) for (const v of t.voices) this.fadeTo(v, 0, SCENE_FADE_S);
    }
    if (scene && this.unlocked) this.startScene(scene);
    else if (scene && !this.autoplayTried) {
      // Пробуем автозапуск один раз: если браузер разрешает (например, сайт уже знаком ему), музыка начнётся сразу,
      // иначе play() откажет и музыка включится с первого действия игрока.
      this.autoplayTried = true;
      this.unlock(false);
      return;
    }
    this.emit();
  }

  setVolume(volume: number) {
    this.settings = { ...this.settings, volume: clamp01(volume) };
    this.persist();
    this.wake();
    this.emit();
  }

  setMuted(muted: boolean) {
    this.settings = { ...this.settings, muted };
    this.persist();
    // Включение — действие игрока, значит звук уже разрешён браузером.
    if (!muted) this.unlock();
    this.wake();
    this.emit();
  }

  /**
   * Вызывается из обработчика действия игрока (клик, касание, клавиша); fromGesture=false — попытка автозапуска.
   * Safari и iPhone разрешают звук каждому <audio> отдельно и только внутри действия игрока, поэтому здесь
   * «прогреваются» все элементы обеих сцен — иначе фон игры, включаемый позже, браузер молча заблокирует.
   */
  unlock(fromGesture = true) {
    this.unlocked = true;
    this.prepareWebAudio();
    if (fromGesture) {
      for (const t of this.tracks.values()) for (const v of t.voices) v.blocked = false;
      this.prime();
    }
    if (this.scene) this.startScene(this.scene);
    this.emit();
  }

  /** Нужны ли ещё действия игрока, чтобы браузер разрешил весь звук. */
  needsGesture(): boolean {
    if (!this.confirmed) return true;
    for (const t of this.tracks.values()) for (const v of t.voices) if (!v.primed || v.blocked) return true;
    return false;
  }

  setHidden(hidden: boolean) {
    if (hidden === this.hidden) return;
    this.hidden = hidden;
    if (hidden) {
      for (const t of this.tracks.values()) for (const v of t.voices) if (!v.el.paused) v.el.pause();
      void this.ctx?.suspend?.().catch(() => {});
    } else {
      void this.ctx?.resume?.().catch(() => {});
      for (const t of this.tracks.values()) for (const v of t.voices) if (v.started && (v.level > 0 || v.target > 0)) this.play(v);
    }
  }

  /** Шаг затуханий и проверка конца трека; dt — в секундах. */
  step(dt: number) {
    if (this.hidden) return;
    const masterTarget = this.settings.muted ? 0 : this.settings.volume;
    this.master = approach(this.master, masterTarget, dt / MASTER_FADE_S);

    for (const t of this.tracks.values()) {
      if (t.scene === this.scene && this.unlocked) this.checkLoop(t);
      for (const v of t.voices) {
        v.level = approach(v.level, v.target, dt * v.rate);
        this.apply(v);
        const silent = (v.level === 0 && v.target === 0) || (this.master === 0 && this.settings.muted);
        if (silent && !v.el.paused) v.el.pause();
        if (!silent && v.started && !v.blocked && v.el.paused && !v.el.ended && this.unlocked) this.play(v);
      }
    }
    const before = this.snapshot.audible;
    if (this.audibleScene() !== before) this.emit();
  }

  /** Есть ли незавершённые затухания или играющие треки (нужен ли таймер). */
  isBusy(): boolean {
    if (this.master !== (this.settings.muted ? 0 : this.settings.volume)) return true;
    for (const t of this.tracks.values()) for (const v of t.voices) if (!v.el.paused || v.level !== v.target) return true;
    return false;
  }

  /** Будит внешний таймер (см. installMusic). */
  onWake: () => void = () => {};

  // ——— внутреннее ———

  private startScene(scene: MusicScene) {
    const t = this.track(scene);
    const v = t.voices[t.current];
    // Возврат в сцену, которая ещё затухает: просто нарастить её снова, без перезапуска с начала.
    // Возврат в сцену после паузы — продолжаем с того же места, а не с начала.
    if (!v.started) {
      v.el.currentTime = 0;
      v.started = true;
      t.handedOver = false;
    }
    this.fadeTo(v, 1, SCENE_FADE_S);
    this.play(v);
    this.wake();
  }

  private prime() {
    this.track('menu');
    this.track('game');
    for (const t of this.tracks.values()) {
      for (const v of t.voices) {
        if (v.primed || !v.el.paused) continue;
        const el = v.el;
        el.muted = true;
        try {
          const p = el.play();
          const done = (ok: boolean) => {
            if (!(v.started && v.target > 0 && !this.hidden)) {
              el.pause();
              if (!v.started) el.currentTime = 0;
            }
            el.muted = false;
            if (ok && !v.primed) { v.primed = true; this.emit(); }
          };
          if (p && typeof p.then === 'function') p.then(() => done(true), () => done(false));
          else done(true);
        } catch { el.muted = false; }
      }
    }
  }

  private checkLoop(t: Track) {
    const cur = t.voices[t.current];
    const d = cur.el.duration;
    if (!cur.started || !Number.isFinite(d) || d <= OVERLAP_S * 2) return;
    if (!t.handedOver && cur.el.currentTime >= d - OVERLAP_S) {
      t.handedOver = true;
      const next = t.voices[t.current === 0 ? 1 : 0];
      next.el.currentTime = 0;
      next.started = true;
      next.level = 0;
      this.fadeTo(next, cur.target > 0 ? 1 : 0, OVERLAP_S);
      this.fadeTo(cur, 0, OVERLAP_S);
      cur.started = false; // доигрывает затухание и больше не перезапускается
      this.play(next);
      t.current = t.current === 0 ? 1 : 0;
      // Старая копия доиграет затухание сама и встанет на паузу.
    }
    // Новая копия ушла от начала — можно снова ждать конца.
    const now = t.voices[t.current];
    if (t.handedOver && now.el.currentTime > OVERLAP_S && now.el.currentTime < (now.el.duration || Infinity) - OVERLAP_S) t.handedOver = false;
  }

  private track(scene: MusicScene): Track {
    let t = this.tracks.get(scene);
    if (!t) {
      const mk = (): Voice => {
        const el = this.env.createAudio(TRACK_URL[scene]);
        el.preload = 'auto';
        return { el, gain: this.connect(el), level: 0, target: 0, rate: 1, started: false, primed: false, blocked: false };
      };
      t = { scene, voices: [mk(), mk()], current: 0, handedOver: false };
      this.tracks.set(scene, t);
    }
    return t;
  }

  private prepareWebAudio() {
    if (this.ctx) { void this.ctx.resume?.().catch(() => {}); return; }
    if (this.useWebAudio !== null || !this.env.createContext) { this.useWebAudio ??= false; return; }
    // Проверяем, слушается ли <audio> свойства volume (на iOS — нет).
    const probe = this.env.createAudio('');
    probe.volume = 0.5;
    this.useWebAudio = Math.abs(probe.volume - 0.5) > 0.01;
    if (this.useWebAudio) {
      try { this.ctx = this.env.createContext(); } catch { this.ctx = null; }
      if (!this.ctx) this.useWebAudio = false;
      else {
        // iPhone: звук через Web Audio по умолчанию глушится переключателем «Без звука»; обычный <audio> — нет.
        // Делаем поведение одинаковым: музыка подчиняется громкости телефона, как видео.
        try {
          const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
          if (session) session.type = 'playback';
        } catch { /* нет в этом браузере */ }
        void this.ctx.resume?.().catch(() => {});
        for (const t of this.tracks.values()) for (const v of t.voices) v.gain ??= this.connect(v.el);
      }
    }
  }

  private connect(el: AudioLike): GainNode | null {
    if (!this.ctx || !this.useWebAudio) return null;
    try {
      const src = this.ctx.createMediaElementSource(el as unknown as HTMLMediaElement);
      const g = this.ctx.createGain();
      g.gain.value = 0;
      src.connect(g).connect(this.ctx.destination);
      return g;
    } catch {
      return null;
    }
  }

  private fadeTo(v: Voice, target: number, seconds: number) {
    v.target = target;
    v.rate = 1 / Math.max(0.05, seconds);
    this.wake();
  }

  private apply(v: Voice) {
    // Квадратичная кривая: ползунок громкости воспринимается равномерно.
    const out = clamp01(this.master * this.master * v.level);
    if (v.gain) {
      v.gain.gain.value = out;
      if (v.el.volume !== 1) v.el.volume = 1;
    } else if (Math.abs(v.el.volume - out) > 0.001) {
      v.el.volume = out;
    }
  }

  private play(v: Voice) {
    if (this.hidden || (this.settings.muted && this.master === 0)) return;
    this.apply(v);
    try {
      const p = v.el.play();
      if (p && typeof p.then === 'function') {
        p.then(
          () => {
            v.primed = true;
            if (!this.confirmed) this.confirmed = true;
            this.emit();
          },
          (e: unknown) => {
            // Браузер не дал запустить звук — ждём следующего действия игрока.
            if ((e as { name?: string })?.name === 'NotAllowedError') {
              v.blocked = true;
              if (!this.confirmed) this.unlocked = false;
              this.emit();
            }
          },
        );
      }
    } catch { /* среда без поддержки звука */ }
  }

  private wake() { this.onWake(); }

  private audibleScene(): MusicScene | null {
    if (this.master === 0) return null;
    let best: MusicScene | null = null;
    let lvl = 0;
    for (const t of this.tracks.values()) for (const v of t.voices) if (!v.el.paused && v.level > lvl) { lvl = v.level; best = t.scene; }
    return best;
  }

  private makeSnapshot(): MusicSnapshot {
    return { settings: this.settings, scene: this.scene, waitingForGesture: !this.confirmed, audible: this.audibleScene() };
  }

  private emit() {
    this.snapshot = this.makeSnapshot();
    for (const fn of this.listeners) fn();
  }

  private loadSettings(): MusicSettings {
    try {
      const raw = this.env.storage?.getItem(SETTINGS_KEY);
      if (!raw) return DEFAULT_SETTINGS;
      const p = JSON.parse(raw) as Partial<MusicSettings>;
      return {
        volume: typeof p.volume === 'number' ? clamp01(p.volume) : DEFAULT_SETTINGS.volume,
        muted: typeof p.muted === 'boolean' ? p.muted : DEFAULT_SETTINGS.muted,
      };
    } catch {
      return DEFAULT_SETTINGS;
    }
  }

  private persist() {
    try { this.env.storage?.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); } catch { /* не критично */ }
  }
}

function approach(value: number, target: number, maxStep: number) {
  if (value < target) return Math.min(target, value + maxStep);
  if (value > target) return Math.max(target, value - maxStep);
  return value;
}

// ——— единственный экземпляр для приложения ———

let instance: MusicEngine | null = null;

/** Создаёт движок, таймер затуханий и слушатели «первого действия» и скрытия вкладки. */
export function getMusic(): MusicEngine {
  if (instance) return instance;
  const hasAudio = typeof window !== 'undefined' && typeof Audio !== 'undefined' && !/jsdom/i.test(navigator.userAgent);
  const engine = new MusicEngine({
    createAudio: (url) => {
      if (!hasAudio) return silentAudio();
      const a = new Audio();
      if (url) a.src = url;
      return a;
    },
    createContext: () => {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      return Ctx ? new Ctx() : null;
    },
    storage: (() => { try { return window.localStorage; } catch { return null; } })(),
  });
  instance = engine;
  if (!hasAudio) return engine;

  const TICK_MS = 50;
  let timer: number | null = null;
  let last = 0;
  const tick = () => {
    const now = performance.now();
    engine.step(Math.min(0.5, (now - last) / 1000));
    last = now;
    if (!engine.isBusy() && timer !== null) { clearInterval(timer); timer = null; }
  };
  engine.onWake = () => {
    if (timer === null) { last = performance.now(); timer = window.setInterval(tick, TICK_MS); }
  };

  const gesture = () => engine.unlock();
  // pointerdown/touchstart в Safari не считаются разрешающим действием — слушаем отпускание, клик и клавиши.
  const GESTURES = ['pointerup', 'touchend', 'click', 'keydown'] as const;
  let listening = false;
  const sync = () => {
    const need = engine.needsGesture();
    if (need === listening) return;
    listening = need;
    for (const ev of GESTURES) {
      if (need) window.addEventListener(ev, gesture, true);
      else window.removeEventListener(ev, gesture, true);
    }
  };
  sync();
  // Слушаем действия игрока, пока браузер не разрешит звук всем трекам.
  engine.subscribe(sync);
  document.addEventListener('visibilitychange', () => engine.setHidden(document.visibilityState === 'hidden'));
  (window as unknown as { __gamemrMusic?: MusicEngine }).__gamemrMusic = engine;
  return engine;
}

function silentAudio(): AudioLike {
  return { src: '', preload: 'none', currentTime: 0, duration: NaN, paused: true, ended: false, volume: 1, muted: false, play: () => {}, pause: () => {} };
}
