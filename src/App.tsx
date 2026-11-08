import { useEffect, useReducer, useState } from 'react';
import { IconSprite } from './ui/Icon';
import { initialUiState, uiReducer } from './ui/uiState';
import { TopHud } from './ui/shell/TopHud';
import { IncidentPanel } from './ui/shell/IncidentPanel';
import { MapStage } from './ui/shell/MapStage';
import { SquadStrip } from './ui/shell/SquadStrip';
import { BottomNav } from './ui/shell/BottomNav';
import { StaffScreen } from './ui/screens/StaffScreen';
import { BriefingDialog, EndShiftConfirm, ShiftReportDialog } from './ui/PhaseDialogs';
import { SettingsDialog } from './ui/SettingsDialog';
import { Toast } from './ui/Toast';
import { useGameLoop } from './ui/useGameLoop';
import { dispatch, getGame, useGame } from './store';

export function App() {
  const [ui, uiDispatch] = useReducer(uiReducer, initialUiState);
  const { game, notice } = useGame();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  useGameLoop();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.key === 'Escape') uiDispatch({ type: 'ESCAPE' });
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      if (e.code === 'Space' && !['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(tag ?? '')) {
        const g = getGame();
        if (g.phase === 'ACTIVE') {
          e.preventDefault();
          dispatch({ type: g.paused ? 'RESUME' : 'PAUSE' });
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const toggleLeft = () => uiDispatch({ type: 'TOGGLE_LEFT_PANEL' });
  const canEndShift = game.phase === 'ACTIVE' || game.phase === 'REVIEW_PENDING';

  return (
    <>
      <IconSprite />
      <div className="app-shell">
        <TopHud game={game} onOpenSettings={() => setSettingsOpen(true)} />
        <main className="workspace">
          <MapStage leftPanelOpen={ui.leftPanelOpen} onOpenLeftPanel={toggleLeft} />
          {ui.view === 'map' && ui.leftPanelOpen && <IncidentPanel game={game} onCollapse={toggleLeft} />}
          {ui.view === 'staff' && <StaffScreen game={game} onClose={() => uiDispatch({ type: 'OPEN_VIEW', view: 'map' })} />}
        </main>
        <SquadStrip game={game} />
        <BottomNav current={ui.view} onOpen={(view) => uiDispatch({ type: 'OPEN_VIEW', view })} canEndShift={canEndShift} onEndShift={() => setConfirmEnd(true)} />
      </div>
      {game.phase === 'BRIEFING' && !settingsOpen && <BriefingDialog game={game} onOpenSettings={() => setSettingsOpen(true)} />}
      {game.phase === 'SHIFT_REPORT' && !settingsOpen && <ShiftReportDialog game={game} />}
      {confirmEnd && canEndShift && <EndShiftConfirm game={game} onCancel={() => setConfirmEnd(false)} />}
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
      <Toast notice={notice} />
    </>
  );
}
