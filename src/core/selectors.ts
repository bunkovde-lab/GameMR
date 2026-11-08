import { BALANCE } from './content';
import type { GameState, Incident, SquadStatus } from './types';

export const DEPLOYED: readonly SquadStatus[] = ['en_route', 'on_scene', 'returning'];
export const OPEN_INCIDENT_STATES: readonly Incident['state'][] = [
  'new', 'acknowledged', 'assigned', 'en_route', 'on_scene', 'escalated',
];

export const isOpen = (i: Incident) => OPEN_INCIDENT_STATES.includes(i.state);
export const aliveStaff = (s: GameState) => s.staff.filter((p) => p.health !== 'dead');
export const average = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
export const citySafety = (s: GameState) => average(s.districts.map((d) => d.safety));
export const cityTrust = (s: GameState) => average(s.districts.map((d) => d.civilianTrust));

/** Часы:минуты на игровых часах. */
export function clockLabel(s: GameState): string {
  const total = BALANCE.shift.startClockMinute + s.minute;
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Сумма в сотых РЕ → «103,75». */
export function formatRe(cents: number): string {
  const sign = cents < 0 ? '−' : '';
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  return `${sign}${whole}${frac ? ',' + String(frac).padStart(2, '0') : ''}`;
}
