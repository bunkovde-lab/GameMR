import { dutyEffect, type DutyEffect } from '../../core/sandbox';
import { DUTY_RESPONSE_LABEL, dutyTemplateFor, dutyTacticGuidance } from '../../core/content';
import type { Incident, TacticId } from '../../core/types';
import './duty.css';

const TACTIC_ORDER: TacticId[] = ['recon', 'arrest', 'suppression', 'quarantine'];
const signed = (v: number) => v > 0 ? `+${v}` : `${v}`;
function effectText(e: DutyEffect): string {
  return [
    e.rewardRe ? `награда ${e.rewardRe} РЕ` : 'без награды',
    e.order ? `порядок ${signed(e.order)}` : '',
    e.legitimacy ? `легитимность ${signed(e.legitimacy)}` : '',
    e.readiness ? `боеспособность ${signed(e.readiness)}` : '',
  ].filter(Boolean).join(' · ');
}

/** Синяя карточка обычного вызова: все внешние последствия известны до решения. */
export function DutyBrief({ inc, left, testId = 'duty-brief' }: { inc: Incident; left?: number; testId?: string }) {
  if (!inc.duty) return null;
  const def = dutyTemplateFor(inc)!;
  const proportional = TACTIC_ORDER
    .map((id) => dutyTacticGuidance(inc, id))
    .filter((g) => g?.fit === 'recommended')
    .map((g) => g!.label);
  return (
    <section className={`duty-brief${inc.duty.urgent ? ' urgent' : ''}`} data-testid={testId}>
      <div className="duty-brief-head">
        <span className="tag duty-tag">{inc.duty.urgent ? 'Срочный дежурный вызов' : 'Дежурный вызов'}</span>
        <span className="tag">{def.label}</span>
      </div>
      <p><b>К расследованию не относится.</b> Не даёт обязательных улик и не меняет ветви дела.</p>
      <p>{def.description}</p>
      <p><b>Чем опасно.</b> {def.threat}</p>
      <p><b>Задача отряда.</b> {def.objective}</p>
      <dl>
        {left !== undefined && <><dt>Срок решения</dt><dd>{Math.max(0, left)} мин</dd></>}
        <dt>{DUTY_RESPONSE_LABEL.recommended}</dt><dd className="good" data-testid={`${testId}-response`}>{proportional.join(' · ')}</dd>
        <dt>Санкции</dt><dd>Ордер и специальный допуск не требуются.</dd>
        <dt>Риск выезда</dt><dd>{inc.duty.urgent ? 'повышенный: возможны ранения и частичный результат' : 'зависит от выбранной тактики, состава и снаряжения'}</dd>
        <dt>Успех отряда</dt><dd className="good">{effectText(dutyEffect(inc, 'success'))}</dd>
        <dt>Частичный итог</dt><dd>{effectText(dutyEffect(inc, 'partial'))}</dd>
        <dt>Неудача отряда</dt><dd className="warn">{effectText(dutyEffect(inc, 'failure'))}</dd>
        <dt>Передать наряду</dt><dd>{effectText(dutyEffect(inc, 'patrol'))} · отряд свободен, опыта нет</dd>
        <dt>Не вмешиваться</dt><dd className="warn">{effectText(dutyEffect(inc, 'ignore'))} · немедленного поражения нет</dd>
      </dl>
    </section>
  );
}
