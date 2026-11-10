import type { GameState } from '../core/types';
import { parseSave, toSaveFile, type LoadResult, type SaveFile } from './saveFormat';

export type SlotId = 'auto' | 'slot1' | 'slot2' | 'slot3';
export const SLOTS: { id: SlotId; label: string }[] = [
  { id: 'auto', label: 'Автосохранение' },
  { id: 'slot1', label: 'Слот 1' },
  { id: 'slot2', label: 'Слот 2' },
  { id: 'slot3', label: 'Слот 3' },
];

export const EMPTY_SLOT = 'Слот пуст.';

const DB = 'gamemr';
const STORE = 'saves';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(req.result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  } finally {
    db.close();
  }
}

/** Запись — одна атомарная операция IndexedDB: при ошибке прежнее сохранение остаётся. */
export async function saveToSlot(slot: SlotId, state: GameState): Promise<void> {
  const file = toSaveFile(state, SLOTS.find((s) => s.id === slot)!.label, new Date());
  await tx('readwrite', (st) => st.put(file, slot));
}

export async function loadFromSlot(slot: SlotId): Promise<LoadResult> {
  let raw: SaveFile | undefined;
  try {
    raw = await tx<SaveFile | undefined>('readonly', (st) => st.get(slot));
  } catch (e) {
    return { ok: false, reason: `Хранилище браузера недоступно: ${(e as Error).message}` };
  }
  if (!raw) return { ok: false, reason: EMPTY_SLOT };
  try {
    return parseSave(raw);
  } catch (e) {
    // Битые данные внутри слота (миграция упала) — это повреждённое сохранение, а не отказ хранилища.
    return { ok: false, reason: `Сохранение повреждено: ${(e as Error).message}` };
  }
}

export async function listSlots(): Promise<Record<SlotId, { savedAt: string; shift: number } | null>> {
  const result = { auto: null, slot1: null, slot2: null, slot3: null } as Record<SlotId, { savedAt: string; shift: number } | null>;
  try {
    for (const { id } of SLOTS) {
      const raw = await tx<SaveFile | undefined>('readonly', (st) => st.get(id));
      if (raw?.state) result[id] = { savedAt: raw.savedAt, shift: raw.state.shift };
    }
  } catch {
    /* хранилище недоступно (приватный режим) — показываем пустые слоты */
  }
  return result;
}

export function exportJson(state: GameState): string {
  return JSON.stringify(toSaveFile(state, 'Экспорт', new Date()), null, 2);
}
