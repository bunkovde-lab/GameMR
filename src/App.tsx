import { useEffect, useReducer } from 'react';
import { IconSprite } from './ui/Icon';
import { initialUiState, uiReducer } from './ui/uiState';
import { TopHud } from './ui/shell/TopHud';
import { IncidentPanel } from './ui/shell/IncidentPanel';
import { MapStage } from './ui/shell/MapStage';
import { SquadStrip } from './ui/shell/SquadStrip';
import { BottomNav } from './ui/shell/BottomNav';
import { StaffScreen } from './ui/screens/StaffScreen';

export function App() {
  const [ui, dispatch] = useReducer(uiReducer, initialUiState);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dispatch({ type: 'ESCAPE' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const toggleLeft = () => dispatch({ type: 'TOGGLE_LEFT_PANEL' });

  return (
    <>
      <IconSprite />
      <div className="app-shell">
        <TopHud />
        <main className="workspace">
          {/* Карта всегда смонтирована: переход в раздел и обратно не сбрасывает её состояние. */}
          <MapStage leftPanelOpen={ui.leftPanelOpen} onOpenLeftPanel={toggleLeft} />
          {ui.view === 'map' && ui.leftPanelOpen && <IncidentPanel onCollapse={toggleLeft} />}
          {ui.view === 'staff' && <StaffScreen onClose={() => dispatch({ type: 'OPEN_VIEW', view: 'map' })} />}
        </main>
        <SquadStrip />
        <BottomNav current={ui.view} onOpen={(view) => dispatch({ type: 'OPEN_VIEW', view })} />
      </div>
    </>
  );
}
