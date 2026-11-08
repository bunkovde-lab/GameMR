import { MAP, type Point } from '../../core/map/mapConfig';

/**
 * Единая матрица карты (W3 §1): изображение, полигоны, дороги и маркеры пересчитываются одной функцией.
 * baseScale = COVER; scale = baseScale × zoom; pan ограничен так, чтобы изображение всегда покрывало окно.
 */
export interface Camera { zoom: number; panX: number; panY: number }
export interface Viewport { w: number; h: number }

export const W = MAP.art.width;
export const H = MAP.art.height;
export const ZOOM_MIN = MAP.view.zoomMin;
export const ZOOM_MAX = MAP.view.zoomMax;

export const baseScale = (v: Viewport) => Math.max(v.w / W, v.h / H);

export function transform(cam: Camera, v: Viewport) {
  const scale = baseScale(v) * cam.zoom;
  return { scale, offX: (v.w - W * scale) / 2 + cam.panX, offY: (v.h - H * scale) / 2 + cam.panY };
}

export function clampCamera(cam: Camera, v: Viewport): Camera {
  const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, cam.zoom));
  const scale = baseScale(v) * zoom;
  const maxX = Math.max(0, (W * scale - v.w) / 2);
  const maxY = Math.max(0, (H * scale - v.h) / 2);
  return { zoom, panX: Math.min(maxX, Math.max(-maxX, cam.panX)), panY: Math.min(maxY, Math.max(-maxY, cam.panY)) };
}

export function worldToScreen(p: Point, cam: Camera, v: Viewport): Point {
  const t = transform(cam, v);
  return [t.offX + p[0] * W * t.scale, t.offY + p[1] * H * t.scale];
}

/** Масштабирование вокруг экранной точки: объект под курсором остаётся на месте (MAP-013). */
export function zoomAt(cam: Camera, v: Viewport, nextZoom: number, sx: number, sy: number): Camera {
  const t = transform(cam, v);
  const wx = (sx - t.offX) / t.scale;
  const wy = (sy - t.offY) / t.scale;
  const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, nextZoom));
  const scale = baseScale(v) * zoom;
  const centerOffX = (v.w - W * scale) / 2;
  const centerOffY = (v.h - H * scale) / 2;
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
 * Подвести камеру к точке, только если она вне безопасной зоны (W3 §1).
 * Безопасная зона учитывает открытые панели. Если сдвига в пределах карты не хватает — увеличиваем zoom.
 */
export function ensureVisible(cam: Camera, v: Viewport, p: Point, safe: SafeZone = DEFAULT_SAFE): Camera {
  // Слишком узкая зона (телефон с открытой карточкой) — довольствуемся видимостью в окне.
  const zone = safe.left + safe.right > v.w - 40 || safe.top + safe.bottom > v.h - 40
    ? { left: 24, right: Math.min(safe.right, Math.max(24, v.w - safe.left - 48)), top: 24, bottom: 24 } : safe;
  if (inside(p, cam, v, zone)) return cam;
  let next = panTo(cam, v, p, zone);
  for (let i = 0; i < 8 && !inside(p, next, v, zone) && next.zoom < ZOOM_MAX; i++) {
    const [x, y] = worldToScreen(p, next, v);
    next = panTo(zoomAt(next, v, next.zoom * 1.2, x, y), v, p, zone);
  }
  return next;
}
