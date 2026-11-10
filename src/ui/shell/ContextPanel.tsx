import { useState } from 'react';
import { dispatchBlocker } from '../../core/reduce';
import { DISPATCH_RULES, forecastWord, incidentProfile, tacticById } from '../../core/dispatch';
import { buildRoute, etaMinutes } from '../../core/map/graph';
import { districtById } from '../../core/map/mapConfig';
import { houseText, lateKind, publicAftermath, templateOf } from '../../core/events';
import { CASE_LINK_TEXT, incidentCaseLink } from '../../core/caseGuide';
import { isOpen } from '../../core/selectors';
import type { GameState } from '../../core/types';
import { dispatch } from '../../store';
import { Icon } from '../Icon';
import { INCIDENT_STATE_LABEL, SEVERITY_LABEL, SQUAD_STATUS } from '../labels';
import type { Selection } from '../uiState';
import { SquadCard } from './SquadCard';
import { ReadySquad } from './ReadySquad';

interface Props {
  game: GameState;
  selection: NonNullable<Selection>;
  onClose: () => void;
  onSelect: (s: Selection) => void;
  onPreview: (squadId: string | null) => void;
  onOpenDispatch: (incidentId: string, squadId: string | null) => void;
  onOpenCase?: (caseId: string) => void;
}

/** Правая контекстная карточка: открывается только при выборе объекта (ТЗ §3.1). */
export function ContextPanel({ game, selection, onClose, onSelect, onPreview, onOpenDispatch, onOpenCase }: Props) {
  return (
    <aside className="panel right-panel" aria-label="Карточка" data-testid="right-panel">
      <div className="panel-header">
        <h2>{selection.kind === 'incident' ? 'Карточка происшествия' : selection.kind === 'district' ? 'Район' : 'Отряд'}</h2>
        <button className="btn icon-only" onClick={onClose} aria-label="Закрыть карточку"><Icon name="close" /></button>
      </div>
      <div className="panel-body card-body">
        {selection.kind === 'incident' && <IncidentCard game={game} id={selection.id} onPreview={onPreview} onSelect={onSelect} onOpenDispatch={onOpenDispatch} onOpenCase={onOpenCase} />}
        {selection.kind === 'district' && <DistrictCard game={game} id={selection.id} onSelect={onSelect} />}
        {selection.kind === 'squad' && <SquadCard game={game} id={selection.id} onSelect={onSelect} />}
      </div>
    </aside>
  );
}

