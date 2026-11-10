import { describe, expect, it } from 'vitest';
import { MAP_LAYERS, initialUiState, uiReducer } from '../../src/ui/uiState';

describe('uiReducer', () => {
  it('starts on the map with the incident panel open and nothing selected', () => {
    expect(initialUiState.view).toBe('map');
    expect(initialUiState.leftPanelOpen).toBe(true);
    expect(initialUiState.rightPanelOpen).toBe(false);
    expect(initialUiState.selection).toBeNull();
  });

  it('keeps the panel state when switching views and back', () => {
    let s = uiReducer(initialUiState, { type: 'TOGGLE_LEFT_PANEL' });
    s = uiReducer(s, { type: 'OPEN_VIEW', view: 'staff' });
    s = uiReducer(s, { type: 'OPEN_VIEW', view: 'map' });
    expect(s.view).toBe('map');
    expect(s.leftPanelOpen).toBe(false);
  });

  it('selection opens the right panel; on a narrow screen it closes the left one (MAP-030)', () => {
    const wide = uiReducer(initialUiState, { type: 'SELECT', selection: { kind: 'district', id: 'MEDICAL' } });
    expect(wide.rightPanelOpen).toBe(true);
    expect(wide.leftPanelOpen).toBe(true);
    const narrow = uiReducer(initialUiState, { type: 'SELECT', selection: { kind: 'district', id: 'MEDICAL' }, narrow: true });
    expect(narrow.leftPanelOpen).toBe(false);
  });

  it('Escape: section → map, then closes the card, then clears the selection', () => {
    const staff = uiReducer(initialUiState, { type: 'OPEN_VIEW', view: 'staff' });
    expect(uiReducer(staff, { type: 'ESCAPE' }).view).toBe('map');
    let s = uiReducer(initialUiState, { type: 'SELECT', selection: { kind: 'incident', id: 'X' } });
    s = uiReducer(s, { type: 'ESCAPE' });
    expect(s.rightPanelOpen).toBe(false);
    expect(s.selection).not.toBeNull();
    s = uiReducer(s, { type: 'ESCAPE' });
    expect(s.selection).toBeNull();
    expect(uiReducer(s, { type: 'ESCAPE' })).toBe(s);
  });

  it('map layers are fixed: events, patrols, districts and threats on, service objects off', () => {
    expect(MAP_LAYERS).toEqual({ events: true, patrols: true, districts: true, risks: true, infrastructure: false });
  });

  it('returns the same object when opening the current view', () => {
    expect(uiReducer(initialUiState, { type: 'OPEN_VIEW', view: 'map' })).toBe(initialUiState);
  });
});
