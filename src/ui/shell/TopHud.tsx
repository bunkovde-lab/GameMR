import { aliveStaff, citySafety, cityTrust, clockLabel, formatRe } from '../../core/selectors';
import type { GameState, Speed } from '../../core/types';
import { dispatch } from '../../store';
import { NavIcon } from './NavIcon';
import { Icon } from '../Icon';

const SPEEDS: Speed[] = [1, 2, 4];

export function TopHud({ game, onOpenSettings }: { game: GameState; onOpenSettings: () => void }) {
  const active = game.phase === 'ACTIVE';
  const running = active && !game.paused;
  const stats = [
    { id: 'budget', label: 'Бюджет · РЕ', value: formatRe(game.economy.balance) },
    { id: 'safety', label: 'Безопасность', value: `${citySafety(game)}%` },
    { id: 'trust', label: 'Доверие', value: `${cityTrust(game)}%` },
    { id: 'staff', label: 'Сотрудники', value: `${aliveStaff(game).length}` },
  ];
  return (
    <header className="hud" data-testid="hud">
      <div className="brand">
        <span className="brand-glyph" aria-hidden="true">✦</span>
        <div className="brand-text">
          <strong>БАГРЯНЫЕ ДОМА</strong>
          <span>ГОРОДСКАЯ ДИРЕКЦИЯ БЕЗОПАСНОСТИ</span>
        </div>
      </div>
      <div className="clock" data-testid="clock">
        <b>{clockLabel(game)}</b>
        <small>Смена {String(game.shift).padStart(2, '0')}</small>
      </div>
      <div className="speed" role="group" aria-label="Скорость времени">
        <button
          className="btn icon-only"
          disabled={!active}
          onClick={() => dispatch({ type: running ? 'PAUSE' : 'RESUME' })}
          aria-label={running ? 'Пауза' : 'Продолжить'}
          data-testid="toggle-pause"
          title="Пробел"
        >
          <Icon name={running ? 'pause' : 'play'} />
        </button>
        {SPEEDS.map((sp) => (
          <button
            key={sp}
            className="btn"
            aria-pressed={game.speed === sp}
            onClick={() => dispatch({ type: 'SET_SPEED', speed: sp })}
          >
            ×{sp}
          </button>
        ))}
      </div>
      <div className="hud-spacer" />
      <dl className="stats" aria-label="Показатели дирекции">
        {stats.map((s) => (
          <div className="stat" key={s.id} data-testid={`stat-${s.id}`}>
            <dt className="visually-hidden">{s.label}</dt>
            <dd style={{ margin: 0 }}>
              <b>{s.value}</b>
              <small aria-hidden="true">{s.label}</small>
            </dd>
          </div>
        ))}
      </dl>
      <button className="btn icon-only" onClick={onOpenSettings} aria-label="Сохранения и настройки" data-testid="open-settings">
        <NavIcon id="saves" />
      </button>
    </header>
  );
}
