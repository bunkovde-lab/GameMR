import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { App } from '../../src/App';
import { openCaseFromReport } from '../../src/core/investigations';
import { advanceSandboxMinute, createSandboxState } from '../../src/core/sandbox';
import { createInitialState } from '../../src/core/state';
import type { GameState, OperationReport } from '../../src/core/types';
import { getGame, replaceGame } from '../../src/store';

const getContext = HTMLCanvasElement.prototype.getContext;
const resizeObserver = globalThis.ResizeObserver;
beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof getContext;
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get(this: HTMLElement) { return this.dataset.testid === 'map-stage' ? 1340 : 0; } });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get(this: HTMLElement) { return this.dataset.testid === 'map-stage' ? 760 : 0; } });
});
afterAll(() => {
  HTMLCanvasElement.prototype.getContext = getContext;
  globalThis.ResizeObserver = resizeObserver;
  delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
  delete (HTMLElement.prototype as { clientHeight?: number }).clientHeight;
});
beforeEach(() => { localStorage.clear(); });
afterEach(() => {
  cleanup();
  replaceGame(createInitialState());
});

function operationReport(s: GameState): OperationReport {
  const inc = s.incidents[0]!;
  return {
    id: 1, shift: 1, minute: s.minute, incidentId: inc.id, incidentTitle: inc.title,
    squadId: 'axon', squadName: 'Аксон', memberIds: ['p1', 'p2', 'p3'], tactic: 'recon', outcome: 'success',
    decisions: [], tasks: [{ label: 'Сохранность улик', result: 'done' }], casualties: [], xp: 0, fatigue: 0,
    equipment: [], district: { safety: 0, trust: 0 }, seen: true,
  };
}

function openedSandbox(): GameState {
  const s = createSandboxState();
  const inc = s.incidents[0]!;
  const r = operationReport(s);
  openCaseFromReport(s, r, inc.templateId, () => {});
  inc.state = 'resolved_success';
  return s;
}

describe('Sandbox UI integration', () => {
  it('shows the scenario dock, locks the next district and hides shift completion', () => {
    replaceGame(createSandboxState());
    render(<App />);
    expect(screen.getByTestId('sandbox-dock').textContent).toContain('№418');
    expect(screen.queryByTestId('end-shift')).toBeNull();
    expect(screen.queryAllByTestId('end-shift-confirm')).toHaveLength(0);
    expect(document.querySelectorAll('[data-locked="true"]').length).toBeGreaterThan(0);
    expect(screen.getByTestId('stat-order').textContent).toContain('72%');
  });

  it('auto-pauses investigations and resumes only when the window owned the pause', () => {
    replaceGame(createSandboxState());
    render(<App />);
    act(() => { fireEvent.click(screen.getByTestId('nav-investigations')); });
    expect(getGame().paused).toBe(true);
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Вернуться к карте' })); });
    expect(getGame().paused).toBe(false);

    act(() => { fireEvent.click(screen.getByTestId('toggle-pause')); });
    act(() => { fireEvent.click(screen.getByTestId('nav-investigations')); });
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Вернуться к карте' })); });
    expect(getGame().paused).toBe(true);
  });

  it('does not resume after the player takes control of pause inside an open window', () => {
    replaceGame(createSandboxState());
    render(<App />);
    act(() => { fireEvent.click(screen.getByTestId('nav-investigations')); });
    expect(getGame().paused).toBe(true);
    act(() => { fireEvent.click(screen.getByTestId('toggle-pause')); });
    expect(getGame().paused).toBe(false);
    act(() => { fireEvent.click(screen.getByTestId('toggle-pause')); });
    expect(getGame().paused).toBe(true);
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Вернуться к карте' })); });
    expect(getGame().paused).toBe(true);
  });

  it('creates a field event and opens its real map card from the investigation', () => {
    replaceGame(openedSandbox());
    render(<App />);
    act(() => { fireEvent.click(screen.getByTestId('nav-investigations')); });
    if (screen.queryByTestId('case-help-close')) act(() => { fireEvent.click(screen.getByTestId('case-help-close')); });
    act(() => { fireEvent.click(screen.getByTestId('case-mode-actions')); });
    act(() => { fireEvent.click(screen.getByTestId('action-start-a_route')); });
    const created = getGame().incidents.find((i) => i.sandbox?.eventId === 'c1-route')!;
    expect(created).toBeTruthy();
    expect(screen.getByTestId('incident-card').textContent).toContain('Маршрут аварийной доставки');
    expect(screen.getByTestId('sandbox-event-brief').textContent).toContain('Цель выезда');
    expect(getGame().paused).toBe(false);
  });

  it('distinguishes supporting, contradicting, neutral and inconclusive evidence links', () => {
    const s = openedSandbox();
    const file = s.investigations.cases[0]!;
    file.evidence.find((e) => e.id === 'e01')!.analysis = 'confirmed';
    file.evidence.find((e) => e.id === 'e02')!.analysis = 'inconclusive';
    replaceGame(s);
    render(<App />);
    act(() => { fireEvent.click(screen.getByTestId('nav-investigations')); });
    if (screen.queryByTestId('case-help-close')) act(() => { fireEvent.click(screen.getByTestId('case-help-close')); });
    act(() => { fireEvent.click(screen.getByTestId('ev-e01')); });

    expect(screen.getByTestId('link-e01-h1b').textContent).toContain('подтверждает');
    expect(screen.getByTestId('link-e01-h1a').textContent).toContain('опровергает');
    expect(screen.getByTestId('link-e01-h1c').textContent).toContain('не влияет');
    expect(screen.getByTestId('link-e01-h1d').textContent).toContain('не влияет');
    expect(screen.getByTestId('link-effect-e01-h1c').textContent).toContain('Проверка выполнена');
    expect(screen.getByTestId('link-effect-e01-h1c').textContent).not.toContain('повторная проверка');

    act(() => { fireEvent.click(screen.getByTestId('link-e01-h1b')); });
    expect(screen.getByTestId('hyp-count-h1b').textContent).toContain('1 из 3');
    act(() => { fireEvent.click(screen.getByTestId('link-e01-h1c')); });
    expect(screen.getByTestId('hyp-count-h1c').textContent).toContain('0 из 3');

    act(() => { fireEvent.click(screen.getByTestId('ev-e02')); });
    expect(screen.getByTestId('link-e02-h1b').textContent).toContain('результат неясен');
    expect(screen.getByTestId('link-effect-e02-h1b').textContent).toContain('нужна повторная проверка');
  });

  it('shows the case outcome and restarts a defeated scenario without touching campaign state', () => {
    const s = createSandboxState();
    s.sandbox!.result = { caseId: 'c1', outcome: 'error', title: 'Заключение опровергнуто', text: 'Материалы начаты заново.' };
    replaceGame(s);
    const { unmount } = render(<App />);
    expect(screen.getByTestId('sandbox-result').textContent).toContain('Заключение опровергнуто');
    act(() => { fireEvent.click(screen.getByTestId('ack-sandbox-result')); });
    expect(screen.queryByTestId('sandbox-result')).toBeNull();
    unmount();

    const defeated = createSandboxState();
    defeated.sandbox!.defeatReason = 'Порядок города потерян.';
    defeated.paused = true;
    replaceGame(defeated);
    render(<App />);
    expect(screen.getByTestId('sandbox-defeat').textContent).toContain('Порядок города потерян.');
    act(() => { fireEvent.click(screen.getByTestId('restart-sandbox')); });
    expect(getGame().sandbox!.defeatReason).toBeNull();
    expect(getGame().sandbox!.unlockedDistricts).toEqual(['admin']);
    expect(getGame().squads).toHaveLength(1);
    expect(screen.queryByTestId('sandbox-defeat')).toBeNull();
  });
});


