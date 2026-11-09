import { useEffect, useRef } from 'react';
import { MAP, districtById, type Point } from '../../core/map/mapConfig';
import { isOpen } from '../../core/selectors';
import type { GameState } from '../../core/types';
import { getSubMinute } from '../useGameLoop';
import { districtMood, nightLevel, weatherForShift, weatherIntensity, type EffectsLevel } from './cityLife';
import { incidentPoint, squadPoint } from './entities';

/**
 * Слой «живого города» поверх карты ART-019 (canvas, без касаний — pointer-events: none).
 * Рисует машины и пешеходов по дорогам, патрульные машины отрядов (плавно, между тиками),
 * дым/огонь/беспорядки в районах с низкой безопасностью, обстановку на месте вызовов и погоду.
 * Все данные читаются из состояния игры; сам слой ничего в игру не пишет.
 */
export interface MapTransform { scale: number; offX: number; offY: number }
interface Props {
  game: GameState;
  transform: MapTransform;
  width: number;
  height: number;
  level: EffectsLevel;
  clockStart: number;
}

const W = MAP.art.width;
const H = MAP.art.height;

/** Дороги в мировых пикселях: длина и накопленные длины сегментов. */
interface Lane { pts: Point[]; cum: number[]; len: number; elevated: boolean }
const LANES: Lane[] = MAP.edges.map((e) => {
  const pts = e.polyline.map(([x, y]) => [x * W, y * H] as Point);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]));
  return { pts, cum, len: cum[cum.length - 1]!, elevated: (e as { mode?: string }).mode === 'elevated' };
});

function along(l: Lane, d: number): { x: number; y: number; a: number } {
  const dist = ((d % l.len) + l.len) % l.len;
  let i = 1;
  while (i < l.cum.length - 1 && l.cum[i]! < dist) i++;
  const a = l.pts[i - 1]!, b = l.pts[i]!;
  const seg = l.cum[i]! - l.cum[i - 1]! || 1;
  const k = (dist - l.cum[i - 1]!) / seg;
  return { x: a[0] + (b[0] - a[0]) * k, y: a[1] + (b[1] - a[1]) * k, a: Math.atan2(b[1] - a[1], b[0] - a[0]) };
}

/** Детерминированный «шум» для разброса без Math.random в раскладке. */
const rnd = (i: number) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

interface Mover { lane: number; offset: number; speed: number; side: 1 | -1; color: string; ped: boolean }
function buildMovers(level: EffectsLevel): Mover[] {
  if (level === 'off') return [];
  const out: Mover[] = [];
  const palette = ['#2b3038', '#5d1a20', '#7d828b', '#3a2a22', '#1d2633', '#9a8f7a'];
  LANES.forEach((l, li) => {
    const cars = Math.max(1, Math.round(l.len / (level === 'full' ? 150 : 300)));
    for (let k = 0; k < cars; k++) {
      const r = rnd(li * 31 + k);
      out.push({ lane: li, offset: r * l.len, speed: 55 + rnd(li * 7 + k * 3) * 45, side: k % 2 ? 1 : -1, color: palette[(li + k) % palette.length]!, ped: false });
    }
    if (level === 'full' && !l.elevated) {
      for (let k = 0; k < 3; k++) out.push({ lane: li, offset: rnd(li * 13 + k) * l.len, speed: 6 + rnd(li + k * 5) * 6, side: k % 2 ? 1 : -1, color: '#d9d2c3', ped: true });
    }
  });
  return out;
}

interface Drop { x: number; y: number; v: number }
interface Puff { x: number; y: number; r: number; life: number; max: number; vx: number; vy: number }
interface Hotspot { p: Point; kind: 'smoke' | 'fire' | 'riot' | 'medriot' | 'bioleak' | 'raid' | 'missing' | 'illegal' | 'ring'; sev: number; seed: number }

