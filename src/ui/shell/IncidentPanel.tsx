import { Icon } from '../Icon';

export function IncidentPanel({ onCollapse }: { onCollapse: () => void }) {
  return (
    <aside className="panel left-panel" id="incident-panel" aria-label="Происшествия" data-testid="left-panel">
      <div className="panel-header">
        <h2><Icon name="radio" /> Вызовы</h2>
        <button className="btn icon-only" onClick={onCollapse} aria-label="Свернуть список вызовов">
          <Icon name="close" />
        </button>
      </div>
      <div className="panel-body">
        <p className="empty">
          Активных вызовов нет.
          <small>Поток происшествий подключается на этапах W2–W4.</small>
        </p>
      </div>
    </aside>
  );
}
