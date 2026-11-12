import type { GameState } from '../core/types';
import { parseSave, toSaveFile, type LoadResult, type SaveFile } from './saveFormat';

export type CampaignSlotId = 'auto' | 'slot1' | 'slot2' | 'slot3';
export type SandboxSlotId = 'sandbox-auto' | 'sandbox-slot1' | 'sandbox-slot2' | 'sandbox-slot3';
export type SlotId = CampaignSlotId | SandboxSlotId;
export type SaveMode = 'campaign' | 'sandbox';

export const SLOTS: { id: CampaignSlotId; label: string }[] = [
  { id: 'auto', label: 'Автосохранение' },
  { id: 'slot1', label: 'Слот 1' },
  { id: 'slot2', label: 'Слот 2' },
  { id: 'slot3', label: 'Слот 3' },
];
export const SANDBOX_SLOTS: { id: SandboxSlotId; label: string }[] = [
  { id: 'sandbox-auto', label: 'Автосохранение песочницы' },
  { id: 'sandbox-slot1', label: 'Слот песочницы 1' },
  { id: 'sandbox-slot2', label: 'Слот песочницы 2' },
  { id: 'sandbox-slot3', label: 'Слот песочницы 3' },
];
const ALL_SLOTS: { id: SlotId; label: string }[] = [...SLOTS, ...SANDBOX_SLOTS];

export const autoSlotFor = (state: GameState): SlotId => state.mode === 'sandbox' ? 'sandbox-auto' : 'auto';
export const saveModeFor = (slot: SlotId): SaveMode => slot.startsWith('sandbox-') ? 'sandbox' : 'campaign';
export const slotsForMode = (mode: SaveMode): { id: SlotId; label: string }[] => mode === 'sandbox' ? SANDBOX_SLOTS : SLOTS;

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
  const expected = state.mode === 'sandbox' ? 'sandbox' : 'campaign';
  if (saveModeFor(slot) !== expected) throw new Error('Этот слот относится к другому режиму игры.');
  const file = toSaveFile(state, ALL_SLOTS.find((s) => s.id === slot)!.label, new Date());
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
    const result = parseSave(raw);
    if (result.ok) {
      const actual = result.state.mode === 'sandbox' ? 'sandbox' : 'campaign';
      if (actual !== saveModeFor(slot)) return { ok: false, reason: 'В слоте сохранение другого режима.' };
    }
    return result;
  } catch (e) {
    // Битые данные внутри слота (миграция упала) — это повреждённое сохранение, а не отказ хранилища.
    return { ok: false, reason: `Сохранение повреждено: ${(e as Error).message}` };
  }
}

export interface SlotInfo { savedAt: string; shift: number; minute: number; mode: SaveMode }
export type SlotListing = Record<SlotId, SlotInfo | null>;

export async function listSlots(): Promise<SlotListing> {
  const result = Object.fromEntries(ALL_SLOTS.map(({ id }) => [id, null])) as SlotListing;
  try {
    for (const { id } of ALL_SLOTS) {
      const raw = await tx<SaveFile | undefined>('readonly', (st) => st.get(id));
      if (raw?.state) result[id] = {
        savedAt: raw.savedAt,
        shift: raw.state.shift,
        minute: raw.state.minute,
        mode: raw.state.mode === 'sandbox' ? 'sandbox' : 'campaign',
      };
    }
  } catch {
    /* хранилище недоступно (приватный режим) — показываем пустые слоты */
  }
  return result;
}

export function exportJson(state: GameState): string {
  return JSON.stringify(toSaveFile(state, 'Экспорт', new Date()), null, 2);
}
