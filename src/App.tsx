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
import { SandboxDock } from './ui/shell/SandboxDock';
import { SandboxDefeatDialog, SandboxResultDialog } from './ui/SandboxDialogs';
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
import { bootResult, dispatch, getGame, notify, replaceGame, useGame } from './store';
import { createSandboxState } from './core/sandbox';
import { saveToSlot } from './persistence/saveStore';
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
  const dispatchOpen = dispatchFor !== null;
  const sandboxModalOpen = !!game.sandbox && (settingsOpen || confirmEnd || ui.view === 'investigations'
    || !!pendingDecision(game) || !!unseenOpReport(game) || !!activeOp(game)
    || !!game.sandbox.result || !!game.sandbox.defeatReason);
  const autoPauseOpen = dispatchOpen || sandboxModalOpen;
  // Один владелец на всю группу окон: смена investigations → результат не снимает паузу между окнами.
  // Если игрок сам снял паузу, право на автоматическое продолжение сразу теряется.
  const autoPauseOwnedRef = useRef(false);
  useEffect(() => {
    if (!autoPauseOpen) return;
    const g = getGame();
    autoPauseOwnedRef.current = g.phase === 'ACTIVE' && !g.paused && dispatch({ type: 'PAUSE' });
    return () => {
      const current = getGame();
      if (autoPauseOwnedRef.current && current.phase === 'ACTIVE' && current.paused) dispatch({ type: 'RESUME' });
      autoPauseOwnedRef.current = false;
    };
  }, [autoPauseOpen]);
  useEffect(() => {
    // Читаем актуальное состояние: в первом commit props ещё могут содержать paused=false до PAUSE выше.
    if (autoPauseOpen && !getGame().paused) autoPauseOwnedRef.current = false;
  }, [autoPauseOpen, game.paused]);
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
  const canEndShift = !game.sandbox && (game.phase === 'ACTIVE' || game.phase === 'REVIEW_PENDING');
  const sandboxOutcomeOpen = !!game.sandbox?.result || !!game.sandbox?.defeatReason;
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
    autoPauseOwnedRef.current = false; // закрытие окон не должно снять паузу меню
    setSettingsOpen(false);
    setDispatchFor(null);
    setConfirmEnd(false);
    setScreen('menu');
  };

  const restartSandbox = () => {
    const fresh = createSandboxState();
    autoPauseOwnedRef.current = false;
    replaceGame(fresh);
    setDispatchFor(null);
    setConfirmEnd(false);
    setSettingsOpen(false);
    uiDispatch({ type: 'OPEN_VIEW', view: 'map' });
    saveToSlot('sandbox-auto', fresh).catch((e: Error) => notify('bad', `Автосохранение не удалось: ${e.message}`));
  };
  const openIncident = (incidentId: string) => {
    uiDispatch({ type: 'OPEN_VIEW', view: 'map' });
    uiDispatch({ type: 'SELECT', selection: { kind: 'incident', id: incidentId } });
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
          {onMap && (game.sandbox
            ? <SandboxDock game={game} onOpenCase={() => uiDispatch({ type: 'OPEN_VIEW', view: 'investigations', caseId: game.sandbox!.activeCaseId })} />
            : <GoalsDock game={game} onOpenDirectorate={() => uiDispatch({ type: 'OPEN_VIEW', view: 'directorate' })} />)}
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
          {ui.view === 'investigations' && <InvestigationsScreen game={game} focusCaseId={ui.focusCaseId ?? null} onOpenIncident={openIncident} onClose={() => uiDispatch({ type: 'OPEN_VIEW', view: 'map' })} />}
          {ui.view === 'directorate' && <DirectorateScreen game={game} onClose={() => uiDispatch({ type: 'OPEN_VIEW', view: 'map' })} />}
        </main>
        <SquadStrip game={game} selectedId={ui.selection?.kind === 'squad' ? ui.selection.id : null} onSelect={(id) => select({ kind: 'squad', id })} />
        <BottomNav current={ui.view} onOpen={(view) => uiDispatch({ type: 'OPEN_VIEW', view })} canEndShift={canEndShift} onEndShift={() => setConfirmEnd(true)} sandbox={!!game.sandbox} />
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
      {game.phase !== 'BRIEFING' && !settingsOpen && !dispatchFor && !sandboxOutcomeOpen && <DecisionDialog game={game} />}
      {game.phase !== 'BRIEFING' && !settingsOpen && !dispatchFor && !pendingDecision(game) && !sandboxOutcomeOpen && <OperationReportDialog game={game} />}
      {!settingsOpen && game.sandbox?.result && !game.sandbox.defeatReason && <SandboxResultDialog game={game} />}
      {!settingsOpen && game.sandbox?.defeatReason && <SandboxDefeatDialog game={game} onRestart={restartSandbox} onMainMenu={toMainMenu} />}
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} onMainMenu={toMainMenu} />}
      <Toast notice={notice} />
    </>
  );
}
