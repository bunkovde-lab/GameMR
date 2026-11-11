import { NavIcon, type NavIconId } from './NavIcon';
import type { ViewId } from '../uiState';

interface NavItem { id: string; label: string; icon: NavIconId; view?: ViewId; stage?: string }

/** Разделы по ТЗ §3.2. Активны только реализованные; остальные показывают этап, на котором появятся. */
const ITEMS: NavItem[] = [
  { id: 'map', label: 'Карта', icon: 'map', view: 'map' },
  { id: 'staff', label: 'Кадры', icon: 'staff', view: 'staff' },
  { id: 'investigations', label: 'Расследования', icon: 'investigations', view: 'investigations' },
  { id: 'directorate', label: 'Дирекция', icon: 'directorate', view: 'directorate' },
];

interface Props { current: ViewId; onOpen: (view: ViewId) => void; canEndShift: boolean; onEndShift: () => void; sandbox?: boolean }

export function BottomNav({ current, onOpen, canEndShift, onEndShift, sandbox = false }: Props) {
  return (
    <nav className="nav" aria-label="Разделы">
      {ITEMS.map((item) =>
        item.view ? (
          <button key={item.id} className="btn" aria-current={current === item.view ? 'page' : undefined} onClick={() => onOpen(item.view!)} data-testid={`nav-${item.id}`}>
            <NavIcon id={item.icon} /> <span className="label">{item.label}</span>
          </button>
        ) : (
          <button key={item.id} className="btn" disabled title={`Раздел появится на этапе ${item.stage}`} aria-label={`${item.label} — этап ${item.stage}`}>
            <NavIcon id={item.icon} /> <span className="label">{item.label}</span>
          </button>
        ),
      )}
      {!sandbox && <button className="btn end-shift" disabled={!canEndShift} onClick={onEndShift} aria-label="Завершить смену" data-testid="end-shift">
        <NavIcon id="end_shift" /> <span className="label">Завершить смену</span>
      </button>}
    </nav>
  );
}
