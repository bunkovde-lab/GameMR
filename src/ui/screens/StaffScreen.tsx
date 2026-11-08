import { Icon } from '../Icon';

/** Пробный раздел W1: проверяет переход между режимами без потери состояния интерфейса. Содержимое — W6. */
export function StaffScreen({ onClose }: { onClose: () => void }) {
  return (
    <section className="panel screen" role="region" aria-label="Кадры" data-testid="staff-screen">
      <div className="panel-header">
        <h2><Icon name="users" /> Кадры</h2>
        <button className="btn icon-only" onClick={onClose} aria-label="Вернуться к карте">
          <Icon name="close" />
        </button>
      </div>
      <div className="panel-body">
        <p className="empty">
          Раздел кадров: сводка, развитие, модификации, медицина, отношения, история.
          <small>Наполнение — этап W6. Сейчас раздел нужен для проверки навигации.</small>
        </p>
      </div>
    </section>
  );
}
