import campaignFile from '../../content/campaign_v1.json';
import { INCIDENT_TEMPLATES } from './content';
import { hasFlag, setFlag } from './flags';
import { applyEffect, caseDef, caseFile, caseStrong, concludeCase, evidenceDef, resolveRef, type Effect } from './investigations';
import { storyTemplatesFor } from './events';
import { nextInt } from './rng';
import { SPECIAL_OPS, opState } from './specialOps';
import type { GameState, Incident } from './types';

/**
 * W9: кампания «Неисполненный жребий» на 12 смен (ТЗ §13, сценарий §7–8).
 * Сюжетные узлы приходят в начале смены, решения влияют на дела и политику, финал выводится из событий, а не из «очков».
 */

export interface StoryOption {
  id: string; label: string; hint: string; effects?: Effect; flags?: string[]; closeCase?: { caseId: string; conclusionId: string };
}
export interface StoryNode { shift: number; title: string; text: string; spawn?: string; options?: StoryOption[] }
export type EndingId = 'order' | 'cost' | 'collapse';

export const CAMPAIGN = campaignFile as unknown as {
  title: string; lastShift: number; nodes: StoryNode[]; endings: Record<EndingId, { title: string; text: string; art: string }>;
};
export const storyNode = (shift: number) => CAMPAIGN.nodes.find((n) => n.shift === shift);

type Post = (amount: number, note: string) => void;
type Log = (type: string, text: string, ids?: string[]) => void;

/** Сюжетный вызов (смены 5 и 9): дело откроется по итогам операции на нём, даже если прошлые улики потеряны. */
export function spawnStoryIncident(s: GameState, templateId: string, log: Log): Incident | null {
  const t = INCIDENT_TEMPLATES.find((x) => x.id === templateId);
  if (!t) return null;
  let spawn: number;
  [spawn, s.rng] = nextInt(s.rng, 3);
  const inc: Incident = {
    id: `inc-${s.nextIds.incident++}`, templateId: t.id, title: t.title, districtId: t.districtId, spawnId: `${t.districtId}:spawn:0${spawn + 1}`,
    severity: t.severity, state: 'new', deadlineType: t.deadlineType ?? 'escalate', deadlineMinute: 60 + t.deadlineMinutes, createdShift: s.shift,
  };
  s.incidents.push(inc);
  log('incident_created', `Новый вызов: ${inc.title}.`);
  return inc;
}

/** Начало смены: сюжетный узел (запись в журнал, сюжетный вызов). */
export function beginStoryShift(s: GameState, log: Log) {
  const n = storyNode(s.shift);
  if (!n) return;
  log('story', `${CAMPAIGN.title}, смена ${n.shift}: «${n.title}».`);
  if (n.spawn) spawnStoryIncident(s, n.spawn, log);
  // W10: сюжетные происшествия своей смены (сценарий W10_EVENTS_v1) приходят по расписанию, а не из случайного пула.
  for (const t of storyTemplatesFor(s.shift, n.spawn ? [n.spawn] : [])) spawnStoryIncident(s, t.id, log);
}

export function storyChoiceBlocker(s: GameState, shift: number, optionId: string): string | null {
  const n = storyNode(shift);
  if (!n?.options?.length) return 'В этой смене нет сюжетного решения.';
  if (shift !== s.shift) return 'Решение относится к другой смене.';
  if (s.campaign.choices[String(shift)]) return 'Решение уже принято.';
  if (!n.options.some((o) => o.id === optionId)) return 'Нет такого варианта.';
  if (s.campaign.ending) return 'Кампания завершена.';
  return null;
}

export function applyStoryChoice(s: GameState, shift: number, optionId: string, post: Post, log: Log, auto = false) {
  const n = storyNode(shift)!;
  const o = n.options!.find((x) => x.id === optionId)!;
  s.campaign.choices[String(shift)] = o.id;
  for (const f of o.flags ?? []) setFlag(s, f);
  if (o.effects) {
    const anyCase = caseDef('c1')!;
    applyEffect(s, { ...anyCase, templateId: '' }, o.effects, post, `Кампания: ${n.title}`);
  }
  if (o.closeCase) {
    const f = caseFile(s, o.closeCase.caseId);
    if (f && f.status === 'open') {
      f.tasks = [];
      concludeCase(s, o.closeCase.caseId, o.closeCase.conclusionId, undefined, post, log);
    }
  }
  log('story_choice', `«${n.title}»: ${auto ? 'решение не принято — ' : ''}${o.label.toLowerCase()}.`);
}

