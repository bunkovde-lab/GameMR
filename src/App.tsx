import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { IconSprite } from './ui/Icon';
import { initialUiState, uiReducer, type Selection } from './ui/uiState';
import { TopHud } from './ui/shell/TopHud';
import { ContextPanel } from './ui/shell/ContextPanel';
import { MapView } from './ui/map/MapView';
import { DispatchDialog } from './ui/dispatch/DispatchDialog';
import { DecisionDialog, OperationReportDialog } from './ui/operations/OperationDialogs';
import { SquadStrip } from './ui/shell/SquadStrip';
import { BottomNav } from './ui/shell/BottomNav';
import { GoalsDock } from './ui/shell/GoalsDock';
import { StaffScreen } from './ui/screens/StaffScreen';
import { DirectorateScreen } from './ui/screens/DirectorateScreen';
import { InvestigationsScreen } from './ui/screens/InvestigationsScreen';
import { EndingDialog, SpecialOpDialog, SpecialOpReportDialog } from './ui/CampaignDialogs';
import { activeOp, unseenOpReport } from './core/specialOps';
import { BriefingDialog, EndShiftConfirm, ShiftReportDialog } from './ui/PhaseDialogs';
import { SettingsDialog } from './ui/SettingsDialog';
import { Toast } from './ui/Toast';
import { useGameLoop } from './ui/useGameLoop';
// Прежний утверждённый арт города (W3) — с ART-019 только заставка перед сменой.
import citySplashUrl from '../assets/map/web/city_splash_legacy.webp';
import { useMusicScene } from './ui/audio/useMusic';
import { bootResult, dispatch, getGame, useGame } from './store';
import { MainMenu } from './ui/menu/MainMenu';
import { pendingDecision } from './core/operations';

/** Главное меню показывается при каждом запуске; e2e/unit-тесты игровых экранов могут его пропустить. */
const startsInMenu = () => !(globalThis as { __GAMEMR_SKIP_MENU__?: boolean }).__GAMEMR_SKIP_MENU__;

export function App() {
  const [ui, uiDispatch] = useReducer(uiReducer, initialUiState);
  const { game, notice } = useGame();
  const [screen, setScreen] = useState<'menu' | 'game'>(() => (startsInMenu() ? 'menu' : 'game'));
  // Кампания в этой вкладке: восстановлена из автосохранения или уже открывалась из меню.
  const [sessionLive, setSessionLive] = useState(() => bootResult().restored);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [dispatchFor, setDispatchFor] = useState<{ incidentId: string; squadId: string | null } | null>(null);
  const preview = useCallback((squadId: string | null) => uiDispatch({ type: 'PREVIEW_SQUAD', squadId }), []);
  const inMenu = screen === 'menu';
  // Пока открыто окно отправки, время стоит. Пауза снимается при закрытии/отправке,
  // только если её поставило само окно (игрок до этого не стоял на паузе и не снимал её вручную).
  const dispatchPausedRef = useRef(false);
  const dispatchOpen = dispatchFor !== null;
  useEffect(() => {
    if (!dispatchOpen) return;
    const g = getGame();
    dispatchPausedRef.current = g.phase === 'ACTIVE' && !g.paused && dispatch({ type: 'PAUSE' });
    return () => {
      const g2 = getGame();
      if (dispatchPausedRef.current && g2.phase === 'ACTIVE' && g2.paused) dispatch({ type: 'RESUME' });
      dispatchPausedRef.current = false;
    };
  }, [dispatchOpen]);
  // Игрок сам снял паузу при открытом окне — дальше паузой управляет он.
  useEffect(() => { if (dispatchOpen && !getGame().paused) dispatchPausedRef.current = false; }, [dispatchOpen, game.paused]);
  // В главном меню игровое время не идёт.
  useGameLoop(!inMenu);
  // Музыка: тема меню — в главном меню, на брифинге, в отчёте о смене и в окне сохранений/настроек; на карте во время смены — фон игры.
  useMusicScene(inMenu || settingsOpen || game.phase === 'BRIEFING' || game.phase === 'SHIFT_REPORT' ? 'menu' : 'game');

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

  const select = (selection: Selection) => uiDispatch({ type: 'SELECT', selection });
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
    dispatchPausedRef.current = false; // закрытие окна отправки не должно снять паузу меню
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
            onSelect={select}
          />
          {onMap && <GoalsDock game={game} onOpenDirectorate={() => uiDispatch({ type: 'OPEN_VIEW', view: 'directorate' })} />}
          {onMap && ui.rightPanelOpen && ui.selection && (
            <ContextPanel
              game={game}
              selection={ui.selection}
              onClose={() => uiDispatch({ type: 'CLOSE_RIGHT_PANEL' })}
              onSelect={select}
              onPreview={preview}
              onOpenDispatch={(incidentId, squadId) => setDispatchFor({ incidentId, squadId })}
              onOpenCase={(caseId) => uiDispatch({ type: 'OPEN_VIEW', view: 'investigations', caseId })}
            />
          )}
          {ui.view === 'staff' && <StaffScreen game={game} onClose={() => uiDispatch({ type: 'OPEN_VIEW', view: 'map' })} />}
          {ui.view === 'investigations' && <InvestigationsScreen game={game} focusCaseId={ui.focusCaseId ?? null} onClose={() => uiDispatch({ type: 'OPEN_VIEW', view: 'map' })} />}
          {ui.view === 'directorate' && <DirectorateScreen game={game} onClose={() => uiDispatch({ type: 'OPEN_VIEW', view: 'map' })} />}
        </main>
        <SquadStrip game={game} selectedId={ui.selection?.kind === 'squad' ? ui.selection.id : null} onSelect={(id) => select({ kind: 'squad', id })} />
        <BottomNav current={ui.view} onOpen={(view) => uiDispatch({ type: 'OPEN_VIEW', view })} canEndShift={canEndShift} onEndShift={() => setConfirmEnd(true)} />
      </div>
      {game.phase === 'BRIEFING' && <div className="city-splash" style={{ backgroundImage: `url(${citySplashUrl})` }} data-testid="city-splash" aria-hidden="true" />}
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
