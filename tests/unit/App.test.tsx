import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { App } from '../../src/App';
import { createInitialState } from '../../src/core/state';
import { getGame, replaceGame } from '../../src/store';

afterEach(() => {
  cleanup();
  replaceGame(createInitialState());
});

describe('App shell', () => {
  it('HUD shows values from the core (ТЗ §3.1: one state, one ID)', () => {
    render(<App />);
    expect(screen.getByTestId('stat-budget').textContent).toContain('105');
    expect(screen.getByTestId('stat-staff').textContent).toContain('12');
    expect(screen.getByTestId('clock').textContent).toContain('08:00');
  });

  it('CORE-02: re-rendering 100 times does not touch the RNG', () => {
    const before = getGame().rng;
    const { rerender } = render(<App />);
    for (let i = 0; i < 100; i++) rerender(<App />);
    expect(getGame().rng).toEqual(before);
  });

  it('briefing → start → acknowledge updates the list from the core', () => {
    render(<App />);
    fireEvent.click(screen.getByTestId('start-shift'));
    expect(getGame().phase).toBe('ACTIVE');
    const item = screen.getByTestId('incident-bioleak');
    fireEvent.click(item.querySelector('button')!);
    expect(getGame().incidents.find((i) => i.id === 'bioleak')!.state).toBe('acknowledged');
    expect(screen.getByTestId('incident-bioleak').textContent).toContain('Принят');
  });

  it('staff section lists 12 people and Escape returns to the map keeping the collapsed panel', () => {
    render(<App />);
    fireEvent.click(screen.getByTestId('start-shift'));
    act(() => { fireEvent.click(screen.getByLabelText('Свернуть список вызовов')); });
    fireEvent.click(screen.getByTestId('nav-staff'));
    expect(screen.getAllByTestId(/^staff-p/)).toHaveLength(12);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('staff-screen')).toBeNull();
    expect(screen.queryByTestId('left-panel')).toBeNull();
  });
});