/** Не ответил до конца смены — значит, отказался (предложения не ждут). */
export function settleStoryShift(s: GameState, post: Post, log: Log) {
  const n = storyNode(s.shift);
  if (!n?.options?.length || s.campaign.choices[String(s.shift)]) return;
  const refuse = n.options.find((o) => o.id === 'refuse') ?? n.options[n.options.length - 1]!;
  applyStoryChoice(s, s.shift, refuse.id, post, log, true);
}

/** Итог кампании (сценарий §8). Скрытая логика; игроку показывается только сам финал и его цена. */
export function computeEnding(s: GameState): { id: EndingId; reasons: string[] } {
  const reasons: string[] = [];
  let bad = 0;
  const op2 = opState(s, 'op2');
  if (hasFlag(s, 'c3_crisis_failed') || !op2) { bad += 2; reasons.push('кризис в лаборатории не удержан силами дирекции'); }
  else if (op2.report?.outcome === 'failure') { bad += 1; reasons.push('операция в лаборатории провалена'); }
  if (hasFlag(s, 'c3_mirrors_conflict')) { bad += 2; reasons.push('конфликт с Палатой Зеркал'); }
  const v = s.politics.violations.length;
  if (v >= 2) { bad += v >= 4 ? 2 : 1; reasons.push(`нарушений по проверкам: ${v}`); }
  const revealed = s.investigations.cases.filter((f) => f.revealed).length;
  if (revealed) { bad += revealed; reasons.push(`ошибочных или замятых решений вскрылось: ${revealed}`); }
  if (hasFlag(s, 'c2_ledger_lost') && hasFlag(s, 'c3_sample_lost')) { bad += 1; reasons.push('цепочка доказательств уничтожена'); }

  const strong = s.investigations.cases.filter((f) => caseStrong(f)).length;
  const c3 = caseFile(s, 'c3');
  const e07 = c3 ? resolveRef(s, 'c3', 'e07').ev : undefined;
  const proof = hasFlag(s, 'c3_sample_admissible') || (!!e07 && (e07.analysis === 'confirmed') && !e07.questionable) || (!!c3 && c3.expertiseBonus > 0 && !!e07);
  if (bad >= 3 || (bad >= 2 && strong === 0)) return { id: 'collapse', reasons };
  if (strong >= 2 && proof && !hasFlag(s, 'campaign_closed_compact')) {
    reasons.push(`доказательные решения по делам: ${strong}`);
    return { id: 'order', reasons };
  }
  if (hasFlag(s, 'campaign_closed_compact')) reasons.push('закрытые договорённости с Домами');
  if (strong < 2) reasons.push('доказательная база по делам неполна');
  if (!proof) reasons.push('нет допустимого доказательства подмены в лаборатории');
  return { id: 'cost', reasons };
}

/** Конец последней смены — финал кампании. */
export function finishCampaign(s: GameState, log: Log) {
  if (s.shift < CAMPAIGN.lastShift || s.campaign.ending) return;
  const e = computeEnding(s);
  s.campaign.ending = e.id;
  log('campaign_ending', `${CAMPAIGN.title}: финал «${CAMPAIGN.endings[e.id].title}».`);
}

/** Для экрана «Кампания»: прошедшие и текущий узлы (будущие не раскрываются). */
export const visibleNodes = (s: GameState) => CAMPAIGN.nodes.filter((n) => n.shift <= s.shift);
export const opsInWindow = (s: GameState) => SPECIAL_OPS.filter((o) => s.shift >= o.fromShift && s.shift <= o.toShift && !opState(s, o.id));
export const evidenceTitle = (caseId: string, id: string) => evidenceDef(caseDef(caseId)!, id)?.title ?? id;
