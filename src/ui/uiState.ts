/**
 * Локальное состояние интерфейса (не игровое). ТЗ §5.3: SELECT_* и навигация не меняют домен.
 * Игровое состояние появится в W2 в src/core и будет храниться отдельно.
 */
export type ViewId = 'map' | 'staff';

export interface UiState {
  view: ViewId;
  leftPanelOpen: boolean;
}

export type UiAction =
  | { type: 'OPEN_VIEW'; view: ViewId }
  | { type: 'TOGGLE_LEFT_PANEL' }
  | { type: 'ESCAPE' };

export const initialUiState: UiState = { view: 'map', leftPanelOpen: true };

export function uiReducer(state: UiState, action: UiAction): UiState {
  switch (action.type) {
    case 'OPEN_VIEW':
      return state.view === action.view ? state : { ...state, view: action.view };
    case 'TOGGLE_LEFT_PANEL':
      return { ...state, leftPanelOpen: !state.leftPanelOpen };
    case 'ESCAPE':
      // Esc закрывает раздел и возвращает на карту; на карте ничего не делает (выделения появятся в W3).
      return state.view === 'map' ? state : { ...state, view: 'map' };
  }
}
