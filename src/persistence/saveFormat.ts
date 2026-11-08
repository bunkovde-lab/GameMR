import { SCHEMA_VERSION, type GameState } from '../core/types';
import { initialEquipment } from '../core/dispatch';
import { allegianceStart, initialRelations } from '../core/career';
import { initialFacilities } from '../core/facilities';

/** Формат файла сохранения и экспорта. */
export interface SaveFile {
  format: 'gamemr-save';
  schemaVersion: number;
  savedAt: string;
  label: string;
  state: GameState;
}

export type LoadResult = { ok: true; state: GameState } | { ok: false; reason: string };

/**
 * Миграции схемы: ключ — версия, из которой переводим. Сейчас схема одна (v1),
 * при изменении GameState добавляется функция N → N+1 и тест на неё.
 */
const MIGRATIONS: Record<number, (s: Record<string, unknown>) => Record<string, unknown>> = {
  /** v1 (W2) → v2 (W3): у отрядов появилось движение по графу, у города — закрытые дороги. */
  1: (s) => ({
    ...s,
    roadClosures: [],
    squads: (s.squads as Record<string, unknown>[]).map((q) => ({ ...q, movement: null })),
  }),
  /** v2 (W3) → v3 (W4): склад снаряжения по единицам, у отряда — параметры текущего выезда. */
  2: (s) => ({
    ...s,
    equipment: initialEquipment(),
    squads: (s.squads as Record<string, unknown>[]).map((q) => ({ ...q, operation: null })),
  }),
  /** v3 (W4) → v4 (W5): ход операции на месте, отчёты операций. Выезды в пути продолжаются по общим правилам. */
  3: (s) => ({
    ...s,
    operationReports: [],
    nextIds: { ...(s.nextIds as Record<string, number>), report: 1 },
    squads: (s.squads as Record<string, unknown>[]).map((q) => {
      const op = q.operation as Record<string, unknown> | null;
      if (!op) return q;
      return {
        ...q,
        operation: {
          riskLevel: 2, timer: 3, stageIndex: 0, pDelta: 0, riskDelta: 0, civil: 0, evidence: 0, decisions: [],
          ...op,
          phase: q.status === 'on_scene' ? 'scene' : 'travel',
        },
      };
    }),
  }),
  /** v4 (W5) → v5 (W6): клиника, кандидаты, командиры отрядов, адаптация. Кандидаты появятся со следующей сменой. */
  4: (s) => ({
    ...s,
    medical: { patients: [] },
    candidates: [],
    nextIds: { ...(s.nextIds as Record<string, number>), staff: (s.staff as unknown[]).length + 1, candidate: 1 },
    staff: (s.staff as Record<string, unknown>[]).map((p) => ({ ...p, adaptation: 0, patron: null })),
    squads: (s.squads as Record<string, unknown>[]).map((q) => ({ ...q, commanderId: null })),
  }),
  /** v5 (W6) → v6 (W6.2): навыки, курсы, органы, преданность, связи. Старые записи журнала остаются без привязки к людям. */
  5: (s) => {
    const next = {
      ...s,
      staff: (s.staff as Record<string, unknown>[]).map((p) => ({ ...p, skills: [], training: null, implants: [], allegiance: allegianceStart() })),
      operationReports: (s.operationReports as Record<string, unknown>[]).map((r) => ({ ...r, memberIds: [] })),
      relations: [],
    };
    initialRelations(next as unknown as GameState);
    return next;
  },
  /** v6 (W6.2) → v7 (W7): объекты дирекции на 1-м уровне, пустая строительная очередь. */
  6: (s) => ({ ...s, facilities: initialFacilities(), construction: [] }),
};

export function toSaveFile(state: GameState, label: string, now: Date): SaveFile {
  return { format: 'gamemr-save', schemaVersion: SCHEMA_VERSION, savedAt: now.toISOString(), label, state };
}

/** Разбор и проверка без побочных эффектов: при ошибке ничего не перезаписывается. */
export function parseSave(raw: unknown): LoadResult {
  let data = raw;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      return { ok: false, reason: 'Файл повреждён: это не JSON.' };
    }
  }
  if (!isObject(data) || data.format !== 'gamemr-save' || !isObject(data.state))
    return { ok: false, reason: 'Это не файл сохранения GameMR.' };
  let version = Number(data.schemaVersion);
  if (!Number.isInteger(version)) return { ok: false, reason: 'В сохранении нет версии схемы.' };
  if (version > SCHEMA_VERSION)
    return { ok: false, reason: `Сохранение из более новой версии игры (схема ${version}). Обновите игру.` };
  let state = data.state as Record<string, unknown>;
  while (version < SCHEMA_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) return { ok: false, reason: `Нет миграции со схемы ${version}.` };
    state = step(state);
    version += 1;
  }
  const problem = validateState(state);
  if (problem) return { ok: false, reason: `Сохранение повреждено: ${problem}.` };
  return { ok: true, state: state as unknown as GameState };
}

function validateState(s: Record<string, unknown>): string | null {
  const arrays = ['districts', 'staff', 'squads', 'incidents', 'roadClosures', 'equipment', 'log', 'reports', 'operationReports', 'candidates', 'relations', 'construction'] as const;
  for (const k of arrays) if (!Array.isArray(s[k])) return `нет раздела ${k}`;
  if (!Number.isInteger(s.shift) || (s.shift as number) < 1) return 'неверный номер смены';
  if (!Number.isInteger(s.minute) || (s.minute as number) < 0) return 'неверное время';
  if (!['BRIEFING', 'ACTIVE', 'REVIEW_PENDING', 'SHIFT_REPORT'].includes(s.phase as string)) return 'неверная фаза смены';
  const rng = s.rng as Record<string, unknown> | undefined;
  if (!isObject(rng) || !Number.isInteger(rng.state) || !Number.isInteger(rng.cursor)) return 'нет состояния генератора';
  const eco = s.economy as Record<string, unknown> | undefined;
  if (!isObject(eco) || !Number.isInteger(eco.balance) || !Array.isArray(eco.ledger)) return 'нет экономики';
  const staffIds = new Set((s.staff as { id: string }[]).map((p) => p.id));
  const seen = new Set<string>();
  for (const q of s.squads as { memberIds: string[] }[]) {
    for (const id of q.memberIds) {
      if (!staffIds.has(id)) return `в отряде неизвестный сотрудник ${id}`;
      if (seen.has(id)) return `сотрудник ${id} числится в двух отрядах`;
      seen.add(id);
    }
  }
  return null;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
