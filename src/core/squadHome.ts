/**
 * Постоянный состав отрядов: сотрудник, временно выбывший из отряда (лечение, курс, установка органа,
 * исследование, замена раненого), запоминает своё место и сам возвращается туда, когда снова годен.
 */
import { BALANCE } from './content';
import { memberBlocker } from './dispatch';
import { DEPLOYED } from './selectors';
import type { GameState, Squad, Staff } from './types';

type Log = (type: string, text: string, staffIds?: string[]) => void;

const LOST: Staff['health'][] = ['dead', 'missing'];

/** Сотрудник временно не может служить в отряде (ранен, лечится, учится, ведёт исследование…). */
export function isAway(s: GameState, staffId: string, squadId: string): boolean {
  const why = memberBlocker(s, staffId, squadId);
  return !!why && why !== 'отряд не готов';
}

/** Вывести сотрудника из отряда, запомнив место и роль. standInId — кто его подменяет на этом месте. */
export function leaveSquad(p: Staff, sq: Squad, standInId: string | null = null) {
  const slot = sq.memberIds.indexOf(p.id);
  if (slot < 0) return;
  p.home = { squadId: sq.id, slot, commander: sq.commanderId === p.id, standInId };
  if (standInId) sq.memberIds[slot] = standInId;
  else sq.memberIds.splice(slot, 1);
  if (sq.commanderId === p.id) sq.commanderId = null;
}

/** Состояние возврата для интерфейса: null — сотруднику некуда возвращаться. */
export function homeStatus(s: GameState, p: Staff): { squad: Squad; text: string; waiting: boolean } | null {
  const h = p.home;
  if (!h || LOST.includes(p.health)) return null;
  const squad = s.squads.find((q) => q.id === h.squadId);
  if (!squad || squad.memberIds.includes(p.id)) return null;
  if (isAway(s, p.id, squad.id)) return { squad, text: `Вернётся в отряд «${squad.name}»`, waiting: false };
  if (DEPLOYED.includes(squad.status)) return { squad, text: `Вернётся в «${squad.name}» после выезда`, waiting: true };
  return { squad, text: `Ждёт места в отряде «${squad.name}»`, waiting: true };
}

/** Вернуть всех, кто снова годен, на прежние места. Вызывается между сменами и по ходу смены. */
export function returnHome(s: GameState, log: Log) {
  for (const p of s.staff) {
    const h = p.home;
    if (!h) continue;
    const squad = s.squads.find((q) => q.id === h.squadId);
    const current = s.squads.find((q) => q.memberIds.includes(p.id));
    // Погиб, отряда нет или руководитель уже сам поставил человека в отряд — запоминать нечего.
    if (LOST.includes(p.health) || !squad || current) { p.home = null; continue; }
    if (isAway(s, p.id, squad.id) || DEPLOYED.includes(squad.status)) continue;
    const standIn = h.standInId && squad.memberIds.includes(h.standInId) ? s.staff.find((x) => x.id === h.standInId) : undefined;
    let note = '';
    if (squad.memberIds.length < BALANCE.squad.maxMembers) {
      squad.memberIds.splice(Math.min(h.slot, squad.memberIds.length), 0, p.id);
    } else if (standIn) {
      squad.memberIds[squad.memberIds.indexOf(standIn.id)] = p.id;
      if (squad.commanderId === standIn.id) squad.commanderId = null;
      note = `, ${standIn.name} — в резерв`;
    } else continue; // мест нет: ждёт, интерфейс показывает пометку
    if (h.commander && !squad.commanderId) squad.commanderId = p.id;
    p.home = null;
    log('staff_returned', `${p.name} вернулся(лась) в отряд «${squad.name}»${h.commander && squad.commanderId === p.id ? ' командиром' : ''}${note}.`, standIn ? [p.id, standIn.id] : [p.id]);
  }
}

/** Кто временно выбыл из отряда и вернётся сам: для пометки в карточке отряда. */
export function awayFrom(s: GameState, squadId: string): { person: Staff; reason: string }[] {
  return s.staff
    .filter((p) => p.home?.squadId === squadId)
    .map((p) => ({ person: p, st: homeStatus(s, p) }))
    .filter((x) => x.st)
    .map(({ person, st }) => ({
      person,
      reason: st!.waiting ? (DEPLOYED.includes(st!.squad.status) ? 'ждёт возвращения отряда' : 'ждёт свободного места') : memberBlocker(s, person.id, squadId) ?? '',
    }));
}

/** Строка для карточки отряда: «Временно выбыли: …». */
export const awayLine = (s: GameState, squadId: string) =>
  awayFrom(s, squadId).map(({ person, reason }) => `${person.name} (${reason})`).join(', ');
