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
import { MAP_LAYERS, type Selection } from '../uiState';
import { getSubMinute } from '../useGameLoop';
import { MOOD_LABEL, WEATHER_LABEL, districtMood, loadEffectsLevel, nightLevel, weatherForShift, weatherIntensity, type EffectsLevel } from './cityLife';
import { MapLife } from './MapLife';
import { baseScale, transform, worldToScreen, type Camera, type Viewport, W, H } from './camera';
import { markerArtUrl } from '../art';
import { incidentCaseLink } from '../../core/caseGuide';
import { SANDBOX_GOAL_LABEL, sandboxGoalFor } from '../../core/sandbox';
import { CLUSTER_MARKER, INCIDENT_ICON, INCIDENT_MARKER, SQUAD_MARKER, incidentPoint, squadPoint } from './entities';
import { layoutMarkers } from './markerLayout';

interface Props {
  game: GameState;
  selection: Selection;
  previewSquadId: string | null;
  onSelect: (s: Selection) => void;
}

const layers = MAP_LAYERS;
const MOVING: string[] = ['en_route', 'on_scene', 'returning'];


/** Над щитом у верхнего края остаётся место для таймера (≈28 px). */
const TOP_BAR = 28;
/** Карта зафиксирована: весь город всегда целиком в окне, без приближения, сдвига и кнопок масштаба. */
const CAM: Camera = { zoom: 1, panX: 0, panY: 0 };
/** Сколько минут до ухудшения считать «горит»: таймер краснеет. Порог интерфейса, не баланс. */
const URGENT_MIN = 15;
const formatLeft = (min: number) => {
  const m = Math.max(0, Math.round(min));
  return m < 60 ? `${m} мин` : `${Math.floor(m / 60)} ч ${String(m % 60).padStart(2, '0')}`;
};
const STATE_SHORT: Partial<Record<string, string>> = { escalated: 'ухудшение', assigned: 'назначен', en_route: 'в пути', on_scene: 'на месте' };
/** Ярлык над меткой вызова: время до ухудшения, пока вызов ждёт отряд, иначе — короткое состояние. */
function incidentTimer(inc: GameState['incidents'][number], minute: number): { text: string; tone: 'time' | 'urgent' | 'state' } {
  if (['new', 'acknowledged'].includes(inc.state)) {
    const left = inc.deadlineMinute - minute;
    return { text: formatLeft(left), tone: left <= URGENT_MIN ? 'urgent' : 'time' };
  }
  return { text: STATE_SHORT[inc.state] ?? '', tone: inc.state === 'escalated' ? 'urgent' : 'state' };
}

const toSvg = (p: Point) => `${p[0] * W},${p[1] * H}`;

/**
 * Карта ART-019 (вид сверху, день/ночь) поверх геометрии W3: арт + SVG-слой геометрии в одной матрице, маркеры — в экранном слое
 * постоянного размера (44 px), позиции через worldToScreen.
 */
