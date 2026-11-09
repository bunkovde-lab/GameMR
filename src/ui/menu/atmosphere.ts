/**
 * Атмосфера главного меню: один Canvas поверх чистого фона M00-B.
 * Слои: дождь за стеклом (3 прохода + капли на стекле), гроза (1–2 вспышки раз в 12–30 с),
 * отражения на столе, тёплая лампа, пыль в лучах.
 *
 * Производительность: один requestAnimationFrame, без DOM-изменений в кадре; разрешение холста ограничено;
 * при медленных кадрах качество снижается само (меньше струй и пылинок), композиция не меняется.
 * Скрытая вкладка — цикл стоит. stop() снимает rAF и слушатели — утечек нет.
 */
import {
  SCENE,
  flashLevel,
  fxRandom,
  lightningPulses,
  nextLightningDelay,
  stormLength,
  type FxPrefs,
  type Pt,
  type Pulse,
  type SceneGeometry,
} from './menuScene';

export type Quality = 0 | 1 | 2;

interface Streak { x: number; y: number; len: number; speed: number }
interface Drop { x: number; y: number; r: number; slide: number }
interface Mote { x: number; y: number; vx: number; vy: number; r: number; a: number; phase: number }

/** Три прохода дождя: дальний (мелкий, медленный), средний, ближний (длинный, быстрый). */
const RAIN_LAYERS = [
  { count: 140, len: [6, 12], speed: [0.32, 0.42], width: 0.6, alpha: 0.10 },
  { count: 90, len: [12, 22], speed: [0.55, 0.7], width: 0.9, alpha: 0.14 },
  { count: 45, len: [22, 38], speed: [0.9, 1.15], width: 1.2, alpha: 0.17 },
] as const;
const WIND = 0.12; // наклон струй (доля по x на единицу y)
const QUALITY_SCALE: Record<Quality, number> = { 0: 0.35, 1: 0.6, 2: 1 };

export interface FxImages { rain?: HTMLImageElement | null; lightning?: HTMLImageElement | null; dust?: HTMLImageElement | null }

export interface FxStats { fps: number; quality: Quality; storms: number; running: boolean; flash: number }

export class MenuAtmosphere {
  private ctx: CanvasRenderingContext2D | null;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private frame = 0;
  private last = 0;
  private time = 0;
  private rand = fxRandom(0x5eed);
  private layers: Streak[][] = [];
  private drops: Drop[] = [];
  private motes: Mote[] = [];
  private quality: Quality;
  private frameTimes: number[] = [];
  private nextStormAt: number;
  private storm: { start: number; pulses: Pulse[]; bolt: Pt[][]; boltX: number } | null = null;
  private storms = 0;
  private flash = 0;
  private flicker = { until: 0, depth: 0 };
  private nextFlickerAt = 6000;
  private running = false;
  private onVisibility = () => { if (document.hidden) this.pause(); else this.resume(); };

  constructor(
    private canvas: HTMLCanvasElement,
    private prefs: FxPrefs,
    private images: FxImages = {},
    private geo: SceneGeometry = SCENE,
  ) {
    this.ctx = canvas.getContext('2d');
    const weak = (navigator.hardwareConcurrency ?? 8) <= 4 || Math.min(window.innerWidth, window.innerHeight) < 600;
    this.quality = weak ? 1 : 2;
    this.nextStormAt = nextLightningDelay(this.rand, true) * 1000;
  }

  start() {
    if (this.running) return;
    document.addEventListener('visibilitychange', this.onVisibility);
    this.resume();
  }

  stop() {
    this.pause();
    document.removeEventListener('visibilitychange', this.onVisibility);
  }

  setPrefs(p: FxPrefs) {
    const reseed = p.reduceMotion !== this.prefs.reduceMotion;
    this.prefs = p;
    if (p.noFlashes) { this.storm = null; this.flash = 0; }
    if (reseed) this.populate();
  }

