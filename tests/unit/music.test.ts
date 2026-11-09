import { describe, expect, it } from 'vitest';
import { MusicEngine, OVERLAP_S, SCENE_FADE_S, SETTINGS_KEY, type AudioLike } from '../../src/ui/audio/music';

class FakeAudio implements AudioLike {
  src: string;
  preload = '';
  currentTime = 0;
  duration = 200;
  paused = true;
  ended = false;
  muted = false;
  /** Safari: элемент, однажды запущенный по действию игрока, дальше играет без него */
  activated = false;
  private vol = 1;
  allow: () => boolean;
  constructor(url: string, allow: () => boolean, private volumeWritable = true, private perElement = false) { this.src = url; this.allow = allow; }
  get volume() { return this.vol; }
  set volume(v: number) { if (this.volumeWritable) this.vol = v; }
  play() {
    if (!this.activated && !this.allow()) return Promise.reject(Object.assign(new Error('blocked'), { name: 'NotAllowedError' }));
    if (this.perElement) this.activated = true;
    this.paused = false;
    return Promise.resolve();
  }
  pause() { this.paused = true; }
  advance(dt: number) { if (!this.paused) this.currentTime = Math.min(this.duration, this.currentTime + dt); }
}

function setup(opts: { autoplay?: boolean; stored?: string; ios?: boolean; safari?: boolean } = {}) {
  let gesture = !!opts.autoplay;
  const audios: FakeAudio[] = [];
  const store = new Map<string, string>();
  if (opts.stored) store.set(SETTINGS_KEY, opts.stored);
  const gains: { gain: { value: number } }[] = [];
  const ctx = {
    destination: {},
    resume: () => Promise.resolve(),
    suspend: () => Promise.resolve(),
    createMediaElementSource: () => ({ connect: (g: unknown) => g }),
    createGain: () => { const g = { gain: { value: 0 }, connect: () => g }; gains.push(g); return g; },
  };
  const engine = new MusicEngine({
    createAudio: (url) => { const a = new FakeAudio(url, () => gesture, !opts.ios, !!opts.safari); if (url) audios.push(a); return a; },
    createContext: () => ctx as unknown as AudioContext,
    storage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => { store.set(k, v); } },
  });
  const run = (seconds: number, dt = 0.05) => {
    for (let t = 0; t < seconds; t += dt) { audios.forEach((a) => a.advance(dt)); engine.step(dt); }
  };
  const byScene = (s: string) => {
    const list = audios.filter((a) => a.src.includes(s));
    return [list[0]!, list[1]!] as const;
  };
  const flush = () => new Promise((r) => setTimeout(r, 0));
  /** Действие игрока: браузер разрешает звук только во время обработчика (как в Safari). */
  const tap = () => { const was = gesture; gesture = true; engine.unlock(); gesture = was; };
  return { engine, audios, gains, store, run, byScene, flush, tap, grant: () => { gesture = true; } };
}

