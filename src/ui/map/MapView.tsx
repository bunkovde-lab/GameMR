import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import mapUrl from '../../../assets/map/web/city_topdown_day.webp';
import mapNightUrl from '../../../assets/map/web/city_topdown_night.webp';
import { buildRoute, routePolyline } from '../../core/map/graph';
import { MAP, districtById, nodePosition, type Point } from '../../core/map/mapConfig';
import { isOpen } from '../../core/selectors';
import type { GameState } from '../../core/types';
import { Icon } from '../Icon';
import { SQUAD_STATUS } from '../labels';
import { BALANCE } from '../../core/content';
import { MAP_LAYERS, NARROW_PX, type Selection } from '../uiState';
import { getSubMinute } from '../useGameLoop';
import { MOOD_LABEL, WEATHER_LABEL, districtMood, loadEffectsLevel, nightLevel, weatherForShift, weatherIntensity, type EffectsLevel } from './cityLife';
import { MapLife } from './MapLife';
import { DEFAULT_SAFE, clampCamera, ensureVisible, transform, worldToScreen, zoomAt, type Camera, type Viewport, W, H } from './camera';
import { markerArtUrl } from '../art';
import { incidentCaseLink } from '../../core/caseGuide';
import { CLUSTER_MARKER, INCIDENT_ICON, INCIDENT_MARKER, SQUAD_MARKER, incidentPoint, squadPoint } from './entities';
import { layoutMarkers } from './markerLayout';

interface Props {
  game: GameState;
  selection: Selection;
  previewSquadId: string | null;
  leftPanelOpen: boolean;
  onSelect: (s: Selection) => void;
  onOpenLeftPanel: () => void;
}

const layers = MAP_LAYERS;
const MOVING: string[] = ['en_route', 'on_scene', 'returning'];

interface DragState { pointers: Map<number, Point>; start: Point; cam: Camera; moved: boolean; pinch?: { dist: number; zoom: number } }

const toSvg = (p: Point) => `${p[0] * W},${p[1] * H}`;

/**
 * Карта ART-019 (вид сверху, день/ночь) поверх геометрии W3: арт + SVG-слой геометрии в одной матрице, маркеры — в экранном слое
 * постоянного размера (44 px), позиции через worldToScreen.
 */