  /** Размер сцены в CSS-пикселях; холст получает ограниченное разрешение. */
  resize(cssW: number, cssH: number, devicePixelRatio = window.devicePixelRatio || 1) {
    this.dpr = Math.min(devicePixelRatio, this.quality === 2 ? 1.5 : 1);
    this.w = Math.max(1, Math.round(cssW));
    this.h = Math.max(1, Math.round(cssH));
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.populate();
    if (!this.running) this.draw();
  }

  /** Принудительная гроза (демонстрация и тесты). Уважает «Отключить вспышки». */
  triggerLightning() {
    if (this.prefs.noFlashes) return false;
    this.beginStorm();
    return true;
  }

  stats(): FxStats {
    const avg = this.frameTimes.length ? this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length : 0;
    return { fps: avg ? Math.round(1000 / avg) : 0, quality: this.quality, storms: this.storms, running: this.running, flash: this.flash };
  }

  // ——— цикл ———

  private pause() {
    this.running = false;
    cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  private resume() {
    if (this.running || document.hidden) return;
    this.running = true;
    this.last = performance.now();
    const step = (now: number) => {
      if (!this.running) return;
      const dt = Math.min(64, now - this.last);
      this.last = now;
      this.track(dt);
      this.update(dt);
      this.draw();
      this.frame = requestAnimationFrame(step);
    };
    this.frame = requestAnimationFrame(step);
  }

  /** Автоматическое снижение качества на медленных устройствах (композиция не меняется). */
  private track(dt: number) {
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 90) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes = [];
    if (avg > 24 && this.quality > 0) {
      this.quality = (this.quality - 1) as Quality;
      this.resize(this.w, this.h);
    }
  }

  // ——— частицы ———

  private bbox(poly: readonly Pt[]) {
    const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
    return { x0: Math.min(...xs) * this.w, y0: Math.min(...ys) * this.h, x1: Math.max(...xs) * this.w, y1: Math.max(...ys) * this.h };
  }

  private populate() {
    const q = QUALITY_SCALE[this.quality] * (this.prefs.reduceMotion ? 0.4 : 1);
    const area = (this.w * this.h) / (1920 * 1080);
    const b = this.bbox(this.geo.window);
    const r = this.rand;
    this.layers = RAIN_LAYERS.map((L, i) => {
      if (this.prefs.reduceMotion && i === 2) return [];
      const n = Math.round(L.count * q * Math.max(0.5, area));
      return Array.from({ length: n }, () => ({
        x: b.x0 + (b.x1 - b.x0 + (b.y1 - b.y0) * WIND) * r() - (b.y1 - b.y0) * WIND,
        y: b.y0 + (b.y1 - b.y0) * r(),
        len: (L.len[0] + (L.len[1] - L.len[0]) * r()) * (this.h / 1080),
        speed: (L.speed[0] + (L.speed[1] - L.speed[0]) * r()) * (this.h / 1080),
      }));
    });
    const nDrops = Math.round(70 * q * Math.max(0.5, area));
    this.drops = Array.from({ length: nDrops }, () => ({
      x: b.x0 + (b.x1 - b.x0) * r(),
      y: b.y0 + (b.y1 - b.y0) * r(),
      r: (0.8 + 2.2 * r() * r()) * (this.h / 1080),
      slide: r() < 0.3 ? (0.004 + 0.02 * r()) * (this.h / 1080) : 0,
    }));
    const d = this.geo.dust;
    const nMotes = this.prefs.reduceMotion ? 0 : Math.round(48 * QUALITY_SCALE[this.quality]);
    this.motes = Array.from({ length: nMotes }, () => ({
      x: (d.x0 + (d.x1 - d.x0) * r()) * this.w,
      y: (d.y0 + (d.y1 - d.y0) * r()) * this.h,
      vx: (r() - 0.5) * 0.006,
      vy: (r() - 0.55) * 0.004,
      r: 0.5 + 1.3 * r(),
      a: 0.05 + 0.2 * r(),
      phase: r() * Math.PI * 2,
    }));
  }

