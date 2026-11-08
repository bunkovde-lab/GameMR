/**
 * Локальное состояние интерфейса (не игровое, W3 §7 «Map View»). Выделение ≠ принятие вызова.
 */
export type ViewId = 'map' | 'staff';
export type LayerId = 'events' | 'patrols' | 'districts' | 'risks' | 'infrastructure';
export type Selection = { kind: 'incident' | 'district' | 'squad'; id: string } | null;

export interface UiState {
  view: ViewId;
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
  selection: Selection;
  /** Отряд, маршрут которого показываем в превью (наведение в карточке вызова) */
  previewSquadId: string | null;
  layers: Record<LayerId, boolean>;
}

export type UiAction =
  | { type: 'OPEN_VIEW'; view: ViewId }
  | { type: 'TOGGLE_LEFT_PANEL' }
  | { type: 'SELECT'; selection: Selection; narrow?: boolean }
  | { type: 'CLOSE_RIGHT_PANEL' }
  | { type: 'PREVIEW_SQUAD'; squadId: string | null }
  | { type: 'TOGGLE_LAYER'; layer: LayerId }
  | { type: 'ESCAPE' };

export const DEFAULT_LAYERS: Record<LayerId, boolean> = {
  events: true,
  patrols: false,
  districts: false,
  risks: false,
  infrastructure: false,
};

export const initialUiState: UiState = {
  view: 'map',
  leftPanelOpen: true,
  rightPanelOpen: false,
  selection: null,
  previewSquadId: null,
  layers: DEFAULT_LAYERS,
};

/** Узкий экран (< 950 px, W3 §6): панели — выдвижные, одновременно открыта только одна. */
export const NARROW_PX = 950;

export function uiReducer(state: UiState, action: UiAction): UiState {
  switch (action.type) {
    case 'OPEN_VIEW':
      return state.view === action.view ? state : { ...state, view: action.view };
    case 'TOGGLE_LEFT_PANEL':
      return { ...state, leftPanelOpen: !state.leftPanelOpen };
    case 'SELECT':
      return {
        ...state,
        selection: action.selection,
        rightPanelOpen: action.selection !== null,
        previewSquadId: null,
        leftPanelOpen: action.narrow && action.selection ? false : state.leftPanelOpen,
      };
    case 'CLOSE_RIGHT_PANEL':
      // W3 §5: крестик закрывает карточку, но не сбрасывает выбранный объект.
      return { ...state, rightPanelOpen: false, previewSquadId: null };
    case 'PREVIEW_SQUAD':
      return state.previewSquadId === action.squadId ? state : { ...state, previewSquadId: action.squadId };
    case 'TOGGLE_LAYER':
      return { ...state, layers: { ...state.layers, [action.layer]: !state.layers[action.layer] } };
    case 'ESCAPE':
      if (state.view !== 'map') return { ...state, view: 'map' };
      if (state.rightPanelOpen) return { ...state, rightPanelOpen: false, previewSquadId: null };
      if (state.selection) return { ...state, selection: null };
      return state;
  }
}
