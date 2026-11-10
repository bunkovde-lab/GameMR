/**
 * Локальное состояние интерфейса (не игровое, W3 §7 «Map View»). Выделение ≠ принятие вызова.
 */
export type ViewId = 'map' | 'staff' | 'investigations' | 'directorate';
export type LayerId = 'events' | 'patrols' | 'districts' | 'risks' | 'infrastructure';
export type Selection = { kind: 'incident' | 'district' | 'squad'; id: string } | null;

export interface UiState {
  view: ViewId;
  rightPanelOpen: boolean;
  selection: Selection;
  /** Отряд, маршрут которого показываем в превью (наведение в карточке вызова) */
  previewSquadId: string | null;
  /** Какое дело открыть на экране расследований (переход из карточки вызова) */
  focusCaseId?: string | null;
}

export type UiAction =
  | { type: 'OPEN_VIEW'; view: ViewId; caseId?: string }
  | { type: 'SELECT'; selection: Selection }
  | { type: 'CLOSE_RIGHT_PANEL' }
  | { type: 'PREVIEW_SQUAD'; squadId: string | null }
  | { type: 'ESCAPE' };

/** Слои карты постоянны (кнопок фильтров нет): события, патрули, районы и угрозы видны всегда, служебные объекты скрыты. */
export const MAP_LAYERS: Readonly<Record<LayerId, boolean>> = {
  events: true,
  patrols: true,
  districts: true,
  risks: true,
  infrastructure: false,
};

export const initialUiState: UiState = {
  view: 'map',
  rightPanelOpen: false,
  selection: null,
  previewSquadId: null,
};

/** Узкий экран (< 950 px, W3 §6): карточка справа — выдвижная, поверх карты. */
export const NARROW_PX = 950;

export function uiReducer(state: UiState, action: UiAction): UiState {
  switch (action.type) {
    case 'OPEN_VIEW':
      if (action.caseId !== undefined) return { ...state, view: action.view, focusCaseId: action.caseId };
      return state.view === action.view ? state : { ...state, view: action.view, focusCaseId: null };
    case 'SELECT':
      return {
        ...state,
        selection: action.selection,
        rightPanelOpen: action.selection !== null,
        previewSquadId: null,
      };
    case 'CLOSE_RIGHT_PANEL':
      // W3 §5: крестик закрывает карточку, но не сбрасывает выбранный объект.
      return { ...state, rightPanelOpen: false, previewSquadId: null };
    case 'PREVIEW_SQUAD':
      return state.previewSquadId === action.squadId ? state : { ...state, previewSquadId: action.squadId };
    case 'ESCAPE':
      if (state.view !== 'map') return { ...state, view: 'map' };
      if (state.rightPanelOpen) return { ...state, rightPanelOpen: false, previewSquadId: null };
      if (state.selection) return { ...state, selection: null };
      return state;
  }
}