  private update(dt: number) {
    this.time += dt;
    const slow = this.prefs.reduceMotion ? 0.45 : 1;
    const b = this.bbox(this.geo.window);
    const hgt = b.y1 - b.y0;
    for (const layer of this.layers) {
      for (const s of layer) {
        const dy = s.speed * dt * slow;
        s.y += dy;
        s.x += dy * WIND;
        if (s.y - s.len > b.y1) {
          s.y = b.y0 - s.len - this.rand() * hgt * 0.2;
          s.x = b.x0 + (b.x1 - b.x0) * this.rand() - hgt * WIND;
        }
      }
    }
    if (!this.prefs.reduceMotion) {
      for (const d of this.drops) {
        if (!d.slide) continue;
        d.y += d.slide * dt;
        if (d.y > b.y1) { d.y = b.y0 + hgt * 0.3 * this.rand(); d.x = b.x0 + (b.x1 - b.x0) * this.rand(); }
      }
    }
    const dz = this.geo.dust;
    for (const m of this.motes) {
      m.x += (m.vx + Math.sin(this.time / 2400 + m.phase) * 0.003) * dt;
      m.y += m.vy * dt;
      if (m.x < dz.x0 * this.w) m.x = dz.x1 * this.w;
      if (m.x > dz.x1 * this.w) m.x = dz.x0 * this.w;
      if (m.y < dz.y0 * this.h) m.y = dz.y1 * this.h;
      if (m.y > dz.y1 * this.h) m.y = dz.y0 * this.h;
    }

    // Гроза
    if (!this.prefs.noFlashes && !this.storm && this.time >= this.nextStormAt) this.beginStorm();
    if (this.storm) {
      const t = this.time - this.storm.start;
      this.flash = flashLevel(this.storm.pulses, t);
      if (t > stormLength(this.storm.pulses)) {
        this.storm = null;
        this.flash = 0;
      }
    }

    // Лампа: редкий провал яркости на 5–10% (не стробоскоп)
    if (!this.prefs.reduceMotion && this.time >= this.nextFlickerAt) {
      this.flicker = { until: this.time + 90 + 220 * this.rand(), depth: 0.05 + 0.05 * this.rand() };
      this.nextFlickerAt = this.time + 5000 + 10000 * this.rand();
    }
  }

  private beginStorm() {
    const pulses = lightningPulses(this.rand, this.prefs.reduceMotion);
    const b = this.bbox(this.geo.window);
    const boltX = b.x0 + (b.x1 - b.x0) * (0.15 + 0.7 * this.rand());
    this.storm = { start: this.time, pulses, bolt: this.makeBolt(boltX, b.y0, b.y0 + (b.y1 - b.y0) * (0.35 + 0.25 * this.rand())), boltX };
    this.storms++;
    this.nextStormAt = this.time + stormLength(pulses) + nextLightningDelay(this.rand) * 1000;
  }

  /** Ветвящаяся молния далеко за окном: ломаная + 1–3 ответвления. */
  private makeBolt(x: number, y0: number, y1: number): Pt[][] {
    const r = this.rand;
    const seg = (sx: number, sy: number, ey: number, spread: number): Pt[] => {
      const pts: Pt[] = [[sx, sy]];
      const steps = 8 + Math.floor(r() * 6);
      let cx = sx;
      for (let i = 1; i <= steps; i++) {
        cx += (r() - 0.5) * spread;
        pts.push([cx, sy + ((ey - sy) * i) / steps]);
      }
      return pts;
    };
    const main = seg(x, y0, y1, (y1 - y0) * 0.18);
    const branches = Array.from({ length: 1 + Math.floor(r() * 3) }, () => {
      const from = main[2 + Math.floor(r() * (main.length - 4))]!;
      return seg(from[0], from[1], from[1] + (y1 - from[1]) * (0.3 + 0.4 * r()), (y1 - y0) * 0.12);
    });
    return [main, ...branches];
  }

  // ——— отрисовка ———

  private path(poly: readonly Pt[]) {
    const c = this.ctx!;
    c.beginPath();
    poly.forEach(([x, y], i) => (i ? c.lineTo(x * this.w, y * this.h) : c.moveTo(x * this.w, y * this.h)));
    c.closePath();
  }

