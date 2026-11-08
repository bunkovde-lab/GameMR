import type { GameState } from '../../core/types';
import { SQUAD_STATUS } from '../labels';

const initials = (name: string) => name.split(' ').map((w) => w[0]).join('');

export function SquadStrip({ game, selectedId, onSelect }: { game: GameState; selectedId: string | null; onSelect: (id: string) => void }) {
  const ready = game.squads.filter((q) => q.status === 'ready').length;
  return (
    <section className="panel squads" aria-label="Оперативные группы" data-testid="squads">
      <div className="panel-header">
        <h2>Оперативные группы</h2>
        <small className="ready-count">{ready} готово</small>
      </div>
      <ul className="squad-list">
        {game.squads.map((q) => {
          const st = SQUAD_STATUS[q.status];
          const members = q.memberIds.map((id) => game.staff.find((p) => p.id === id)!).filter(Boolean);
          return (
            <li key={q.id} className="squad-item">
              <button className={`squad tone-${st.tone}${selectedId === q.id ? ' selected' : ''}`} data-testid={`squad-${q.id}`} onClick={() => onSelect(q.id)} aria-pressed={selectedId === q.id}>
              <span className="monogram" aria-hidden="true">{members[0] ? initials(members[0].name) : '—'}</span>
              <span className="squad-text">
                <b>«{q.name}»</b>
                <small><span className="cnt">{members.length}/3 · </span><span className="status">{st.label}</span></small>
              </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
