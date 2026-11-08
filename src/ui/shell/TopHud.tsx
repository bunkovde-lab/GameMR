import { Icon } from '../Icon';

/** Показатели HUD. В W1 игрового ядра нет, поэтому значения пустые («—»), без демо-чисел (ТЗ §3.1). */
const STATS = [
  { id: 'budget', label: 'Бюджет · РЕ' },
  { id: 'safety', label: 'Безопасность' },
  { id: 'trust', label: 'Доверие' },
  { id: 'staff', label: 'Сотрудники' },
] as const;

const NOT_YET = 'Игровое время появится на этапе W2';

export function TopHud() {
  return (
    <header className="hud" data-testid="hud">
      <div className="brand">
        <span className="brand-glyph" aria-hidden="true">✦</span>
        <div className="brand-text">
          <strong>БАГРЯНЫЕ ДОМА</strong>
          <span>ГОРОДСКАЯ ДИРЕКЦИЯ БЕЗОПАСНОСТИ</span>
        </div>
      </div>
      <div className="clock" aria-label="Игровое время: нет данных">
        <b>--:--</b>
        <small>Смена —</small>
      </div>
      <div className="speed" role="group" aria-label="Скорость времени">
        <button className="btn icon-only" disabled title={NOT_YET} aria-label="Пауза">
          <Icon name="play" />
        </button>
        {['×1', '×2', '×4'].map((s) => (
          <button key={s} className="btn" disabled title={NOT_YET}>{s}</button>
        ))}
      </div>
      <div className="hud-spacer" />
      <dl className="stats" aria-label="Показатели дирекции">
        {STATS.map((s) => (
          <div className="stat" key={s.id} data-testid={`stat-${s.id}`}>
            <dt className="visually-hidden">{s.label}</dt>
            <dd style={{ margin: 0 }}>
              <b>—</b>
              <small aria-hidden="true">{s.label}</small>
            </dd>
          </div>
        ))}
      </dl>
      <button className="btn icon-only" disabled title="Журнал появится на этапе W2" aria-label="Журнал">
        <Icon name="mail" />
      </button>
      <button className="btn icon-only" disabled title="Настройки и сохранения — этап W2" aria-label="Настройки">
        <Icon name="cog" />
      </button>
    </header>
  );
}
