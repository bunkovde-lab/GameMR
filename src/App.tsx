import { useCallback, useEffect, useReducer, useState } from 'react';
import { IconSprite } from './ui/Icon';
import { DEFAULT_LAYERS, NARROW_PX, initialUiState, uiReducer, type LayerId, type Selection, type UiState } from './ui/uiState';
import { TopHud } from './ui/shell/TopHud';
import { IncidentPanel } from './ui/shell/IncidentPanel';
import { ContextPanel } from './ui/shell/ContextPanel';
import { MapView } from './ui/map/MapView';
import { DispatchDialog } from './ui/dispatch/DispatchDialog';
import { DecisionDialog, OperationReportDialog } from './ui/operations/OperationDialogs';
import { SquadStrip } from './ui/shell/SquadStrip';
import { BottomNav } from './ui/shell/BottomNav';
import { StaffScreen } from './ui/screens/StaffScreen';
import { BriefingDialog, EndShiftConfirm, ShiftReportDialog } from './ui/PhaseDialogs';
import { SettingsDialog } from './ui/SettingsDialog';
import { Toast } from './ui/Toast';
import { useGameLoop } from './ui/useGameLoop';
import { dispatch, getGame, useGame } from './store';
import { pendingDecision } from './core/operations';

const LAYERS_KEY = 'gamemr-map-layers';
const isNarrow = () => typeof window !== 'undefined' && window.innerWidth < NARROW_PX;

function initUi(): UiState {
  let layers = DEFAULT_LAYERS;
  try {
    const saved = JSON.parse(localStorage.getItem(LAYERS_KEY) ?? 'null') as Partial<Record<LayerId, boolean>> | null;
    if (saved) layers = { ...DEFAULT_LAYERS, ...saved };
  } catch { /* хранилище недоступно — слои по умолчанию */ }
  return { ...initialUiState, layers, leftPanelOpen: !isNarrow() };
}

export function App() {
  const [ui, uiDispatch] = useReducer(uiReducer, undefined, initUi);
  const { game, notice } = useGame();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [dispatchFor, setDispatchFor] = useState<{ incidentId: string; squadId: string | null } | null>(null);
  const preview = useCallback((squadId: string | null) => uiDispatch({ type: 'PREVIEW_SQUAD', squadId }), []);
  useGameLoop();

  useEffect(() => {
    try { localStorage.setItem(LAYERS_KEY, JSON.stringify(ui.layers)); } catch { /* не критично */ }
  }, [ui.layers]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.key === 'Escape') uiDispatch({ type: 'ESCAPE' });
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      if (e.code === 'Space' && !['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'polygon'].includes(tag ?? '')) {
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

  const select = (selection: Selection) => uiDispatch({ type: 'SELECT', selection, narrow: isNarrow() });
  const toggleLeft = () => {
    if (isNarrow() && !ui.leftPanelOpen && ui.rightPanelOpen) uiDispatch({ type: 'CLOSE_RIGHT_PANEL' });
    uiDispatch({ type: 'TOGGLE_LEFT_PANEL' });
  };
  const canEndShift = game.phase === 'ACTIVE' || game.phase === 'REVIEW_PENDING';
  const onMap = ui.view === 'map';

  return (
    <>
      <IconSprite />
      <div className="app-shell">
        <TopHud game={game} onOpenSettings={() => setSettingsOpen(true)} />
        <main className="workspace">
          {/* Карта всегда смонтирована: переход в раздел и обратно не сбрасывает камеру. */}
          <MapView
            game={game}
            selection={ui.selection}
            previewSquadId={ui.previewSquadId}
            layers={ui.layers}
            leftPanelOpen={ui.leftPanelOpen}
            onSelect={select}
            onToggleLayer={(layer) => uiDispatch({ type: 'TOGGLE_LAYER', layer })}
            onOpenLeftPanel={toggleLeft}
          />
          {onMap && ui.leftPanelOpen && (
            <IncidentPanel game={game} selectedId={ui.selection?.kind === 'incident' ? ui.selection.id : null} onSelect={(id) => select({ kind: 'incident', id })} onCollapse={toggleLeft} />
          )}
          {onMap && ui.rightPanelOpen && ui.selection && (
            <ContextPanel
              game={game}
              selection={ui.selection}
              onClose={() => uiDispatch({ type: 'CLOSE_RIGHT_PANEL' })}
              onSelect={select}
              onPreview={preview}
              onOpenDispatch={(incidentId, squadId) => setDispatchFor({ incidentId, squadId })}
            />
          )}
          {ui.view === 'staff' && <StaffScreen game={game} onClose={() => uiDispatch({ type: 'OPEN_VIEW', view: 'map' })} />}
        </main>
        <SquadStrip game={game} selectedId={ui.selection?.kind === 'squad' ? ui.selection.id : null} onSelect={(id) => select({ kind: 'squad', id })} />
        <BottomNav current={ui.view} onOpen={(view) => uiDispatch({ type: 'OPEN_VIEW', view })} canEndShift={canEndShift} onEndShift={() => setConfirmEnd(true)} />
      </div>
      {game.phase === 'BRIEFING' && !settingsOpen && <BriefingDialog game={game} onOpenSettings={() => setSettingsOpen(true)} />}
      {game.phase === 'SHIFT_REPORT' && !settingsOpen && <ShiftReportDialog game={game} />}
      {confirmEnd && canEndShift && <EndShiftConfirm game={game} onCancel={() => setConfirmEnd(false)} />}
      {dispatchFor && game.phase === 'ACTIVE' && (
        <DispatchDialog game={game} incidentId={dispatchFor.incidentId} initialSquadId={dispatchFor.squadId} onClose={() => setDispatchFor(null)} onPreview={preview} />
      )}
      {game.phase !== 'BRIEFING' && !settingsOpen && !dispatchFor && <DecisionDialog game={game} />}
      {game.phase !== 'BRIEFING' && !settingsOpen && !dispatchFor && !pendingDecision(game) && <OperationReportDialog game={game} />}
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
      <Toast notice={notice} />
    </>
  );
}
