import type { HealthState } from './types';

/** Формулировки для журнала и отчётов (ТЗ §7.4). */
export const HEALTH_LOG: Record<HealthState, string> = {
  healthy: 'здоров',
  fatigued: 'переутомлён',
  light_injury: 'лёгкое ранение',
  serious_injury: 'тяжёлое ранение',
  critical: 'критическое состояние',
  recovering: 'восстанавливается',
  missing: 'пропал без вести',
  dead: 'погиб при исполнении',
};