describe('Sandbox duty UI', () => {
  it('distinguishes an ordinary call from a case event and exposes all three decisions', () => {
    const s = createSandboxState();
    s.sandbox!.duty.nextAt = 0;
    advanceSandboxMinute(s);
    s.paused = false;
    const duty = s.incidents.find((i) => i.duty)!;
    duty.duty!.kind = 'missing';
    replaceGame(s);
    render(<App />);
    act(() => { fireEvent.click(screen.getByTestId(`marker-incident-${duty.id}`)); });

    expect(screen.getByTestId('duty-brief').textContent).toContain('К расследованию не относится');
    expect(screen.getByTestId('duty-brief').textContent).toContain('Чем опасно');
    expect(screen.getByTestId('duty-brief').textContent).toContain('Задача отряда');
    expect(screen.getByTestId('duty-brief').textContent).toContain('Соразмерно');
    expect(screen.getByTestId('duty-brief').textContent).toContain('Передать наряду');
    expect(screen.getByTestId('duty-brief').textContent).toContain('немедленного поражения нет');
    expect(screen.queryByTestId('card-case-link')).toBeNull();
    expect(screen.getByTestId(`duty-badge-${duty.id}`).textContent).toBe('Д');

    act(() => { fireEvent.click(screen.getByTestId('open-dispatch')); });
    expect(screen.getByTestId('dispatch-duty-brief').textContent).toContain('Риск выезда');
    act(() => { fireEvent.click(screen.getByTestId('pick-axon')); });
    expect(screen.getByTestId('tactic-arrest').textContent).toContain('Осмотр и опрос свидетелей');
    expect(screen.getByTestId('tactic-suppression').textContent).toContain('Избыточно');
    expect(screen.getByTestId('tactic-guidance-arrest').textContent).toContain('проверяет помещения');
    expect(screen.queryByTestId('legal-box')).toBeNull();
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Закрыть' })); });
    act(() => { fireEvent.click(screen.getByTestId('delegate-duty')); });
    expect(getGame().incidents.find((i) => i.id === duty.id)!.state).toBe('resolved_partial');
    expect(getGame().squads[0]!.assignedIncidentId).toBeNull();
  });
});
