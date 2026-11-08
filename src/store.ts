import { useSyncExternalStore } from 'react';
import { reduce } from './core/reduce';
import { createInitialState } from './core/state';
import type { Command, GameState } from './core/types';
import { loadFromSlot, saveToSlot } from './persistence/saveStore';

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
const AUTOSAVE_AFTER: Command['type'][] = ['START_SHIFT', 'ACKNOWLEDGE_INCIDENT', 'ASSIGN_STAFF', 'END_SHIFT', 'ADVANCE_SHIFT'];

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
  set({ game: result.state });
  if (AUTOSAVE_AFTER.includes(command.type)) {
    saveToSlot('auto', result.state).catch((e: Error) => notify('bad', `Автосохранение не удалось: ${e.message}`));
  }
  return true;
}

/** Полная замена состояния: загрузка, импорт, новая игра. */
export function replaceGame(game: GameState) {
  set({ game });
}

export async function bootstrap() {
  const auto = await loadFromSlot('auto');
  if (auto.ok) replaceGame(auto.state);
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
