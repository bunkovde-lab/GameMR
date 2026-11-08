import { describe, expect, it } from 'vitest';
import { initialUiState, uiReducer } from '../../src/ui/uiState';

describe('uiReducer', () => {
  it('starts on the map with the incident panel open', () => {
    expect(initialUiState).toEqual({ view: 'map', leftPanelOpen: true });
  });

  it('keeps the panel state when switching views and back', () => {
    let s = uiReducer(initialUiState, { type: 'TOGGLE_LEFT_PANEL' });
    s = uiReducer(s, { type: 'OPEN_VIEW', view: 'staff' });
    s = uiReducer(s, { type: 'OPEN_VIEW', view: 'map' });
    expect(s).toEqual({ view: 'map', leftPanelOpen: false });
  });

  it('Escape returns from a section to the map and is a no-op on the map', () => {
    const staff = uiReducer(initialUiState, { type: 'OPEN_VIEW', view: 'staff' });
    expect(uiReducer(staff, { type: 'ESCAPE' }).view).toBe('map');
    expect(uiReducer(initialUiState, { type: 'ESCAPE' })).toBe(initialUiState);
  });

  it('returns the same object when opening the current view', () => {
    expect(uiReducer(initialUiState, { type: 'OPEN_VIEW', view: 'map' })).toBe(initialUiState);
  });
});
