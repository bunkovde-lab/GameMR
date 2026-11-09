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
import { DirectorateScreen } from './ui/screens/DirectorateScreen';
import { InvestigationsScreen } from './ui/screens/InvestigationsScreen';
import { EndingDialog, SpecialOpDialog, SpecialOpReportDialog } from './ui/CampaignDialogs';
import { activeOp, unseenOpReport } from './core/specialOps';
import { BriefingDialog, EndShiftConfirm, ShiftReportDialog } from './ui/PhaseDialogs';
import { SettingsDialog } from './ui/SettingsDialog';
import { Toast } from './ui/Toast';
import { useGameLoop } from './ui/useGameLoop';
import { useMusicScene } from './ui/audio/useMusic';
import { bootResult, dispatch, getGame, useGame } from './store';
import { MainMenu } from './ui/menu/MainMenu';
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

/** Главное меню показывается при каждом запуске; e2e/unit-тесты игровых экранов могут его пропустить. */
const startsInMenu = () => !(globalThis as { __GAMEMR_SKIP_MENU__?: boolean }).__GAMEMR_SKIP_MENU__;

export function App() {
  const [ui, uiDispatch] = useReducer(uiReducer, undefined, initUi);
  const { game, notice } = useGame();
  const [screen, setScreen] = useState<'menu' | 'game'>(() => (startsInMenu() ? 'menu' : 'game'));
  // Кампания в этой вкладке: восстановлена из автосохранения или уже открывалась из меню.
  const [sessionLive, setSessionLive] = useState(() => bootResult().restored);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [dispatchFor, setDispatchFor] = useState<{ incidentId: string; squadId: string | null } | null>(null);
  const preview = useCallback((squadId: string | null) => uiDispatch({ type: 'PREVIEW_SQUAD', squadId }), []);
  const inMenu = screen === 'menu';
  // В главном меню игровое время не идёт.
  useGameLoop(!inMenu);
  // Музыка: тема меню — в главном меню, на брифинге, в отчёте о смене и в окне сохранений/настроек; на карте во время смены — фон игры.
  useMusicScene(inMenu || settingsOpen || game.phase === 'BRIEFING' || game.phase === 'SHIFT_REPORT' ? 'menu' : 'game');

  useEffect(() => {
    try { localStorage.setItem(LAYERS_KEY, JSON.stringify(ui.layers)); } catch { /* не критично */ }
  }, [ui.layers]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || document.querySelector('[data-testid="main-menu"]')) return;
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

  const enterGame = () => {
    setSessionLive(true);
    setSettingsOpen(false);
    setScreen('game');
  };
  const toMainMenu = () => {
    // Смена ставится на паузу явно: «Продолжить» вернёт её в том же состоянии, время само не пойдёт.
    const g = getGame();
    if (g.phase === 'ACTIVE' && !g.paused) dispatch({ type: 'PAUSE' });
    setSettingsOpen(false);
    setDispatchFor(null);
    setConfirmEnd(false);
    setScreen('menu');
  };

  if (inMenu) {
    return (
      <>
        <IconSprite />
        <MainMenu sessionLive={sessionLive} onEnterGame={enterGame} />
        <Toast notice={notice} />
      </>
    );
  }

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
          {ui.view === 'investigations' && <InvestigationsScreen game={game} onClose={() => uiDispatch({ type: 'OPEN_VIEW', view: 'map' })} />}
          {ui.view === 'directorate' && <DirectorateScreen game={game} onClose={() => uiDispatch({ type: 'OPEN_VIEW', view: 'map' })} />}
        </main>
        <SquadStrip game={game} selectedId={ui.selection?.kind === 'squad' ? ui.selection.id : null} onSelect={(id) => select({ kind: 'squad', id })} />
        <BottomNav current={ui.view} onOpen={(view) => uiDispatch({ type: 'OPEN_VIEW', view })} canEndShift={canEndShift} onEndShift={() => setConfirmEnd(true)} />
      </div>
      {game.phase === 'BRIEFING' && !settingsOpen && <BriefingDialog game={game} onOpenSettings={() => setSettingsOpen(true)} />}
      {game.phase === 'SHIFT_REPORT' && !settingsOpen && (game.campaign.ending && !game.campaign.endingSeen ? <EndingDialog game={game} /> : <ShiftReportDialog game={game} />)}
      {confirmEnd && canEndShift && <EndShiftConfirm game={game} onCancel={() => setConfirmEnd(false)} />}
      {dispatchFor && game.phase === 'ACTIVE' && (
        <DispatchDialog game={game} incidentId={dispatchFor.incidentId} initialSquadId={dispatchFor.squadId} onClose={() => setDispatchFor(null)} onPreview={preview} />
      )}
      {game.phase === 'ACTIVE' && !settingsOpen && activeOp(game) && <SpecialOpDialog game={game} />}
      {game.phase !== 'BRIEFING' && !settingsOpen && !activeOp(game) && unseenOpReport(game) && <SpecialOpReportDialog game={game} />}
      {game.phase !== 'BRIEFING' && !settingsOpen && !dispatchFor && <DecisionDialog game={game} />}
      {game.phase !== 'BRIEFING' && !settingsOpen && !dispatchFor && !pendingDecision(game) && <OperationReportDialog game={game} />}
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} onMainMenu={toMainMenu} />}
      <Toast notice={notice} />
    </>
  );
}