export function MapView({ game, selection, previewSquadId, onSelect }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  // Высота щита вызова (CSS --mk-inc): от неё зависят раздвижка меток и отступ от краёв окна.
  const [markerH, setMarkerH] = useState(112);
  const [effects, setEffects] = useState<EffectsLevel>(loadEffectsLevel);
  const [, setFrame] = useState(0);
  const [artProblem, setArtProblem] = useState<string | null>(null);
  const [hoverDistrict, setHoverDistrict] = useState<string | null>(null);
  const [expandedCluster, setExpandedCluster] = useState<string | null>(null);

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

  useLayoutEffect(() => {
    const h = parseFloat(getComputedStyle(ref.current!).getPropertyValue('--mk-inc')) || 112;
    setMarkerH((cur) => (cur === h ? cur : h));
  }, [size.w, size.h]);
  // Город прижат к левому краю окна карты и вписан в него целиком; панелей слева нет. Карточка справа открывается
  // поверх свободной полосы справа от города: карта не сдвигается и не меняет размер при открытии/закрытии карточки.
  const vp = useMemo<Viewport>(() => ({ w: size.w, h: size.h, alignLeft: true }), [size.w, size.h]);
  // Ширина свободной полосы справа от города (при zoom 1) — для карточки справа (CSS --map-free-right).
  const freeRight = vp.w ? Math.max(0, Math.round(vp.w - W * baseScale(vp))) : 0;
  useLayoutEffect(() => {
    const host = ref.current?.parentElement;
    host?.style.setProperty('--map-free-right', `${freeRight}px`);
  }, [freeRight]);

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


  const t = vp.w ? transform(CAM, vp) : { scale: 0, offX: 0, offY: 0 };
  const screen = (p: Point) => worldToScreen(p, CAM, vp);
  // Метку, центр которой за краем окна карты, не показываем: обрезанная кнопка не должна ловить касания.
  const onStage = ([x, y]: Point) => x >= 0 && y >= 0 && x <= vp.w && y <= vp.h;
  const anchorsOn = !artProblem;

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
                const locked = !!game.sandbox && !game.sandbox.unlockedDistricts.includes(d.id);
                return (
                  <polygon
                    key={d.id}
                    points={d.hitPolygon.map(toSvg).join(' ')}
                    className={`district-hit${locked ? ' locked' : ''}`}
                    data-testid={`district-${d.id}`}
                    data-locked={locked || undefined}
                    role="button"
                    tabIndex={0}
                    aria-label={`Район: ${d.name}${locked ? '. Закрыт до итога расследования' : ''}`}
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
            const locked = !!game.sandbox && !game.sandbox.unlockedDistricts.includes(d.id);
            return (
              <span
                key={d.id}
                className={`district-label${hoverDistrict === d.id ? ' hover' : ''}${selection?.kind === 'district' && selection.id === d.id ? ' selected' : ''}${locked ? ' locked' : ''}`}
                style={{ left: x, top: y }}
                data-testid={`district-label-${d.id}`}
              >{d.name}{locked && <small>Закрыто расследованием</small>}</span>
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
            // Щит стоит кончиком в точке вызова, над ним — таймер: точку держим так, чтобы оба целиком были в окне.
            const mw = markerH * 0.8;
            const lay = layoutMarkers(items, expandedCluster, {
              width: mw,
              bounds: { minX: mw / 2 + 4, maxX: Math.max(mw / 2 + 4, vp.w - mw / 2 - 4), minY: markerH + TOP_BAR, maxY: Math.max(markerH + TOP_BAR, vp.h - 6) },
            });
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
                  const goal = sandboxGoalFor(inc);
                  const timer = incidentTimer(inc, game.minute);
                  return (
                    <button
                      key={inc.id}
                      className={`marker incident sev-${inc.severity} st-${inc.state}${selected ? ' selected' : ''}${art ? ' shield' : ''}${link ? ' case-link' : ''}`}
                      style={{ left: m.x, top: m.y }}
                      onClick={() => onSelect({ kind: 'incident', id: inc.id })}
                      aria-label={`Вызов: ${inc.title}${link ? `. Связан с делом №${link.number}` : ''}${goal ? `. Цель: ${SANDBOX_GOAL_LABEL[goal]}` : ''}`}
                      aria-pressed={selected}
                      data-testid={`marker-incident-${inc.id}`}
                      data-moved={m.moved || undefined}
                    >
                      {art ? <img src={art} alt="" draggable={false} /> : <Icon name={INCIDENT_ICON[inc.templateId] ?? 'warning'} />}
                      <span className={`mk-timer tone-${timer.tone}${link ? ' case' : ''}`} data-testid={`timer-${inc.id}`}>
                        {timer.tone !== 'state' && <Icon name="clock" />}
                        <span className="t">{timer.text}</span>
                        {link && <span className="case-no" data-testid={`case-badge-${inc.id}`}>№{link.number}</span>}
                      </span>
                    </button>
                  );
                })}
                {lay.clusters.map((c) => {
                  const soonest = c.ids.map((id) => byId.get(id)!).filter((i) => ['new', 'acknowledged'].includes(i.state))
                    .reduce<number | null>((min, i) => Math.min(min ?? Infinity, i.deadlineMinute - game.minute), null);
                  return (
                  <button
                    key={c.key}
                    className={`marker cluster sev-${c.top}${markerArtUrl(CLUSTER_MARKER) ? ' shield' : ''}`}
                    style={{ left: c.x, top: c.y }}
                    onClick={() => setExpandedCluster(c.key)}
                    aria-label={`Вызовов рядом: ${c.ids.length}. Развернуть`}
                    data-testid="marker-cluster"
                    data-ids={c.ids.join(' ')}
                  >
                    {markerArtUrl(CLUSTER_MARKER) && <img src={markerArtUrl(CLUSTER_MARKER)} alt="" draggable={false} />}
                    <b>{c.ids.length}</b>
                    {soonest !== null && (
                      <span className={`mk-timer tone-${soonest <= URGENT_MIN ? 'urgent' : 'time'}`}><Icon name="clock" /><span className="t">{formatLeft(soonest)}</span></span>
                    )}
                  </button>
                  );
                })}
              </>
            );
          })()}
          {visibleSquads.filter((q) => MOVING.includes(q.status)).map(renderSquad)}
        </div>
      )}

      <div className="map-ambient" data-testid="map-ambient" aria-live="off">
        <span className="calls" data-testid="incident-count" title="Открытых вызовов на карте">Вызовы: {openIncidents.length}</span>
        <span>{night > 0.6 ? 'Ночь' : night > 0.15 ? (game.minute < 120 ? 'Рассвет' : 'Сумерки') : 'День'}</span>
        {weatherOn && <span data-testid="map-weather">{WEATHER_LABEL[weather.kind]}</span>}
        {hot.length > 0 && <span className="hot" title={hot.map((d) => `${d.name}: ${MOOD_LABEL[districtMood(d.safety)]}`).join('\n')}>Неспокойно: {hot.length}</span>}
      </div>
      {artProblem && <div className="map-warning" role="alert">{artProblem}</div>}
      {expandedCluster && layers.events && expandedCluster.split('|').some((id) => openIncidents.some((i) => i.id === id)) && (
        <button className="btn cluster-collapse" onClick={() => setExpandedCluster(null)} data-testid="cluster-collapse">Свернуть группу вызовов</button>
      )}

    </section>
  );
}
