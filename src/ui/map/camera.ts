import { MAP, type Point } from '../../core/map/mapConfig';

/**
 * Единая матрица карты (W3 §1): изображение, полигоны, дороги и маркеры пересчитываются одной функцией.
 * ART-019: baseScale = CONTAIN — при zoom 1 весь город целиком помещается в свободную часть окна карты
 * (без прокрутки и приближения). Свободная часть — окно минус открытая панель вызовов.
 * scale = baseScale × zoom; при приближении pan ограничен так, чтобы карта не уезжала из свободной части.
 */
export interface Camera { zoom: number; panX: number; panY: number }
/** Свободная от панелей часть окна карты (в пикселях окна карты). */
export interface FitRect { x: number; y: number; w: number; h: number }
/** alignLeft: пока город уже окна по ширине, он прижат к левому краю, а не стоит по центру. */
export interface Viewport { w: number; h: number; fit?: FitRect; alignLeft?: boolean }

export const W = MAP.art.width;
export const H = MAP.art.height;
export const ZOOM_MIN = MAP.view.zoomMin;
export const ZOOM_MAX = MAP.view.zoomMax;

export const fitOf = (v: Viewport): FitRect => v.fit ?? { x: 0, y: 0, w: v.w, h: v.h };
export const baseScale = (v: Viewport) => { const f = fitOf(v); return Math.min(f.w / W, f.h / H); };

/** Положение карты без сдвига камеры: по центру свободной части или (alignLeft) у её левого края, пока карта уже окна. */
const baseOffX = (f: FitRect, v: Viewport, scale: number) => {
  const slack = f.w - W * scale;
  return f.x + (v.alignLeft ? Math.min(0, slack) : slack) / 2;
};

export function transform(cam: Camera, v: Viewport) {
  const f = fitOf(v);
  const scale = baseScale(v) * cam.zoom;
  return { scale, offX: baseOffX(f, v, scale) + cam.panX, offY: f.y + (f.h - H * scale) / 2 + cam.panY };
}

export function clampCamera(cam: Camera, v: Viewport): Camera {
  const f = fitOf(v);
  const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, cam.zoom));
  const scale = baseScale(v) * zoom;
  const maxX = Math.max(0, (W * scale - f.w) / 2);
  const maxY = Math.max(0, (H * scale - f.h) / 2);
  return { zoom, panX: Math.min(maxX, Math.max(-maxX, cam.panX)), panY: Math.min(maxY, Math.max(-maxY, cam.panY)) };
}

export function worldToScreen(p: Point, cam: Camera, v: Viewport): Point {
  const t = transform(cam, v);
  return [t.offX + p[0] * W * t.scale, t.offY + p[1] * H * t.scale];
}

/** Масштабирование вокруг экранной точки: объект под курсором остаётся на месте (MAP-013). */
export function zoomAt(cam: Camera, v: Viewport, nextZoom: number, sx: number, sy: number): Camera {
  const f = fitOf(v);
  const t = transform(cam, v);
  const wx = (sx - t.offX) / t.scale;
  const wy = (sy - t.offY) / t.scale;
  const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, nextZoom));
  const scale = baseScale(v) * zoom;
  const centerOffX = baseOffX(f, v, scale);
  const centerOffY = f.y + (f.h - H * scale) / 2;
  return clampCamera({ zoom, panX: sx - wx * scale - centerOffX, panY: sy - wy * scale - centerOffY }, v);
}

export interface SafeZone { left: number; right: number; top: number; bottom: number }
export const DEFAULT_SAFE: SafeZone = { left: 60, right: 60, top: 70, bottom: 110 };

function inside(p: Point, cam: Camera, v: Viewport, safe: SafeZone) {
  const [x, y] = worldToScreen(p, cam, v);
  return x >= safe.left && x <= v.w - safe.right && y >= safe.top && y <= v.h - safe.bottom;
}

function panTo(cam: Camera, v: Viewport, p: Point, safe: SafeZone): Camera {
  const [x, y] = worldToScreen(p, cam, v);
  let { panX, panY } = cam;
  const cx = (safe.left + v.w - safe.right) / 2;
  const cy = (safe.top + v.h - safe.bottom) / 2;
  if (x < safe.left || x > v.w - safe.right) panX += cx - x;
  if (y < safe.top || y > v.h - safe.bottom) panY += cy - y;
  return clampCamera({ ...cam, panX, panY }, v);
}

/**
 * Подвести камеру к точке, если игрок сам приблизил карту и точка ушла из безопасной зоны.
 * При zoom 1 весь город и так виден — камеру не трогаем и сами не приближаем (ART-019).
 */
export function ensureVisible(cam: Camera, v: Viewport, p: Point, safe: SafeZone = DEFAULT_SAFE): Camera {
  if (cam.zoom <= ZOOM_MIN + 1e-3) return cam;
  const zone = safe.left + safe.right > v.w - 40 || safe.top + safe.bottom > v.h - 40
    ? { left: 24, right: Math.min(safe.right, Math.max(24, v.w - safe.left - 48)), top: 24, bottom: 24 } : safe;
  if (inside(p, cam, v, zone)) return cam;
  return panTo(cam, v, p, zone);
}