describe('AUDIO v1: музыка меню и игры', () => {
  it('без действия игрока звук не стартует; после первого нажатия — тема меню', async () => {
    const s = setup();
    s.engine.setScene('menu');
    await s.flush();
    expect(s.engine.getSnapshot().waitingForGesture).toBe(true);
    s.run(1);
    expect(s.audios.every((a) => a.paused)).toBe(true);
    s.grant();
    s.engine.unlock();
    s.run(SCENE_FADE_S + 0.5);
    const menu = s.byScene('menu_theme')[0];
    expect(menu.paused).toBe(false);
    expect(menu.volume).toBeCloseTo(0.36, 2); // 60% по квадратичной кривой
    expect(s.engine.getSnapshot().audible).toBe('menu');
  });

  it('меню → игра: плавный переход, оба трека на полной громкости одновременно не звучат', () => {
    const s = setup({ autoplay: true });
    s.engine.setScene('menu');
    s.run(SCENE_FADE_S + 0.5);
    s.engine.setScene('game');
    let maxSum = 0;
    for (let i = 0; i < 80; i++) {
      s.run(0.05);
      const menu = s.byScene('menu_theme')[0];
      const game = s.byScene('gameplay_ambient')[0];
      const sum = (menu.paused ? 0 : menu.volume) + (game.paused ? 0 : game.volume);
      maxSum = Math.max(maxSum, sum);
    }
    s.run(1);
    expect(maxSum).toBeLessThanOrEqual(0.36 + 1e-6);
    expect([...s.byScene('menu_theme')].every((a) => a.paused)).toBe(true);
    expect(s.byScene('gameplay_ambient')[0].paused).toBe(false);
    expect(s.engine.getSnapshot().audible).toBe('game');
  });

  it('возврат в сцену продолжает трек с того же места', () => {
    const s = setup({ autoplay: true });
    s.engine.setScene('game');
    s.run(30);
    s.engine.setScene('menu');
    s.run(5);
    const game = s.byScene('gameplay_ambient')[0];
    const pausedAt = game.currentTime;
    expect(game.paused).toBe(true);
    s.engine.setScene('game');
    s.run(0.1);
    expect(game.paused).toBe(false);
    expect(game.currentTime).toBeGreaterThanOrEqual(pausedAt);
  });

  it('повтор: перед концом трека запускается вторая копия с начала и треки перетекают', () => {
    const s = setup({ autoplay: true });
    s.engine.setScene('game');
    s.run(200 - OVERLAP_S + 0.2);
    const [a, b] = s.byScene('gameplay_ambient');
    expect(b.paused).toBe(false);
    expect(b.currentTime).toBeLessThan(1);
    s.run(OVERLAP_S + 1);
    expect(a.paused).toBe(true);
    expect(b.volume).toBeCloseTo(0.36, 2);
    // и так по кругу
    s.run(200);
    expect(a.paused).toBe(false);
    expect(a.currentTime).toBeLessThan(10);
  });

  it('выключение и громкость сохраняются и восстанавливаются', () => {
    const s = setup({ autoplay: true });
    s.engine.setScene('menu');
    s.run(3);
    s.engine.setVolume(0.3);
    s.run(1);
    expect(s.byScene('menu_theme')[0].volume).toBeCloseTo(0.09, 2);
    s.engine.setMuted(true);
    s.run(1);
    expect(s.byScene('menu_theme')[0].paused).toBe(true);
    expect(JSON.parse(s.store.get(SETTINGS_KEY)!)).toEqual({ volume: 0.3, muted: true });

    const again = setup({ autoplay: true, stored: s.store.get(SETTINGS_KEY) });
    expect(again.engine.getSettings()).toEqual({ volume: 0.3, muted: true });
    again.engine.setScene('menu');
    again.run(3);
    expect(again.audios.every((a) => a.paused)).toBe(true);
    again.engine.setMuted(false);
    again.run(3);
    expect(again.byScene('menu_theme')[0].paused).toBe(false);
  });

  it('скрытая вкладка ставит музыку на паузу, возврат — продолжает', () => {
    const s = setup({ autoplay: true });
    s.engine.setScene('game');
    s.run(3);
    s.engine.setHidden(true);
    expect(s.audios.every((a) => a.paused)).toBe(true);
    s.engine.setHidden(false);
    expect(s.byScene('gameplay_ambient')[0].paused).toBe(false);
  });

  it('повреждённые настройки — значения по умолчанию', () => {
    const s = setup({ stored: '{oops' });
    expect(s.engine.getSettings()).toEqual({ volume: 0.6, muted: false });
  });

  it('iPhone/iPad: громкость через Web Audio, потому что volume у <audio> там не работает', () => {
    const s = setup({ autoplay: true, ios: true });
    s.engine.setScene('menu');
    s.run(SCENE_FADE_S + 0.5);
    expect(s.byScene('menu_theme')[0].paused).toBe(false);
    expect(Math.max(...s.gains.map((g) => g.gain.value))).toBeCloseTo(0.36, 2);
    s.engine.setVolume(0);
    s.run(1);
    expect(Math.max(...s.gains.map((g) => g.gain.value))).toBe(0);
  });

  it('Safari/iPhone: фон игры включается после брифинга, хотя разрешение было дано только в момент нажатия', async () => {
    const s = setup({ safari: true });
    s.engine.setScene('menu');
    await s.flush();
    s.tap(); // первое касание на брифинге
    await s.flush();
    s.run(SCENE_FADE_S + 0.5);
    await s.flush();
    expect(s.byScene('menu_theme')[0].paused).toBe(false);
    // «Начать смену»: сцена меняется уже после обработчика нажатия (в эффекте React)
    s.engine.setScene('game');
    await s.flush();
    s.run(SCENE_FADE_S + 0.5);
    await s.flush();
    const game = s.byScene('gameplay_ambient')[0];
    expect(game.paused).toBe(false);
    expect(game.muted).toBe(false);
    expect(s.engine.getSnapshot().audible).toBe('game');
    expect(s.engine.needsGesture()).toBe(false);
    // повтор: вторая копия трека тоже запускается без нового нажатия
    s.run(200);
    await s.flush();
    expect(s.byScene('gameplay_ambient')[1].paused).toBe(false);
  });
});
