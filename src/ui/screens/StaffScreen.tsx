import { ROLE_LABEL } from '../../core/content';
import { formatRe } from '../../core/selectors';
import type { GameState } from '../../core/types';
import { Icon } from '../Icon';

const RANKS = ['I', 'II', 'III', 'IV', 'V'];

/** Список штата из ядра. Полный кадровый модуль (развитие, медицина, переводы) — этап W6. */
export function StaffScreen({ game, onClose }: { game: GameState; onClose: () => void }) {
  return (
    <section className="panel screen" role="region" aria-label="Кадры" data-testid="staff-screen">
      <div className="panel-header">
        <h2><Icon name="users" /> Кадры · {game.staff.length}</h2>
        <button className="btn icon-only" onClick={onClose} aria-label="Вернуться к карте">
          <Icon name="close" />
        </button>
      </div>
      <div className="panel-body">
        <table className="staff-table">
          <thead>
            <tr><th>Сотрудник</th><th>Должность</th><th>Ранг</th><th>Отряд</th><th>Усталость</th><th>Жалование</th></tr>
          </thead>
          <tbody>
            {game.staff.map((p) => {
              const sq = game.squads.find((q) => q.memberIds.includes(p.id));
              return (
                <tr key={p.id} data-testid={`staff-${p.id}`}>
                  <td>{p.name}</td>
                  <td>{ROLE_LABEL[p.role]}</td>
                  <td>{RANKS[p.rank - 1]}</td>
                  <td>{sq ? `«${sq.name}»` : 'резерв'}</td>
                  <td>{p.fatigue}%</td>
                  <td>{formatRe(p.salary)} РЕ</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="empty"><small>Имена и параметры временные (OPEN-08). Развитие, медицина и переводы — этап W6.</small></p>
      </div>
    </section>
  );
}