export function MapLife({ game, transform, width, height, level, clockStart }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef({ game, transform, width, height, level, clockStart });
  live.current = { game, transform, width, height, level, clockStart };

  useEffect(() => {
    const cv = canvas.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    let frame = 0;
    let last = performance.now();
    let vt = 0; // визуальное время (сек), идёт со скоростью игры
    let movers = buildMovers(live.current.level);
    let moversLevel = live.current.level;
    let drops: Drop[] = [];
    let puffs: Puff[] = [];
    let flash = 0, bolt: Point[] | null = null, boltLife = 0;

    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      const { game: g, transform: t, width: vw, height: vh, level: lv, clockStart: cs } = live.current;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (cv.width !== Math.round(vw * dpr) || cv.height !== Math.round(vh * dpr)) { cv.width = Math.round(vw * dpr); cv.height = Math.round(vh * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, vw, vh);
      if (lv === 'off' || !t.scale) return;
      if (lv !== moversLevel) { movers = buildMovers(lv); moversLevel = lv; puffs = []; drops = []; }

      const running = g.phase === 'ACTIVE' && !g.paused;
      const speedK = running ? g.speed : g.phase === 'ACTIVE' ? 0 : 0.35;
      vt += dt * speedK;
      const sub = running ? getSubMinute() : 0;
      const minute = g.minute + sub;
      const night = nightLevel(cs + minute);
      const s = t.scale;
      const u = Math.max(1.25, W * s / 1000); // экранных px на «единицу» города
      const sx = (x: number) => t.offX + x * s;
      const sy = (y: number) => t.offY + y * s;

      // --- транспорт и пешеходы ---
      for (const m of movers) {
        const l = LANES[m.lane]!;
        const d = m.side === 1 ? m.offset + vt * m.speed : m.offset - vt * m.speed;
        const p = along(l, d);
        const nx = -Math.sin(p.a) * m.side, ny = Math.cos(p.a) * m.side;
        const lat = m.ped ? 14 : 5;
        const x = sx(p.x + nx * lat), y = sy(p.y + ny * lat);
        if (x < -10 || y < -10 || x > vw + 10 || y > vh + 10) continue;
        if (m.ped) {
          ctx.fillStyle = night > 0.5 ? '#8f8a80' : m.color;
          ctx.beginPath(); ctx.arc(x, y, 0.9 * u, 0, Math.PI * 2); ctx.fill();
          continue;
        }
        const ang = m.side === 1 ? p.a : p.a + Math.PI;
        ctx.save();
        ctx.translate(x, y); ctx.rotate(ang);
        if (night > 0.15) {
          // фары: тёплый конус вперёд
          ctx.globalCompositeOperation = 'lighter';
          const gr = ctx.createRadialGradient(5 * u, 0, 0, 5 * u, 0, 9 * u);
          gr.addColorStop(0, `rgba(255,214,150,${0.55 * night})`);
          gr.addColorStop(1, 'rgba(255,214,150,0)');
          ctx.fillStyle = gr;
          ctx.beginPath(); ctx.moveTo(3 * u, 0); ctx.lineTo(13 * u, -4 * u); ctx.lineTo(13 * u, 4 * u); ctx.closePath(); ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
        }
        ctx.fillStyle = m.color;
        ctx.fillRect(-3.6 * u, -1.7 * u, 7.2 * u, 3.4 * u);
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(-0.6 * u, -1.2 * u, 2 * u, 2.4 * u);
        if (night > 0.15) { ctx.fillStyle = `rgba(255,40,40,${0.5 + 0.5 * night})`; ctx.fillRect(-3.4 * u, -1.3 * u, 0.8 * u, 0.8 * u); ctx.fillRect(-3.4 * u, 0.5 * u, 0.8 * u, 0.8 * u); }
        ctx.restore();
      }

      // --- точки происшествий и неспокойные районы ---
      const spots: Hotspot[] = [];
      for (const d of g.districts) {
        const mood = districtMood(d.safety);
        if (mood === 'calm') continue;
        const md = districtById(d.id);
        if (!md) continue;
        const pts = [md.labelAnchor, ...md.spawnPoints.map((p) => p.position)];
        const n = mood === 'tense' ? 1 : mood === 'unrest' ? 2 : 3;
        for (let i = 0; i < n; i++) {
          const p = pts[(i + 1) % pts.length]!;
          const q: Point = [p[0] + 0.012 * (i - 1), p[1] - 0.01];
          spots.push({ p: q, kind: 'smoke', sev: 1, seed: i });
          if (mood !== 'tense') spots.push({ p: q, kind: 'fire', sev: mood === 'riot' ? 2 : 1, seed: i + 10 });
          if (mood === 'riot') spots.push({ p: [q[0] + 0.01, q[1] + 0.018], kind: 'riot', sev: 2, seed: i + 20 });
        }
      }
      for (const inc of g.incidents) {
        if (!isOpen(inc)) continue;
        const p = incidentPoint(inc);
        if (!p) continue;
        const sev = inc.severity === 'critical' ? 3 : inc.severity === 'high' ? 2 : 1;
        spots.push({ p, kind: 'ring', sev, seed: 0 });
        const kind = (['medriot', 'bioleak', 'raid', 'missing', 'illegal'] as const).find((k) => inc.templateId === k);
        if (kind) spots.push({ p, kind, sev, seed: inc.id.length });
        if (kind === 'medriot' || kind === 'raid') spots.push({ p: [p[0] + 0.006, p[1] - 0.006], kind: 'smoke', sev, seed: 3 });
      }

      const drawPuffs = () => {
      // дым: частицы живут в мировых координатах, чтобы не «плыть» при приближении
        const maxPuffs = lv === 'full' ? 260 : 90;
        if (puffs.length > maxPuffs) puffs.splice(0, puffs.length - maxPuffs);
        puffs = puffs.filter((p) => (p.life += dt * Math.max(speedK, 0.3)) < p.max);
        for (const p of puffs) {
          const k = p.life / p.max;
          p.x += p.vx * dt * Math.max(speedK, 0.3); p.y += p.vy * dt * Math.max(speedK, 0.3);
          const r = (p.r + k * 22) * u;
          const shade = Math.round(95 - 35 * night);
          const px = sx(p.x), py = sy(p.y);
          const gr = ctx.createRadialGradient(px, py, 0, px, py, r);
          gr.addColorStop(0, `rgba(${shade},${shade},${shade + 6},${0.42 * (1 - k)})`);
          gr.addColorStop(1, `rgba(${shade},${shade},${shade + 6},0)`);
          ctx.fillStyle = gr;
          ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
        }

      };
      const wind = 6 + 4 * Math.sin(vt * 0.05);
      // Порядок слоёв: кольца и дымка → дым → огонь и люди поверх дыма.
      const order: Record<Hotspot['kind'], number> = { ring: 0, bioleak: 0, illegal: 0, missing: 0, smoke: 1, fire: 2, riot: 3, medriot: 3, raid: 3 };
      spots.sort((a, b) => order[a.kind] - order[b.kind]);
      let puffsDrawn = false;
      for (const h of spots) {
        if (!puffsDrawn && order[h.kind] >= 2) { drawPuffs(); puffsDrawn = true; }
        const x = sx(h.p[0] * W), y = sy(h.p[1] * H);
        const ph = vt * 2 + h.seed;
        switch (h.kind) {
          case 'smoke':
            if (rnd(Math.floor(vt * 6) + h.seed * 97 + Math.floor(h.p[0] * 1000)) < (lv === 'full' ? 0.55 : 0.25) * (running ? 1 : 0.4))
              puffs.push({ x: h.p[0] * W, y: h.p[1] * H, r: 4 + h.sev, life: 0, max: 5 + rnd(puffs.length) * 3, vx: wind, vy: -10 - rnd(puffs.length + 1) * 6 });
            break;
          case 'fire': {
            ctx.globalCompositeOperation = 'lighter';
            const fl = 0.75 + 0.25 * Math.sin(ph * 7) * Math.sin(ph * 3.3);
            const r = (14 + 6 * h.sev) * u * fl;
            for (let i = 0; i < 5 + 3 * h.sev; i++) {
              const life = (ph * 0.9 + rnd(i + h.seed * 7)) % 1;
              const fx = x + (rnd(i * 3 + h.seed) - 0.5) * 10 * u + Math.sin(ph * 4 + i) * u;
              const fy = y - life * 14 * u;
              ctx.fillStyle = `rgba(255,${Math.round(200 - 140 * life)},60,${0.9 * (1 - life)})`;
              ctx.beginPath(); ctx.arc(fx, fy, (2.4 - 1.6 * life) * u, 0, Math.PI * 2); ctx.fill();
            }
            const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
            gr.addColorStop(0, `rgba(255,220,120,${0.9 * fl})`);
            gr.addColorStop(0.35, `rgba(255,110,30,${0.6 * fl})`);
            gr.addColorStop(1, 'rgba(160,20,10,0)');
            ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
            ctx.globalCompositeOperation = 'source-over';
            break;
          }
          case 'riot':
          case 'medriot': {
            const n = h.kind === 'riot' ? 14 : 9;
            for (let i = 0; i < n; i++) {
              const a = rnd(i + h.seed * 13) * Math.PI * 2;
              const rr = (3 + rnd(i * 3 + h.seed) * 9) * u;
              const jx = Math.sin(ph * 3 + i) * 0.9 * u, jy = Math.cos(ph * 2.6 + i * 1.7) * 0.9 * u;
              ctx.fillStyle = i % 3 === 0 ? '#e0383f' : night > 0.4 ? '#d8cfc0' : '#1a1416';
              ctx.beginPath(); ctx.arc(x + Math.cos(a) * rr + jx, y + Math.sin(a) * rr + jy, 1.8 * u, 0, Math.PI * 2); ctx.fill();
            }
            if (h.kind === 'riot') { ctx.strokeStyle = '#3b3530'; ctx.lineWidth = 2 * u; ctx.beginPath(); ctx.moveTo(x - 9 * u, y + 10 * u); ctx.lineTo(x + 9 * u, y + 8 * u); ctx.stroke(); }
            break;
          }
          case 'bioleak': {
            const k = 0.6 + 0.4 * Math.sin(ph * 1.3);
            const r = 22 * u;
            const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
            gr.addColorStop(0, `rgba(120,255,140,${0.45 * k})`);
            gr.addColorStop(1, 'rgba(60,200,90,0)');
            ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
            break;
          }
          case 'raid': {
            if (Math.sin(ph * 9) > 0.92) {
              ctx.globalCompositeOperation = 'lighter';
              ctx.fillStyle = 'rgba(255,240,180,0.9)';
              for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(x + (rnd(i + Math.floor(ph * 9)) - 0.5) * 16 * u, y + (rnd(i * 5 + Math.floor(ph * 9)) - 0.5) * 12 * u, 1.6 * u, 0, Math.PI * 2); ctx.fill(); }
              ctx.globalCompositeOperation = 'source-over';
            }
            break;
          }
          case 'missing': {
            const a = ph * 0.6;
            ctx.globalCompositeOperation = 'lighter';
            ctx.fillStyle = `rgba(200,220,255,${0.12 + 0.18 * night})`;
            ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, 30 * u, a, a + 0.5); ctx.closePath(); ctx.fill();
            ctx.globalCompositeOperation = 'source-over';
            break;
          }
          case 'illegal': {
            const k = 0.5 + 0.5 * Math.sin(ph * 2);
            ctx.strokeStyle = `rgba(190,110,255,${0.6 * k})`; ctx.lineWidth = 2 * u;
            ctx.beginPath(); ctx.arc(x, y, (10 + 6 * k) * u, 0, Math.PI * 2); ctx.stroke();
            break;
          }
          case 'ring': {
            // «Объект происшествия» на земле: расходящееся кольцо цвета серьёзности.
            const k = (vt * 0.8 + h.p[0] * 7) % 1;
            const col = h.sev >= 3 ? '232,76,80' : h.sev === 2 ? '232,160,60' : '230,200,120';
            ctx.strokeStyle = `rgba(${col},${0.85 * (1 - k)})`; ctx.lineWidth = 2 * u;
            ctx.beginPath(); ctx.ellipse(x, y, (6 + 18 * k) * u, (4 + 12 * k) * u, 0, 0, Math.PI * 2); ctx.stroke();
            ctx.fillStyle = `rgba(${col},0.35)`;
            ctx.beginPath(); ctx.ellipse(x, y, 5 * u, 3.4 * u, 0, 0, Math.PI * 2); ctx.fill();
            break;
          }
        }
      }
      if (!puffsDrawn) drawPuffs();

      // --- патрульные машины отрядов: плавно между тиками, с мигалками ---
      for (const q of g.squads) {
        if (!['en_route', 'on_scene', 'returning'].includes(q.status)) continue;
        const p = squadPoint(g, q, sub);
        const p2 = squadPoint(g, q, Math.min(1, sub + 0.05));
        const moving = q.status !== 'on_scene' && (p2[0] !== p[0] || p2[1] !== p[1]);
        const x = sx(p[0] * W), y = sy(p[1] * H);
        const ang = moving ? Math.atan2((p2[1] - p[1]) * H, (p2[0] - p[0]) * W) : 0;
        ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
        ctx.fillStyle = '#120c0e'; ctx.fillRect(-6 * u, -2.6 * u, 12 * u, 5.2 * u);
        ctx.fillStyle = '#c0222b'; ctx.fillRect(-1.8 * u, -2.6 * u, 3.6 * u, 5.2 * u);
        ctx.strokeStyle = '#f2d6a8'; ctx.lineWidth = 0.8 * u; ctx.strokeRect(-6 * u, -2.6 * u, 12 * u, 5.2 * u);
        ctx.restore();
        const blink = Math.floor(now / 250) % 2;
        ctx.globalCompositeOperation = 'lighter';
        const gr = ctx.createRadialGradient(x, y, 0, x, y, 16 * u);
        gr.addColorStop(0, blink ? 'rgba(255,50,60,0.9)' : 'rgba(70,120,255,0.9)');
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, 16 * u, 0, Math.PI * 2); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }

      // --- погода ---
      const w = weatherForShift(g.seed, g.shift);
      const wi = g.phase === 'ACTIVE' ? weatherIntensity(w, minute) : 0;
      if (wi > 0) {
        if (w.kind === 'rain' || w.kind === 'storm') {
          ctx.fillStyle = `rgba(12,18,28,${0.22 * wi})`;
          ctx.fillRect(0, 0, vw, vh);
          const want = Math.round((lv === 'full' ? 0.35 : 0.12) * (vw * vh / 1000) * wi * (w.kind === 'storm' ? 1.4 : 1));
          while (drops.length < want) drops.push({ x: rnd(drops.length * 3.1 + vt) * vw, y: rnd(drops.length * 7.7 + vt) * vh, v: 600 + rnd(drops.length) * 300 });
          if (drops.length > want) drops.length = want;
          ctx.strokeStyle = 'rgba(190,205,230,0.35)'; ctx.lineWidth = 1;
          ctx.beginPath();
          const slant = w.kind === 'storm' ? 0.35 : 0.18;
          for (const d of drops) {
            d.y += d.v * dt * (running ? 1 : 0.15); d.x += d.v * slant * dt * (running ? 1 : 0.15);
            if (d.y > vh) { d.y -= vh + 20; d.x = rnd(d.x + now) * vw; }
            if (d.x > vw) d.x -= vw;
            ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - 14 * slant, d.y - 14);
          }
          ctx.stroke();
        }
        if (w.kind === 'storm') {
          if (running && flash <= 0 && Math.random() < dt * 0.25 * wi) {
            flash = 1;
            const x0 = Math.random() * vw;
            bolt = [[x0, 0]];
            let bx = x0, by = 0;
            while (by < vh * 0.6) { by += 18 + Math.random() * 26; bx += (Math.random() - 0.5) * 40; bolt.push([bx, by]); }
            boltLife = 0.18;
          }
          if (flash > 0) {
            ctx.fillStyle = `rgba(220,230,255,${0.32 * flash})`;
            ctx.fillRect(0, 0, vw, vh);
            flash -= dt * 3.5;
          }
          if (bolt && boltLife > 0) {
            ctx.strokeStyle = 'rgba(240,245,255,0.95)'; ctx.lineWidth = 2;
            ctx.beginPath(); bolt.forEach(([bx, by], i) => (i ? ctx.lineTo(bx, by) : ctx.moveTo(bx, by))); ctx.stroke();
            boltLife -= dt;
          }
        }
        if (w.kind === 'fog') {
          for (let i = 0; i < (lv === 'full' ? 7 : 3); i++) {
            const fx = ((rnd(i) * vw + vt * (8 + i * 3)) % (vw + 400)) - 200;
            const fy = rnd(i + 9) * vh;
            const r = (180 + rnd(i + 4) * 160) * Math.max(0.6, vw / 1400);
            const gr = ctx.createRadialGradient(fx, fy, 0, fx, fy, r);
            gr.addColorStop(0, `rgba(170,178,190,${0.32 * wi})`);
            gr.addColorStop(1, 'rgba(170,178,190,0)');
            ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(fx, fy, r, 0, Math.PI * 2); ctx.fill();
          }
        }
      }
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);

  return <canvas ref={canvas} className="map-life" style={{ width, height }} aria-hidden="true" data-testid="map-life" data-level={level} />;
}