function IncidentCard({ game, id, onPreview, onSelect, onOpenDispatch, onOpenCase }: { game: GameState; id: string; onPreview: Props['onPreview']; onSelect: Props['onSelect']; onOpenDispatch: Props['onOpenDispatch']; onOpenCase?: Props['onOpenCase'] }) {
  const [statusOpen, setStatusOpen] = useState<string | null>(null);
  const inc = game.incidents.find((i) => i.id === id);
  if (!inc) return <p className="empty">Вызов закрыт или не найден.</p>;
  const district = districtById(inc.districtId)!;
  const left = inc.deadlineMinute - game.minute;
  const assigned = game.squads.find((q) => q.assignedIncidentId === inc.id);
  const canSend = ['new', 'acknowledged', 'escalated'].includes(inc.state);
  const prof = incidentProfile(inc);
  const op = assigned?.operation;
  return (
    <div data-testid="incident-card">
      <h3 className="card-title">{inc.title}</h3>
      <p className="muted">
        {district.name} · <span className={`sev-text sev-${inc.severity}`}>{SEVERITY_LABEL[inc.severity]}</span> · <span data-testid="card-class">{DISPATCH_RULES.classes[prof.incidentClass].label}</span>
      </p>
      {prof.known && <p className="known">{houseText(prof.known)}</p>}
      {(() => {
        // Вызов из сюжета расследования: предыстория дела и что даст выезд (без скрытой правды).
        const link = incidentCaseLink(game, inc);
        if (!link) return null;
        return (
          <div className="case-link-box" data-testid="card-case-link">
            <h4><Icon name="search" /> Дело №{link.number} «{link.title}»</h4>
            <p><b>Предыстория.</b> {link.backstory}</p>
            <p className="muted">{CASE_LINK_TEXT[link.mode]}</p>
            {link.mode !== 'opens' && link.mode !== 'pending' && onOpenCase && (
              <button className="btn" onClick={() => onOpenCase(link.caseId)} data-testid="card-open-case"><Icon name="folder" /> Открыть дело</button>
            )}
          </div>
        );
      })()}
      {(() => {
        // W10: что будет при опоздании и что на кону (без скрытой правды и без строк о деле).
        const t = templateOf(inc);
        const stakes = publicAftermath(t);
        const late = t?.lateText;
        if (!late && !stakes.length) return null;
        const word = { escalate: 'Если опоздать, обострится', expire: 'Если опоздать, исчезнет', branch: 'Если опоздать, станет другим событием' }[lateKind(inc)];
        return (
          <div className="stakes" data-testid="card-stakes">
            {late && isOpen(inc) && <p className="late"><b>{word}:</b> {houseText(late)}</p>}
            {stakes.length > 0 && <ul className="plain-list">{stakes.map((x) => <li key={x}>{x}</li>)}</ul>}
          </div>
        );
      })()}
      <dl className="kv">
        <dt>Состояние</dt><dd data-testid="card-state">{INCIDENT_STATE_LABEL[inc.state]}</dd>
        {['new', 'acknowledged'].includes(inc.state) && (<><dt>До ухудшения</dt><dd>{Math.max(0, left)} мин</dd></>)}
        {assigned && (<><dt>Отряд</dt><dd><button className="link" onClick={() => onSelect({ kind: 'squad', id: assigned.id })}>«{assigned.name}»</button></dd></>)}
        {op && (<><dt>Тактика</dt><dd data-testid="card-tactic">{tacticById(op.tactic).label}</dd><dt>Прогноз</dt><dd data-testid="card-forecast">{forecastWord(op.forecast)}, {Math.round(op.forecast.low * 100)}–{Math.round(op.forecast.high * 100)}%</dd></>)}
        {assigned?.movement && (<><dt>Прибытие</dt><dd data-testid="card-eta">≈{etaMinutes(assigned.movement.route, assigned.movement.elapsed)} мин</dd></>)}
      </dl>
      {inc.state === 'new' && (
        <button className="btn wide" onClick={() => dispatch({ type: 'ACKNOWLEDGE_INCIDENT', incidentId: inc.id })}>
          <Icon name="check" /> Принять вызов
        </button>
      )}
      {canSend && (
        <>
          <button className="btn primary wide" disabled={game.phase !== 'ACTIVE'} onClick={() => onOpenDispatch(inc.id, null)} data-testid="open-dispatch">
            <Icon name="users" /> Подобрать отряд
          </button>
          <h4 className="section-title">Готовые отряды</h4>
          <ul className="dispatch-list" onPointerLeave={() => onPreview(null)}>
            {game.squads.map((q) => {
              const reason = dispatchBlocker(game, q, inc);
              const r = !reason ? buildRoute(q.currentNodeId, district.serviceNode, game.roadClosures) : null;
              return (
                <li key={q.id}>
                  <ReadySquad
                    game={game} squad={q} testId={`dispatch-${q.id}`}
                    subtitle={r ? `≈${etaMinutes(r, 0)} мин · 1,25 РЕ` : reason ?? SQUAD_STATUS[q.status].label}
                    disabled={!!reason || game.phase !== 'ACTIVE'}
                    onPointerEnter={() => onPreview(r ? q.id : null)} onFocus={() => onPreview(r ? q.id : null)}
                    onPick={() => onOpenDispatch(inc.id, q.id)}
                    expanded={statusOpen === q.id} onToggle={() => setStatusOpen(statusOpen === q.id ? null : q.id)}
                  />
                </li>
              );
            })}
          </ul>
          {game.phase !== 'ACTIVE' && <p className="hint">Отправка доступна после начала смены.</p>}
        </>
      )}
    </div>
  );
}

function DistrictCard({ game, id, onSelect }: { game: GameState; id: string; onSelect: Props['onSelect'] }) {
  const d = game.districts.find((x) => x.id === id);
  const geo = districtById(id);
  if (!d || !geo) return null;
  const incidents = game.incidents.filter((i) => i.districtId === id && isOpen(i));
  return (
    <div data-testid="district-card" data-district={id}>
      <h3 className="card-title">{d.name}</h3>
      <p className="muted">{geo.description}</p>
      <dl className="kv">
        <dt>Безопасность</dt><dd>{d.safety}%</dd>
        <dt>Доверие жителей</dt><dd>{d.civilianTrust}%</dd>
        <dt>Известные угрозы</dt><dd>{d.threat}</dd>
      </dl>
      <h4 className="section-title">Открытые вызовы · {incidents.length}</h4>
      <ul className="plain-list">
        {incidents.map((i) => (
          <li key={i.id}><button className="btn wide" onClick={() => onSelect({ kind: 'incident', id: i.id })}>{i.title}</button></li>
        ))}
      </ul>
      <p className="hint">Районы — места происшествий и патрулирования, не территории для захвата.</p>
    </div>
  );
}
