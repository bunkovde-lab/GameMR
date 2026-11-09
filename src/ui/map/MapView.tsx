import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import mapUrl from '../../../assets/approved_map_original_1672x941.png';
import { buildRoute, routePolyline } from '../../core/map/graph';
import { MAP, districtById, nodePosition, type Point } from '../../core/map/mapConfig';
import { isOpen } from '../../core/selectors';
import type { GameState } from '../../core/types';
import { Icon } from '../Icon';
import { SQUAD_STATUS } from '../labels';
import type { LayerId, Selection } from '../uiState';
import { DEFAULT_SAFE, clampCamera, ensureVisible, transform, worldToScreen, zoomAt, type Camera, type Viewport, W, H } from './camera';
import { INCIDENT_ICON, incidentPoint, squadPoint } from './entities';
import { layoutMarkers } from './markerLayout';

interface Props {
  game: GameState;
  selection: Selection;
  previewSquadId: string | null;
  layers: Record<LayerId, boolean>;
  leftPanelOpen: boolean;
  onSelect: (s: Selection) => void;
  onToggleLayer: (l: LayerId) => void;
  onOpenLeftPanel: () => void;
}

const LAYER_BUTTONS: { id: LayerId; label: string; icon: 'warning' | 'truck' | 'map' | 'shield' | 'pin' }[] = [
  { id: 'events', label: 'События', icon: 'warning' },
  { id: 'patrols', label: 'Патрули', icon: 'truck' },
  { id: 'districts', label: 'Районы', icon: 'map' },
  { id: 'risks', label: 'Угрозы', icon: 'shield' },
  { id: 'infrastructure', label: 'Объекты', icon: 'pin' },
];

interface DragState { pointers: Map<number, Point>; start: Point; cam: Camera; moved: boolean; pinch?: { dist: number; zoom: number } }

const toSvg = (p: Point) => `${p[0] * W},${p[1] * H}`;

/**
 * Карта W3: утверждённый арт + SVG-слой геометрии в одной матрице, маркеры — в экранном слое
 * постоянного размера (44 px), позиции через worldToScreen.
 */
export function MapView({ game, selection, previewSquadId, layers, leftPanelOpen, onSelect, onToggleLayer, onOpenLeftPanel }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [vp, setVp] = useState<Viewport>({ w: 0, h: 0 });
  const [cam, setCam] = useState<Camera>({ zoom: 1, panX: 0, panY: 0 });
  const [artProblem, setArtProblem] = useState<string | null>(null);
  const [hoverDistrict, setHoverDistrict] = useState<string | null>(null);
  const [expandedCluster, setExpandedCluster] = useState<string | null>(null);
  const drag = useRef<DragState | null>(null);
  const suppressClick = useRef(false);

  useLayoutEffect(() => {
    const el = ref.current!;
    const measure = () => setVp({ w: el.clientWidth, h: el.clientHeight });
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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

  const visibleSquads = game.squads.filter((q) => layers.patrols || ['en_route', 'on_scene', 'returning'].includes(q.status) || (selection?.kind === 'squad' && selection.id === q.id));
  const squadOffsets = new Map<string, number>();
  const seen = new Map<string, number>();
  for (const q of visibleSquads) {
    const p = squadPoint(game, q);
    const key = `${p[0].toFixed(3)},${p[1].toFixed(3)}`;
    const n = seen.get(key) ?? 0;
    squadOffsets.set(q.id, n);
    seen.set(key, n + 1);
  }

  return (
    <section
      className="map-stage"
      aria-label="Карта города"
      data-testid="map-stage"
      ref={ref}
      onPointerDown={onPointerDown}
      onClickCapture={clickGuard}
    >
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
            alt="Утверждённая карта города Карвен: шесть районов"
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
          {anchorsOn && (
            <svg className="map-geo" viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
              {MAP.districts.map((d) => {
                const selected = selection?.kind === 'district' && selection.id === d.id;
                return (
                  <polygon
                    key={d.id}
                    points={d.hitPolygon.map(toSvg).join(' ')}
                    className={`district-hit${selected ? ' selected' : ''}${layers.districts ? ' outlined' : ''}${hoverDistrict === d.id ? ' hover' : ''}`}
                    data-testid={`district-${d.id}`}
                    role="button"
                    tabIndex={0}
                    aria-label={`Район: ${d.name}`}
                    onClick={() => onSelect({ kind: 'district', id: d.id })}
                    onKeyDown={keySelect(() => onSelect({ kind: 'district', id: d.id }))}
                    onPointerEnter={() => setHoverDistrict(d.id)}
                    onPointerLeave={() => setHoverDistrict(null)}
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

      {anchorsOn && vp.w > 0 && (
        <div className="map-screen">
          {layers.districts && MAP.districts.map((d) => {
            const [x, y] = screen(d.labelAnchor);
            return (
              <span key={d.id} className="district-label" style={{ left: x, top: y }}>{d.name}</span>
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
                  return (
                    <button
                      key={inc.id}
                      className={`marker incident sev-${inc.severity} st-${inc.state}${selected ? ' selected' : ''}`}
                      style={{ left: m.x, top: m.y }}
                      onClick={() => onSelect({ kind: 'incident', id: inc.id })}
                      aria-label={`Вызов: ${inc.title}`}
                      aria-pressed={selected}
                      data-testid={`marker-incident-${inc.id}`}
                    >
                      <Icon name={INCIDENT_ICON[inc.templateId] ?? 'warning'} />
                    </button>
                  );
                })}
                {lay.clusters.map((c) => (
                  <button
                    key={c.key}
                    className={`marker cluster sev-${c.top}`}
                    style={{ left: c.x, top: c.y }}
                    onClick={() => setExpandedCluster(c.key)}
                    aria-label={`Вызовов рядом: ${c.ids.length}. Развернуть`}
                    data-testid="marker-cluster"
                  >
                    <b>{c.ids.length}</b>
                  </button>
                ))}
              </>
            );
          })()}
          {visibleSquads.map((q) => {
            const [x, y] = screen(squadPoint(game, q));
            const off = (squadOffsets.get(q.id) ?? 0) * 46;
            if (!onStage([x + 30 + off, y - 22])) return null;
            const st = SQUAD_STATUS[q.status];
            const selected = selection?.kind === 'squad' && selection.id === q.id;
            return (
              <button
                key={q.id}
                className={`marker squad tone-${st.tone}${selected ? ' selected' : ''}`}
                style={{ left: x + 30 + off, top: y - 22 }}
                onClick={() => onSelect({ kind: 'squad', id: q.id })}
                aria-label={`Отряд «${q.name}»: ${st.label}`}
                aria-pressed={selected}
                data-testid={`marker-squad-${q.id}`}
              >
                <Icon name="truck" />
              </button>
            );
          })}
        </div>
      )}

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
      <div className="layer-tools" role="group" aria-label="Слои карты">
        {LAYER_BUTTONS.map((l) => (
          <button key={l.id} className="btn" aria-pressed={layers[l.id]} onClick={() => onToggleLayer(l.id)} data-testid={`layer-${l.id}`} title={l.label}>
            <Icon name={l.icon} /> <span className="label">{l.label}</span>
          </button>
        ))}
      </div>
      <output className="visually-hidden" data-testid="camera-zoom">{cam.zoom.toFixed(2)}</output>
    </section>
  );
}
