import { useSyncExternalStore } from 'react';
import { reduce } from './core/reduce';
import { createInitialState } from './core/state';
import type { Command, GameState } from './core/types';
import { autoSlotFor, EMPTY_SLOT, loadFromSlot, saveToSlot } from './persistence/saveStore';

/**
 * Мост между ядром и React. Единственное место, где вызывается reduce().
 * UI читает состояние и отправляет команды; напрямую домен не меняет (ТЗ §5.1).
 */
export interface Notice {
  id: number;
  kind: 'good' | 'bad';
  text: string;
}

interface Snapshot {
  game: GameState;
  notice: Notice | null;
}

/** Команды, после которых делается автосохранение (ТЗ §5.4). */
const AUTOSAVE_AFTER: Command['type'][] = ['START_SHIFT', 'ACKNOWLEDGE_INCIDENT', 'ASSIGN_STAFF', 'UNASSIGN_STAFF', 'SWAP_STAFF', 'SET_COMMANDER', 'START_TREATMENT', 'DEEP_CHECK', 'HIRE', 'QUEUE_UPGRADE', 'CANCEL_UPGRADE', 'PRIORITIZE_UPGRADE', 'START_PROJECT', 'CANCEL_PROJECT', 'FABRICATE', 'START_COURSE', 'PROMOTE', 'INSTALL_ORGAN', 'REMOVE_ORGAN', 'DISPATCH_SQUAD', 'END_SHIFT', 'ADVANCE_SHIFT', 'CASE_ACTION', 'CONCLUDE_CASE', 'ACK_OPERATION_REPORT', 'BUY_SANDBOX_SQUAD', 'ACK_SANDBOX_RESULT'];

let snapshot: Snapshot = { game: createInitialState(), notice: null };
let noticeId = 0;
const listeners = new Set<() => void>();

function set(next: Partial<Snapshot>) {
  snapshot = { ...snapshot, ...next };
  listeners.forEach((l) => l());
}

export function notify(kind: Notice['kind'], text: string) {
  set({ notice: { id: ++noticeId, kind, text } });
}

export function dispatch(command: Command): boolean {
  const result = reduce(snapshot.game, command);
  if (!result.ok) {
    if (command.type !== 'TICK') notify('bad', result.reason);
    return false;
  }
  const before = snapshot.game;
  set({ game: result.state });
  if (command.type === 'TICK' && result.state.paused && result.state.incidents.length > before.incidents.length) {
    const fresh = result.state.incidents.slice(before.incidents.length).map((i) => i.title).join(', ');
    notify('good', `Новый вызов: ${fresh}. Игра на паузе — решите, кого отправить.`);
  }
  if (AUTOSAVE_AFTER.includes(command.type)) {
    saveToSlot(autoSlotFor(result.state), result.state).catch((e: Error) => notify('bad', `Автосохранение не удалось: ${e.message}`));
  }
  return true;
}

/** Полная замена состояния: загрузка, импорт, новая игра. */
export function replaceGame(game: GameState) {
  set({ game });
}

/** Итог запуска: восстановлено ли автосохранение (для пункта «Продолжить» главного меню). */
export type BootResult = { restored: true } | { restored: false; empty: boolean; reason: string };
let boot: BootResult = { restored: false, empty: true, reason: EMPTY_SLOT };
let sandboxBoot: BootResult = { restored: false, empty: true, reason: EMPTY_SLOT };

export async function bootstrap() {
  const [auto, sandboxAuto] = await Promise.all([loadFromSlot('auto'), loadFromSlot('sandbox-auto')]);
  if (auto.ok) replaceGame(auto.state);
  boot = auto.ok ? { restored: true } : { restored: false, empty: auto.reason === EMPTY_SLOT, reason: auto.reason };
  sandboxBoot = sandboxAuto.ok ? { restored: true } : { restored: false, empty: sandboxAuto.reason === EMPTY_SLOT, reason: sandboxAuto.reason };
}

export function bootResult(): BootResult {
  return boot;
}

export function sandboxBootResult(): BootResult {
  return sandboxBoot;
}

export function useGame(): Snapshot {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => snapshot,
  );
}

export function getGame() {
  return snapshot.game;
}
