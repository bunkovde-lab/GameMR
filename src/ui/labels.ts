import type { IncidentState, Severity, SquadStatus } from '../core/types';

export const SEVERITY_LABEL: Record<Severity, string> = { critical: 'Критично', high: 'Высокий риск', medium: 'Средний риск', low: 'Низкий риск' };

export const INCIDENT_STATE_LABEL: Record<IncidentState, string> = {
  new: 'Новый',
  acknowledged: 'Принят',
  assigned: 'Назначен отряд',
  en_route: 'Отряд в пути',
  on_scene: 'Отряд на месте',
  resolved_success: 'Закрыт',
  resolved_partial: 'Закрыт частично',
  failed: 'Провален',
  escalated: 'Ухудшение',
  expired: 'Истёк',
};

export const SQUAD_STATUS: Record<SquadStatus, { label: string; tone: 'green' | 'cyan' | 'amber' | 'red' | 'grey' }> = {
  ready: { label: 'Готов', tone: 'green' },
  en_route: { label: 'В пути', tone: 'cyan' },
  on_scene: { label: 'На месте', tone: 'amber' },
  returning: { label: 'Возвращается', tone: 'cyan' },
  resting: { label: 'Отдых', tone: 'grey' },
  treatment: { label: 'Лечение', tone: 'red' },
  recovery: { label: 'Восстановление', tone: 'amber' },
  unavailable: { label: 'Недоступен', tone: 'grey' },
};
