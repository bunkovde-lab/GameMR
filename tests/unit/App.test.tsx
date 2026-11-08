import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

afterEach(cleanup);
import { App } from '../../src/App';

describe('App shell', () => {
  it('shows no demo numbers in the HUD before the game core exists', () => {
    render(<App />);
    for (const id of ['budget', 'safety', 'trust', 'staff']) {
      expect(screen.getByTestId(`stat-${id}`).textContent).toContain('—');
      expect(screen.getByTestId(`stat-${id}`).textContent).not.toMatch(/\d/);
    }
  });

  it('opens the staff section, closes it with Escape and keeps the collapsed panel', () => {
    render(<App />);
    fireEvent.click(screen.getByLabelText('Свернуть список вызовов'));
    expect(screen.queryByTestId('left-panel')).toBeNull();
    fireEvent.click(screen.getByTestId('nav-staff'));
    expect(screen.getByTestId('staff-screen')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('staff-screen')).toBeNull();
    expect(screen.queryByTestId('left-panel')).toBeNull();
    expect(screen.getByRole('button', { name: /Вызовы/ })).toBeTruthy();
  });
});
