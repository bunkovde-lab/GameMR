import { Icon, type IconName } from '../Icon';
import type { ViewId } from '../uiState';

interface NavItem {
  id: string;
  label: string;
  icon: IconName;
  view?: ViewId;
  stage?: string;
}

/** Разделы по ТЗ §3.2. Активны только реализованные; остальные показывают этап, на котором появятся. */
const ITEMS: NavItem[] = [
  { id: 'map', label: 'Карта', icon: 'map', view: 'map' },
  { id: 'staff', label: 'Кадры', icon: 'users', view: 'staff' },
  { id: 'investigations', label: 'Расследования', icon: 'search', stage: 'W9' },
  { id: 'directorate', label: 'Дирекция', icon: 'briefcase', stage: 'W7' },
];

interface Props {
  current: ViewId;
  onOpen: (view: ViewId) => void;
}

export function BottomNav({ current, onOpen }: Props) {
  return (
    <nav className="nav" aria-label="Разделы">
      {ITEMS.map((item) =>
        item.view ? (
          <button
            key={item.id}
            className="btn"
            aria-current={current === item.view ? 'page' : undefined}
            onClick={() => onOpen(item.view!)}
            data-testid={`nav-${item.id}`}
          >
            <Icon name={item.icon} /> <span className="label">{item.label}</span>
          </button>
        ) : (
          <button key={item.id} className="btn" disabled title={`Раздел появится на этапе ${item.stage}`} aria-label={`${item.label} — этап ${item.stage}`}>
            <Icon name={item.icon} /> <span className="label">{item.label}</span>
          </button>
        ),
      )}
      <button className="btn end-shift" disabled title="Завершение смены — этап W2" aria-label="Завершить смену — этап W2">
        <Icon name="arrow" /> <span className="label">Завершить смену</span>
      </button>
    </nav>
  );
}