  /** Контур стекла без импостов: дождь не рисуется по раме. */
  private glassClip() {
    const c = this.ctx!;
    this.path(this.geo.window);
    const b = this.bbox(this.geo.window);
    for (const m of this.geo.mullions) c.rect((m.x - m.w / 2) * this.w, b.y0, m.w * this.w, b.y1 - b.y0);
    c.clip('evenodd');
  }

  private draw() {
    const c = this.ctx;
    if (!c || !this.w) return;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, this.w, this.h);
    const f = this.flash;

    // 1. За стеклом: подсветка города вспышкой, молния, дождь, капли
    c.save();
    this.glassClip();
    if (f > 0) {
      c.globalCompositeOperation = 'lighter';
      c.fillStyle = `rgba(150,170,215,${(f * 0.3).toFixed(3)})`;
      c.fillRect(0, 0, this.w, this.h);
      if (this.storm && this.time - this.storm.start < this.storm.pulses[0]!.dur * 2) this.drawBolt(f);
      c.globalCompositeOperation = 'source-over';
    }
    this.drawRainTexture();
    RAIN_LAYERS.forEach((L, i) => {
      const layer = this.layers[i];
      if (!layer?.length) return;
      c.strokeStyle = `rgba(196,210,232,${(L.alpha * (1 + f * 1.5)).toFixed(3)})`;
      c.lineWidth = L.width * (this.h / 1080) * 1.2;
      c.beginPath();
      for (const s of layer) {
        c.moveTo(s.x, s.y);
        c.lineTo(s.x - s.len * WIND, s.y - s.len);
      }
      c.stroke();
    });
    for (const d of this.drops) {
      c.fillStyle = `rgba(185,200,225,${(0.13 + f * 0.25).toFixed(3)})`;
      c.beginPath();
      c.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = `rgba(235,240,250,${(0.18 + f * 0.4).toFixed(3)})`;
      c.fillRect(d.x - d.r * 0.35, d.y - d.r * 0.45, Math.max(0.6, d.r * 0.4), Math.max(0.6, d.r * 0.4));
    }
    c.restore();

    // 2. Холодные кромки рамы при вспышке
    if (f > 0.02) {
      const b = this.bbox(this.geo.window);
      c.fillStyle = `rgba(190,210,245,${(f * 0.22).toFixed(3)})`;
      for (const m of this.geo.mullions) {
        c.fillRect((m.x - m.w / 2) * this.w, b.y0, 1.2, b.y1 - b.y0);
        c.fillRect((m.x + m.w / 2) * this.w - 1.2, b.y0, 1.2, b.y1 - b.y0);
      }
      c.fillRect(b.x0, b.y1 - 1, b.x1 - b.x0, 1.5);
    }

    // 3. Отражения на столе: мягкие холодные полосы от окна + вспышка
    this.drawDeskReflection(f);

    // 4. Тёплая лампа
    this.drawLamp();

