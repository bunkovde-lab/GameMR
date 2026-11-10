import { incidentCaseLink } from '../../core/caseGuide';
import { isOpen } from '../../core/selectors';
import type { GameState } from '../../core/types';
import { dispatch } from '../../store';
import { Icon } from '../Icon';
import { MarkerIcon } from '../art';
import { INCIDENT_MARKER } from '../map/entities';
import { INCIDENT_STATE_LABEL, SEVERITY_LABEL } from '../labels';

interface Props { game: GameState; selectedId: string | null; onSelect: (id: string) => void; onCollapse: () => void }

export function IncidentPanel({ game, selectedId, onSelect, onCollapse }: Props) {
  const open = game.incidents
    .filter(isOpen)
    .sort((a, b) => Number(b.state === 'escalated') - Number(a.state === 'escalated') || a.deadlineMinute - b.deadlineMinute);
  const districtName = (id: string) => game.districts.find((d) => d.id === id)?.name ?? id;
  return (
    <aside className="panel left-panel" id="incident-panel" aria-label="Происшествия" data-testid="left-panel">
      <div className="panel-header">
        <h2>
          <Icon name="radio" /> Вызовы <span className="count" data-testid="incident-count">{open.length}</span>
        </h2>
        <button className="btn icon-only" onClick={onCollapse} aria-label="Свернуть список вызовов">
          <Icon name="close" />
        </button>
      </div>
      <div className="panel-body">
        {open.length === 0 && <p className="empty">Активных вызовов нет.</p>}
        <ul className="incident-list">
          {open.map((inc) => {
            const left = inc.deadlineMinute - game.minute;
            const link = incidentCaseLink(game, inc);
            return (
              <li key={inc.id} className={`incident sev-${inc.severity} st-${inc.state}${selectedId === inc.id ? ' selected' : ''}${link ? ' case-link' : ''}`} data-testid={`incident-${inc.id}`}>
                <div className="incident-head">
                  <button className="incident-title" onClick={() => onSelect(inc.id)} aria-pressed={selectedId === inc.id}>
                    {INCIDENT_MARKER[inc.templateId] && <MarkerIcon markerKey={INCIDENT_MARKER[inc.templateId]!} />}
                    {inc.title}
                    {link && <span className="case-chip" title={`Связан с делом №${link.number} «${link.title}»`} data-testid={`case-chip-${inc.id}`}><Icon name="search" />№{link.number}</span>}
                  </button>
                  <span className="deadline">
                    {inc.state === 'escalated' ? 'ухудшение' : left > 0 && ['new', 'acknowledged'].includes(inc.state) ? `${left} мин` : ''}
                  </span>
                </div>
                <small>
                  {districtName(inc.districtId)} · {SEVERITY_LABEL[inc.severity]} · <span data-testid="incident-state">{INCIDENT_STATE_LABEL[inc.state]}</span>
                </small>
                {inc.state === 'new' && (
                  <button className="btn small-action" data-testid={`ack-${inc.id}`} onClick={() => dispatch({ type: 'ACKNOWLEDGE_INCIDENT', incidentId: inc.id })}>
                    <Icon name="check" /> Принять вызов
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}
