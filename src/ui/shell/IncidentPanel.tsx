import { isOpen } from '../../core/selectors';
import type { GameState } from '../../core/types';
import { dispatch } from '../../store';
import { Icon } from '../Icon';
import { INCIDENT_STATE_LABEL, SEVERITY_LABEL } from '../labels';

export function IncidentPanel({ game, onCollapse }: { game: GameState; onCollapse: () => void }) {
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
            return (
              <li key={inc.id} className={`incident sev-${inc.severity} st-${inc.state}`} data-testid={`incident-${inc.id}`}>
                <div className="incident-head">
                  <b>{inc.title}</b>
                  <span className="deadline">
                    {inc.state === 'escalated' ? 'ухудшение' : left > 0 && ['new', 'acknowledged'].includes(inc.state) ? `${left} мин` : ''}
                  </span>
                </div>
                <small>
                  {districtName(inc.districtId)} · {SEVERITY_LABEL[inc.severity]} · <span data-testid="incident-state">{INCIDENT_STATE_LABEL[inc.state]}</span>
                </small>
                {inc.state === 'new' && (
                  <button className="btn small-action" onClick={() => dispatch({ type: 'ACKNOWLEDGE_INCIDENT', incidentId: inc.id })}>
                    <Icon name="check" /> Принять вызов
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        <p className="empty"><small>Отправка отрядов — этап W4.</small></p>
      </div>
    </aside>
  );
}
