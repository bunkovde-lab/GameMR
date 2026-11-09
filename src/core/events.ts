import { INCIDENT_TEMPLATES, type IncidentTemplate } from './content';
import { setFlag } from './flags';
import { caseDef, caseFile } from './investigations';
import { HOUSES } from './politics';
import type { GameState, Incident, Outcome } from './types';

/**
 * W10: 36 происшествий по сценарию W10_EVENTS_v1. Сюжетные приходят в свою смену и в случайный пул не входят;
 * у каждого есть последствия опоздания, флаги Core и скрытая правда, которую игрок видит только после успеха
 * (у сюжетных — никогда: их правду раскрывает расследование, а не отчёт).
 */
export const templateById = (id: string): IncidentTemplate | undefined => INCIDENT_TEMPLATES.find((t) => t.id === id);
export const templateOf = (inc: Incident) => templateById(inc.templateId);

/** Случайный пул смены: только процедурные события. */
export const RANDOM_POOL: IncidentTemplate[] = INCIDENT_TEMPLATES.filter((t) => !t.story);

/** Сюжетные события этой смены (кроме тех, что уже приходят иначе: стартовые вызовы и узлы кампании). */
export const storyTemplatesFor = (shift: number, alreadySpawned: string[]) =>
  INCIDENT_TEMPLATES.filter((t) => t.story?.shift === shift && !alreadySpawned.includes(t.id));

/** «Что на кону» для карточки вызова: последствия без строк о деле (их игрок узнаёт из расследования). */
export function publicAftermath(t: IncidentTemplate | undefined): string[] {
  if (!t?.aftermath) return [];
  return houseText(t.aftermath)
    .split(/(?<=\.)\s+(?=[А-ЯЁ][а-яё]+:)/)
    .map((x) => x.trim())
    .filter((x) => x && !x.startsWith('Дело:'));
}

/** Флаги Core по исходу: успех — все «хорошие», частичный — первый; флаги «_at_risk» ставятся при неудаче или частичном. */
export function outcomeFlags(t: IncidentTemplate | undefined, outcome: Outcome): string[] {
  const all = t?.coreFlags ?? [];
  const good = all.filter((f) => !f.endsWith('_at_risk'));
  const risk = all.filter((f) => f.endsWith('_at_risk'));
  if (outcome === 'success') return good;
  if (outcome === 'partial') return [...good.slice(0, 1), ...risk];
  return risk;
}

/** Развязка операции: флаги, сведения для отчёта. */
export function applyEventOutcome(s: GameState, inc: Incident, outcome: Outcome): string[] {
  const t = templateOf(inc);
  if (!t) return [];
  for (const f of outcomeFlags(t, outcome)) setFlag(s, f);
  const findings: string[] = [];
  if (outcome === 'success' && t.hidden && !t.story) findings.push(`Что выяснилось: ${houseText(t.hidden)}`);
  if (t.story && outcome !== 'failure') {
    const def = caseDef(t.story.caseId);
    const f = caseFile(s, t.story.caseId);
    if (def && f && f.status === 'open') findings.push(`Сведения с места переданы в дело №${def.number}.`);
  }
  return findings;
}

/** Что происходит, когда вызов не взяли вовремя: обострение, исчезновение или новое событие. */
export function lateKind(inc: Incident): 'escalate' | 'expire' | 'branch' {
  return (templateOf(inc)?.deadlineType ?? inc.deadlineType) as 'escalate' | 'expire' | 'branch';
}

/**
 * Имена Домов в текстах сценария записаны порядковыми («Первого Дома»). Если в справочнике Домов уже утверждённое
 * имя («Дом Ротан»), подставляем его в нужном падеже: «Дома Ротан», «Дому Ротан», «Дом Ротан». Иначе текст как есть.
 */
const ORD = ['Перв', 'Втор', 'Трет', 'Четв[её]рт', 'Пят', 'Шест'];
export function houseTextWith(text: string, named: (i: number) => string | null): string {
  const ord = `(${ORD.join('|')})(?:ый|ой|ий)`;
  const idx = (w: string) => ORD.findIndex((st) => new RegExp(`^${st}`).test(w));
  // «Шестой и Пятый Дома» → «Дома Астэр и Варек»
  let out = text.replace(new RegExp(`${ord} и ${ord} Дома`, 'g'), (m, a: string, b: string) => {
    const na = named(idx(a)), nb = named(idx(b));
    return na && nb ? `Дома ${na} и ${nb}` : m;
  });
  ORD.forEach((stem, i) => {
    const name = named(i);
    if (!name) return;
    out = out
      .replace(new RegExp(`${stem}(?:ого|ому|его|ему) Дом(а|у)`, 'g'), (_m, c: string) => `Дом${c} ${name}`)
      .replace(new RegExp(`${stem}(?:ый|ой|ий) Дом(?![а-яё])`, 'g'), `Дом ${name}`);
  });
  return out;
}
export const houseText = (text: string) =>
  houseTextWith(text, (i) => {
    const label = HOUSES.find((h) => h.id === `h${i + 1}`)?.label ?? '';
    return label.startsWith('Дом ') ? label.slice(4) : null;
  });