    // 5. Пыль в лучах
    this.drawDust();
  }

  private drawBolt(f: number) {
    const c = this.ctx!;
    const img = this.images.lightning;
    if (img?.complete && img.naturalWidth) {
      const b = this.bbox(this.geo.window);
      const hh = (b.y1 - b.y0) * 0.75;
      const ww = (hh * img.naturalWidth) / img.naturalHeight;
      c.globalAlpha = Math.min(1, f * 1.2);
      c.drawImage(img, this.storm!.boltX - ww / 2, b.y0, ww, hh);
      c.globalAlpha = 1;
      return;
    }
    const k = this.h / 1080;
    for (const [i, line] of this.storm!.bolt.entries()) {
      c.beginPath();
      line.forEach(([x, y], j) => (j ? c.lineTo(x, y) : c.moveTo(x, y)));
      c.strokeStyle = `rgba(170,190,255,${(f * 0.35).toFixed(3)})`;
      c.lineWidth = (i ? 3 : 5) * k;
      c.stroke();
      c.strokeStyle = `rgba(240,245,255,${(f * 0.9).toFixed(3)})`;
      c.lineWidth = (i ? 0.8 : 1.5) * k;
      c.stroke();
    }
  }

  private drawRainTexture() {
    const img = this.images.rain;
    if (!img?.complete || !img.naturalWidth) return;
    const c = this.ctx!;
    const b = this.bbox(this.geo.window);
    const hh = b.y1 - b.y0;
    const passes = this.prefs.reduceMotion ? [0.02] : [0.05, 0.09];
    passes.forEach((v, i) => {
      const off = ((this.time * v * (this.h / 1080)) % hh + hh) % hh;
      c.globalAlpha = i ? 0.22 : 0.3;
      c.drawImage(img, b.x0, b.y0 + off - hh, b.x1 - b.x0, hh);
      c.drawImage(img, b.x0, b.y0 + off, b.x1 - b.x0, hh);
    });
    c.globalAlpha = 1;
  }

  private drawDeskReflection(f: number) {
    const c = this.ctx!;
    c.save();
    this.path(this.geo.desk);
    c.clip();
    const b = this.bbox(this.geo.desk);
    c.globalCompositeOperation = 'lighter';
    // Медленно ползущие отражения струй со стекла (сильно приглушены)
    const t = this.time / 1000;
    for (let i = 0; i < 7; i++) {
      const x = b.x0 + ((i * 0.149 + t * 0.006 * (1 + (i % 3))) % 1) * (b.x1 - b.x0);
      const g = c.createLinearGradient(0, b.y0, 0, b.y1);
      const a = 0.025 + 0.015 * Math.sin(t * 0.7 + i);
      g.addColorStop(0, `rgba(160,180,215,${a.toFixed(3)})`);
      g.addColorStop(1, 'rgba(160,180,215,0)');
      c.fillStyle = g;
      c.fillRect(x, b.y0, (b.x1 - b.x0) * 0.012, b.y1 - b.y0);
    }
    if (f > 0) {
      const g = c.createLinearGradient(0, b.y0, 0, b.y1);
      g.addColorStop(0, `rgba(175,195,240,${(f * 0.2).toFixed(3)})`);
      g.addColorStop(1, 'rgba(175,195,240,0)');
      c.fillStyle = g;
      c.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
    }
    c.restore();
  }

  private drawLamp() {
    const c = this.ctx!;
    const L = this.geo.lamp;
    const breath = this.prefs.reduceMotion ? 0 : Math.sin(this.time / 1900) * 0.02 + Math.sin(this.time / 730) * 0.01;
    const dip = this.time < this.flicker.until ? this.flicker.depth : 0;
    const a = 0.11 * (1 + breath - dip);
    const x = L.x * this.w, y = L.y * this.h, r = L.r * this.w;
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255,178,96,${a.toFixed(3)})`);
    g.addColorStop(0.45, `rgba(230,140,70,${(a * 0.45).toFixed(3)})`);
    g.addColorStop(1, 'rgba(200,110,60,0)');
    c.globalCompositeOperation = 'lighter';
    c.fillStyle = g;
    c.fillRect(x - r, y - r, r * 2, r * 2);
    c.globalCompositeOperation = 'source-over';
  }

  private drawDust() {
    if (!this.motes.length) return;
    const c = this.ctx!;
    const L = this.geo.lamp;
    const lx = L.x * this.w, ly = L.y * this.h, lr = L.r * this.w * 1.8;
    c.globalCompositeOperation = 'lighter';
    for (const m of this.motes) {
      const near = Math.max(0, 1 - Math.hypot(m.x - lx, m.y - ly) / lr);
      const tw = 0.6 + 0.4 * Math.sin(this.time / 1300 + m.phase);
      const a = m.a * (0.35 + near) * tw;
      if (a < 0.01) continue;
      c.fillStyle = `rgba(255,214,160,${a.toFixed(3)})`;
      c.beginPath();
      c.arc(m.x, m.y, m.r * (this.h / 1080), 0, Math.PI * 2);
      c.fill();
    }
    c.globalCompositeOperation = 'source-over';
  }
}