export function MapView({ game, selection, previewSquadId, leftPanelOpen, onSelect, onOpenLeftPanel }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [fitX, setFitX] = useState({ left: 0, right: 0 });
  const [effects, setEffects] = useState<EffectsLevel>(loadEffectsLevel);
  const [, setFrame] = useState(0);
  const [cam, setCam] = useState<Camera>({ zoom: 1, panX: 0, panY: 0 });
  const [artProblem, setArtProblem] = useState<string | null>(null);
  const [hoverDistrict, setHoverDistrict] = useState<string | null>(null);
  const [expandedCluster, setExpandedCluster] = useState<string | null>(null);
  const drag = useRef<DragState | null>(null);
  const suppressClick = useRef(false);

  useLayoutEffect(() => {
    const el = ref.current!;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ART-019: на широком экране область карты закреплена между местами боковых панелей (--left-w / --right-w),
  // открыты они или нет: город стоит по центру и не сдвигается и не меняет размер при открытии/закрытии панелей.
  // На узком экране панели — выдвижные, поверх карты, и карта занимает всё окно.
  useLayoutEffect(() => {
    const wide = window.innerWidth >= NARROW_PX;
    const css = getComputedStyle(ref.current ?? document.documentElement);
    const px = (name: string) => parseFloat(css.getPropertyValue(name)) || 0;
    const next = wide ? { left: Math.round(px('--left-w') + 6), right: Math.round(px('--right-w') + 6) } : { left: 0, right: 0 };
    setFitX((cur) => (cur.left === next.left && cur.right === next.right ? cur : next));
  }, [size.w, size.h]);
  const vp = useMemo<Viewport>(
    () => ({ w: size.w, h: size.h, fit: { x: fitX.left, y: 0, w: Math.max(1, size.w - fitX.left - fitX.right), h: size.h } }),
    [size.w, size.h, fitX],
  );

  useEffect(() => {
    const on = (e: Event) => setEffects((e as CustomEvent<EffectsLevel>).detail);
    window.addEventListener('gamemr:effects', on);
    return () => window.removeEventListener('gamemr:effects', on);
  }, []);

  // Плавное движение отрядов между игровыми минутами: перерисовка ~30 кадров/с, пока кто-то едет.
  const anyMoving = game.phase === 'ACTIVE' && !game.paused && game.squads.some((q) => q.movement && (q.status === 'en_route' || q.status === 'returning'));
  useEffect(() => {
    if (!anyMoving) return;
    let raf = 0, lastT = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (now - lastT >= 33) { lastT = now; setFrame((f) => (f + 1) % 1e6); }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [anyMoving]);
  const sub = anyMoving ? getSubMinute() : 0;

  // Размер окна изменился → удерживаем камеру в допустимых пределах (MAP-034).
  useEffect(() => { if (vp.w) setCam((c) => clampCamera(c, vp)); }, [vp]);

  // Подвод камеры к выбранному объекту, только если он вне безопасной зоны.
  const selectedPoint = useMemo<Point | undefined>(() => {
    if (!selection) return undefined;
    if (selection.kind === 'incident') { const i = game.incidents.find((x) => x.id === selection.id); return i && incidentPoint(i); }
    if (selection.kind === 'squad') { const q = game.squads.find((x) => x.id === selection.id); return q && squadPoint(game, q); }
    return districtById(selection.id)?.labelAnchor;
  }, [selection, game]);
  const selectionKey = selection ? `${selection.kind}:${selection.id}` : '';
  useEffect(() => {
    if (!selectedPoint || !vp.w) return;
    // Безопасная зона с учётом открытых панелей поверх карты.
    const stage = ref.current?.getBoundingClientRect();
    const left = document.querySelector('.left-panel')?.getBoundingClientRect();
    const right = document.querySelector('.right-panel')?.getBoundingClientRect();
    const safe = {
      ...DEFAULT_SAFE,
      left: stage && left ? left.right - stage.left + 40 : DEFAULT_SAFE.left,
      right: stage && right ? stage.right - right.left + 40 : DEFAULT_SAFE.right,
    };
    setCam((c) => ensureVisible(c, vp, selectedPoint, safe));
    // только при смене выбора, не на каждом тике
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionKey, vp.w > 0]);

  const t = vp.w ? transform(cam, vp) : { scale: 0, offX: 0, offY: 0 };
  const screen = (p: Point) => worldToScreen(p, cam, vp);
  // Метку, центр которой за краем окна карты, не показываем: обрезанная кнопка не должна ловить касания.
  const onStage = ([x, y]: Point) => x >= 0 && y >= 0 && x <= vp.w && y <= vp.h;
  const anchorsOn = !artProblem;

  // --- ввод: перетаскивание, щипок, колесо ---
  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    const d: DragState = drag.current ?? { pointers: new Map(), start: [e.clientX, e.clientY], cam, moved: false };
    d.pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (d.pointers.size === 1) { d.start = [e.clientX, e.clientY]; d.cam = cam; d.moved = false; }
    if (d.pointers.size === 2) {
      const [a, b] = [...d.pointers.values()] as [Point, Point];
      d.pinch = { dist: Math.hypot(a[0] - b[0], a[1] - b[1]), zoom: cam.zoom };
      d.cam = cam;
    }
    drag.current = d;
  };
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d || !d.pointers.has(e.pointerId)) return;
      d.pointers.set(e.pointerId, [e.clientX, e.clientY]);
      const rect = ref.current!.getBoundingClientRect();
      if (d.pointers.size >= 2 && d.pinch) {
        const [a, b] = [...d.pointers.values()] as [Point, Point];
        const dist = Math.hypot(a[0] - b[0], a[1] - b[1]);
        const mid: Point = [(a[0] + b[0]) / 2 - rect.left, (a[1] + b[1]) / 2 - rect.top];
        d.moved = true;
        setCam(zoomAt(d.cam, vp, d.pinch.zoom * (dist / d.pinch.dist), mid[0], mid[1]));
        return;
      }
      const dx = e.clientX - d.start[0], dy = e.clientY - d.start[1];
      if (!d.moved && Math.hypot(dx, dy) < 5) return;
      d.moved = true;
      setCam(clampCamera({ ...d.cam, panX: d.cam.panX + dx, panY: d.cam.panY + dy }, vp));
    };
    const up = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      d.pointers.delete(e.pointerId);
      if (d.moved) suppressClick.current = true;
      if (d.pointers.size === 0) drag.current = null;
      else if (d.pointers.size === 1) { const p = [...d.pointers.values()][0]!; d.start = p; d.cam = cam; d.pinch = undefined; }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [vp, cam]);
  useEffect(() => {
    const el = ref.current!;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      setCam((c) => zoomAt(c, vp, c.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX - rect.left, e.clientY - rect.top));
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, [vp]);
  const zoomBy = (k: number) => setCam((c) => zoomAt(c, vp, c.zoom * k, vp.w / 2, vp.h / 2));

  const clickGuard = (e: React.MouseEvent) => {
    if (suppressClick.current) { suppressClick.current = false; e.stopPropagation(); e.preventDefault(); }
  };
  const keySelect = (fn: () => void) => (e: ReactKeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); }
  };

  // --- данные слоёв ---
  const openIncidents = game.incidents.filter(isOpen);
  const selIncident = selection?.kind === 'incident' ? game.incidents.find((i) => i.id === selection.id) : undefined;
  const preview = useMemo(() => {
    const lines: { pts: Point[]; kind: 'active' | 'preview' }[] = [];
    for (const q of game.squads) {
      if (!q.movement) continue;
      const inc = game.incidents.find((i) => i.id === q.assignedIncidentId);
      const target = inc && incidentPoint(inc);
      const related = (selection?.kind === 'squad' && selection.id === q.id) || (selIncident && selIncident.id === q.assignedIncidentId);
      if (target && related) lines.push({ pts: routePolyline(q.movement.route, target), kind: 'active' });
    }
    if (previewSquadId && selIncident) {
      const q = game.squads.find((x) => x.id === previewSquadId);
      const target = incidentPoint(selIncident);
      const d = districtById(selIncident.districtId);
      const r = q && d ? buildRoute(q.currentNodeId, d.serviceNode, game.roadClosures) : null;
      if (r && target) lines.push({ pts: routePolyline(r, target), kind: 'preview' });
    }
    return lines;
  }, [game, selection, selIncident, previewSquadId]);

  const clockStart = BALANCE.shift.startClockMinute;
  const night = nightLevel(clockStart + game.minute + sub);
  const weather = weatherForShift(game.seed, game.shift);
  const weatherOn = game.phase === 'ACTIVE' && weatherIntensity(weather, game.minute) > 0.05;
  const hot = game.districts.filter((d) => districtMood(d.safety) !== 'calm');

  const visibleSquads = game.squads.filter((q) => layers.patrols || MOVING.includes(q.status) || (selection?.kind === 'squad' && selection.id === q.id));
  const squadOffsets = new Map<string, number>();
  const seen = new Map<string, number>();
  for (const q of visibleSquads) {
    const p = squadPoint(game, q, sub);
    const key = `${p[0].toFixed(3)},${p[1].toFixed(3)}`;
    const n = seen.get(key) ?? 0;
    squadOffsets.set(q.id, n);
    seen.set(key, n + 1);
  }

  const renderSquad = (q: GameState['squads'][number]) => {
    const [x, y] = screen(squadPoint(game, q, sub));
    const off = (squadOffsets.get(q.id) ?? 0) * 46;
    if (!onStage([x + 30 + off, y - 22])) return null;
    const st = SQUAD_STATUS[q.status];
    const selected = selection?.kind === 'squad' && selection.id === q.id;
    return (
      <button
        key={q.id}
        className={`marker squad tone-${st.tone}${selected ? ' selected' : ''}${markerArtUrl(SQUAD_MARKER) ? ' shield' : ''}`}
        style={{ left: x + 30 + off, top: y - 22 }}
        onClick={() => onSelect({ kind: 'squad', id: q.id })}
        aria-label={`Отряд «${q.name}»: ${st.label}`}
        aria-pressed={selected}
        data-testid={`marker-squad-${q.id}`}
      >
        {markerArtUrl(SQUAD_MARKER) ? <img src={markerArtUrl(SQUAD_MARKER)} alt="" draggable={false} /> : <Icon name="truck" />}
      </button>
    );
  };

  return (
    <section
      className="map-stage"
      aria-label="Карта города"
      data-testid="map-stage"
      ref={ref}
      onPointerDown={onPointerDown}
      onClickCapture={clickGuard}
    >
      <img className="map-backdrop" src={mapNightUrl} alt="" aria-hidden="true" draggable={false} />
      {vp.w > 0 && (
        <div
          className="map-world"
          data-testid="map-world"
          style={{ width: W, height: H, transform: `translate(${t.offX}px, ${t.offY}px) scale(${t.scale})` }}
        >
          <img
            src={mapUrl}
            width={W}
            height={H}
            alt="Карта города Карвен, вид сверху: шесть районов"
            draggable={false}
            data-testid="map-image"
            onClick={() => onSelect(null)}
            onLoad={(e) => {
              const img = e.currentTarget;
              if (img.naturalWidth !== MAP.art.width || img.naturalHeight !== MAP.art.height)
                setArtProblem(`Изображение карты ${img.naturalWidth}×${img.naturalHeight} не совпадает с конфигом ${MAP.art.width}×${MAP.art.height}. Метки отключены.`);
            }}
            onError={() => setArtProblem('Не удалось загрузить изображение карты.')}
          />
          <img
            className="map-night"
            src={mapNightUrl}
            width={W}
            height={H}
            alt=""
            aria-hidden="true"
            draggable={false}
            data-testid="map-night"
            data-night={night.toFixed(2)}
            style={{ opacity: night }}
            onClick={() => onSelect(null)}
          />
          {anchorsOn && (
            <svg className="map-geo" viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
              {MAP.districts.map((d) => {
                return (
                  <polygon
                    key={d.id}
                    points={d.hitPolygon.map(toSvg).join(' ')}
                    className="district-hit"
                    data-testid={`district-${d.id}`}
                    role="button"
                    tabIndex={0}
                    aria-label={`Район: ${d.name}`}
                    onClick={() => onSelect({ kind: 'district', id: d.id })}
                    onKeyDown={keySelect(() => onSelect({ kind: 'district', id: d.id }))}
                    onPointerEnter={() => setHoverDistrict(d.id)}
                    onPointerLeave={() => setHoverDistrict(null)}
                    onFocus={() => setHoverDistrict(d.id)}
                    onBlur={() => setHoverDistrict(null)}
                  />
                );
              })}
              {layers.infrastructure && MAP.edges.map((e) => (
                <polyline key={e.id} points={e.polyline.map(toSvg).join(' ')} className={`road${game.roadClosures.includes(e.id) ? ' closed' : ''}`} />
              ))}
              {preview.map((l, i) => (
                <polyline key={i} points={l.pts.map(toSvg).join(' ')} className={`route ${l.kind}`} data-testid={`route-${l.kind}`} />
              ))}
            </svg>
          )}
        </div>
      )}

      {vp.w > 0 && (
        <MapLife game={game} transform={t} width={vp.w} height={vp.h} level={effects} clockStart={clockStart} />
      )}

      {anchorsOn && vp.w > 0 && (
        <div className="map-screen">
          {layers.districts && MAP.districts.map((d) => {
            const [x, y] = screen(d.labelAnchor);
            return (
              <span
                key={d.id}
                className={`district-label${hoverDistrict === d.id ? ' hover' : ''}${selection?.kind === 'district' && selection.id === d.id ? ' selected' : ''}`}
                style={{ left: x, top: y }}
                data-testid={`district-label-${d.id}`}
              >{d.name}</span>
            );
          })}
          {layers.risks && game.districts.filter((d) => d.threat > 0).map((d) => {
            const [x, y] = screen(districtById(d.id)!.labelAnchor);
            return (
              <span key={d.id} className="risk-badge" style={{ left: x, top: y + 26 }} data-testid={`risk-${d.id}`}>
                <Icon name="shield" /> Известные угрозы: {d.threat}
              </span>
            );
          })}
          {layers.infrastructure && MAP.districts.map((d) => {
            const [x, y] = screen(nodePosition(d.serviceNode));
            return <span key={d.id} className="depot" style={{ left: x, top: y }} title={`Опорный узел: ${d.name}`} aria-hidden="true" />;
          })}
          {/* Отряды на базе — под метками вызовов, чтобы не закрывали их; отряды в пути — поверх. */}
          {visibleSquads.filter((q) => !MOVING.includes(q.status)).map(renderSquad)}
          {layers.events && (() => {
            const items = openIncidents.flatMap((inc) => {
              const p = incidentPoint(inc);
              if (!p) return [];
              const [x, y] = screen(p);
              return onStage([x, y]) ? [{ id: inc.id, x, y, severity: inc.severity }] : [];
            });
            const lay = layoutMarkers(items, expandedCluster);
            const byId = new Map(openIncidents.map((i) => [i.id, i]));
            return (
              <>
                {lay.markers.some((m) => m.moved) && (
                  <svg className="marker-leaders" aria-hidden="true">
                    {lay.markers.filter((m) => m.moved).map((m) => <line key={m.id} x1={m.anchorX} y1={m.anchorY} x2={m.x} y2={m.y} />)}
                    {lay.markers.filter((m) => m.moved).map((m) => <circle key={`a-${m.id}`} cx={m.anchorX} cy={m.anchorY} r={4} />)}
                  </svg>
                )}
                {lay.markers.map((m) => {
                  const inc = byId.get(m.id)!;
                  const selected = selection?.kind === 'incident' && selection.id === inc.id;
                  const art = markerArtUrl(INCIDENT_MARKER[inc.templateId] ?? '');
                  const link = incidentCaseLink(game, inc);
                  return (
                    <button
                      key={inc.id}
                      className={`marker incident sev-${inc.severity} st-${inc.state}${selected ? ' selected' : ''}${art ? ' shield' : ''}${link ? ' case-link' : ''}`}
                      style={{ left: m.x, top: m.y }}
                      onClick={() => onSelect({ kind: 'incident', id: inc.id })}
                      aria-label={`Вызов: ${inc.title}${link ? `. Связан с делом №${link.number}` : ''}`}
                      aria-pressed={selected}
                      data-testid={`marker-incident-${inc.id}`}
                    >
                      {art ? <img src={art} alt="" draggable={false} /> : <Icon name={INCIDENT_ICON[inc.templateId] ?? 'warning'} />}
                      {link && <span className="case-badge" data-testid={`case-badge-${inc.id}`}><Icon name="search" />№{link.number}</span>}
                    </button>
                  );
                })}
                {lay.clusters.map((c) => (
                  <button
                    key={c.key}
                    className={`marker cluster sev-${c.top}${markerArtUrl(CLUSTER_MARKER) ? ' shield' : ''}`}
                    style={{ left: c.x, top: c.y }}
                    onClick={() => setExpandedCluster(c.key)}
                    aria-label={`Вызовов рядом: ${c.ids.length}. Развернуть`}
                    data-testid="marker-cluster"
                  >
                    {markerArtUrl(CLUSTER_MARKER) && <img src={markerArtUrl(CLUSTER_MARKER)} alt="" draggable={false} />}
                    <b>{c.ids.length}</b>
                  </button>
                ))}
              </>
            );
          })()}
          {visibleSquads.filter((q) => MOVING.includes(q.status)).map(renderSquad)}
        </div>
      )}

      <div className="map-ambient" data-testid="map-ambient" aria-live="off">
        <span>{night > 0.6 ? 'Ночь' : night > 0.15 ? (game.minute < 120 ? 'Рассвет' : 'Сумерки') : 'День'}</span>
        {weatherOn && <span data-testid="map-weather">{WEATHER_LABEL[weather.kind]}</span>}
        {hot.length > 0 && <span className="hot" title={hot.map((d) => `${d.name}: ${MOOD_LABEL[districtMood(d.safety)]}`).join('\n')}>Неспокойно: {hot.length}</span>}
      </div>
      {artProblem && <div className="map-warning" role="alert">{artProblem}</div>}
      {expandedCluster && layers.events && expandedCluster.split('|').some((id) => openIncidents.some((i) => i.id === id)) && (
        <button className="btn cluster-collapse" onClick={() => setExpandedCluster(null)} data-testid="cluster-collapse">Свернуть группу вызовов</button>
      )}

      {!leftPanelOpen && (
        <div className="map-tools">
          <button className="btn" onClick={onOpenLeftPanel} aria-controls="incident-panel" aria-expanded={false}>
            <Icon name="list" /> <span className="label">Вызовы</span> <span className="count">{openIncidents.length}</span>
          </button>
        </div>
      )}
      <div className="zoom-tools" role="group" aria-label="Масштаб карты">
        <button className="btn icon-only" onClick={() => zoomBy(1.25)} aria-label="Приблизить" data-testid="zoom-in"><Icon name="plus" /></button>
        <button className="btn icon-only" onClick={() => zoomBy(0.8)} aria-label="Отдалить" data-testid="zoom-out"><Icon name="minus" /></button>
        <button className="btn icon-only" onClick={() => setCam({ zoom: 1, panX: 0, panY: 0 })} aria-label="Сбросить масштаб" data-testid="zoom-reset"><Icon name="crosshair" /></button>
      </div>
      <output className="visually-hidden" data-testid="camera-zoom">{cam.zoom.toFixed(2)}</output>
    </section>
  );
}
