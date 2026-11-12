import { houseText, lateKind, publicAftermath, templateOf } from '../../core/events';
import { isOpen } from '../../core/selectors';
import { INCIDENT_STATE_LABEL, SEVERITY_LABEL } from '../labels';
import { AftermathList, IncidentHero } from '../shell/IncidentArt';
import { useEffect, useMemo, useState } from 'react';
import { DISPATCH_COST, ROLE_LABEL } from '../../core/content';
import {
  DISPATCH_RULES, EQUIPMENT_TYPES, TACTICS, bestCommander, civilianRiskWord, defaultDraft, equipmentType, forecastWord,
  incidentProfile, memberBlocker, planDispatch, tacticBlocker, tacticById, type DispatchDraft,
} from '../../core/dispatch';
import { buildRoute, etaMinutes } from '../../core/map/graph';
import { districtById } from '../../core/map/mapConfig';
import { formatRe } from '../../core/selectors';
import type { GameState, TacticId } from '../../core/types';
import { dispatch } from '../../store';
import { Modal } from '../Modal';
import { Portrait } from '../Portrait';
import { groupMods } from '../../core/career';
import { SQUAD_STATUS } from '../labels';
import { SquadMember, memberSummary } from '../shell/SquadStrip';
import { PERMIT_NAME, POLITICS, emergencyRisk, legalRequirement, permitBlocker, requestBlocker, riskWord } from '../../core/politics';
import { SANDBOX_GOAL_LABEL, sandboxEventFor, sandboxGoalFor } from '../../core/sandbox';
import { DutyBrief } from '../shell/DutyBrief';

interface Props {
  game: GameState;
  incidentId: string;
  initialSquadId: string | null;
  onClose: () => void;
  onPreview: (squadId: string | null) => void;
}

type Mode = 'quick' | 'manual';
const pct = (v: number) => `${Math.round(v * 100)}%`;

/**
 * W4 (UI-03/UI-04): быстрая отправка и ручная настройка. Оба режима правят один черновик,
 * поэтому переключение не сбрасывает состав и тактику (ТЗ §6.2). Расчёт — planDispatch ядра.
 */
export function DispatchDialog({ game, incidentId, initialSquadId, onClose, onPreview }: Props) {
  const inc = game.incidents.find((i) => i.id === incidentId);
  const [mode, setMode] = useState<Mode>('quick');
  const [draft, setDraft] = useState<DispatchDraft | null>(() => (initialSquadId ? defaultDraft(game, initialSquadId, incidentId) : null));

  useEffect(() => { onPreview(draft?.squadId ?? null); }, [draft?.squadId, onPreview]);
  useEffect(() => () => onPreview(null), [onPreview]);

  const plan = useMemo(() => (draft ? planDispatch(game, draft) : null), [game, draft]);
  if (!inc) return null;
  const prof = incidentProfile(inc);
  const groupNotes = draft ? groupMods(game, draft.memberIds, draft.commanderId, draft.tactic, prof.tags).notes : [];
  const district = districtById(inc.districtId)!;
  const cls = DISPATCH_RULES.classes[prof.incidentClass];
  const active = game.phase === 'ACTIVE';
  const left = inc.deadlineMinute - game.minute;

  const pickSquad = (squadId: string) => {
    if (mode === 'quick' || !draft) setDraft(defaultDraft(game, squadId, incidentId));
    else setDraft({ ...draft, squadId });
  };
  const setTactic = (tactic: TacticId) => draft && setDraft({ ...draft, tactic });
  const toggleMember = (id: string) => {
    if (!draft) return;
    const memberIds = draft.memberIds.includes(id) ? draft.memberIds.filter((x) => x !== id) : [...draft.memberIds, id];
    const commanderId = memberIds.includes(draft.commanderId) ? draft.commanderId : bestCommander(game, memberIds);
    setDraft({ ...draft, memberIds, commanderId });
  };
  const addGear = (typeId: string) => {
    if (!draft) return;
    const unit = game.equipment.find((e) => e.typeId === typeId && e.state === 'available' && !draft.equipmentIds.includes(e.id));
    if (unit) setDraft({ ...draft, equipmentIds: [...draft.equipmentIds, unit.id] });
  };
  const removeGear = (typeId: string) => {
    if (!draft) return;
    const ids = [...draft.equipmentIds];
    const i = ids.map((id) => game.equipment.find((e) => e.id === id)?.typeId).lastIndexOf(typeId);
    if (i >= 0) ids.splice(i, 1);
    setDraft({ ...draft, equipmentIds: ids });
  };
  const send = () => {
    if (!draft || !plan || plan.blockers.length || !active) return;
    if (dispatch({ type: 'DISPATCH_SQUAD', ...draft })) onClose();
  };

  const blockers = plan ? [...(active ? [] : ['Отправка доступна после начала смены.']), ...plan.blockers] : [];
  const tactic = draft ? tacticById(draft.tactic) : null;
  const nameOf = (id: string) => game.staff.find((p) => p.id === id)?.name ?? id;

  return (
    <Modal
      title="Отправка отряда"
      subtitle={`${inc.title} · ${district.name}`}
      onClose={onClose}
      testId="dispatch-dialog"
      className="wide"
      footer={
        <>
 {plan && (
            <p className="footer-forecast" data-testid="footer-forecast">
              <b>{forecastWord(plan.forecast)}</b> {Math.round(plan.forecast.low * 100)}–{pct(plan.forecast.high)}
              {plan.eta !== null && ` · ≈${plan.eta} мин`} · риск {plan.risk}
            </p>
          )}
          {blockers.length > 0 && <p className="dispatch-blocker" data-testid="dispatch-blockers" role="status">{blockers[0]}</p>}
          <button className="btn" onClick={onClose}>Отмена</button>
          <button className="btn primary" onClick={send} disabled={!plan || blockers.length > 0} data-testid="confirm-dispatch">
            Отправить · {formatRe(DISPATCH_COST)} РЕ
          </button>
        </>
      }
    >
      {/* Сведения о происшествии — те же, что в карточке на карте: картинка, описание, что на кону, состояние, таймер. */}
      <section className="dispatch-brief" data-testid="dispatch-incident" aria-label="Происшествие">
        <IncidentHero inc={inc} />
        <div className="dispatch-brief-text">
          <dl className="chips">
            <div><dt>Состояние</dt><dd data-testid="dispatch-state">{INCIDENT_STATE_LABEL[inc.state]}</dd></div>
            {['new', 'acknowledged'].includes(inc.state) && (
              <div className={left <= 15 ? 'urgent' : undefined}><dt>До ухудшения</dt><dd data-testid="dispatch-timer">{Math.max(0, left)} мин</dd></div>
            )}
            <div><dt>Угроза</dt><dd className={`sev-text sev-${inc.severity}`}>{SEVERITY_LABEL[inc.severity]}</dd></div>
            <div><dt>Класс</dt><dd data-testid="incident-class" title={cls.hint}>{cls.label}</dd></div>
            <div><dt>Нужны роли</dt><dd>{prof.requiredRoles.map((r) => ROLE_LABEL[r]).join(', ') || '—'}</dd></div>
            {game.paused && active && <div className="paused-chip" data-testid="dispatch-paused"><dt>⏸</dt><dd>Пауза, пока окно открыто</dd></div>}
          </dl>
          {prof.known && !inc.duty && <p className="known" data-testid="dispatch-known">{houseText(prof.known)}</p>}
          {inc.sandbox && (() => {
            const def = sandboxEventFor(inc)!;
            const goal = sandboxGoalFor(inc)!;
            const purpose = inc.sandbox!.fallback ? def.fallbackPurpose ?? def.purpose : def.purpose;
            return (
              <section className="sandbox-event-brief" data-testid="dispatch-sandbox-goal">
                <span className="tag good">Цель: {SANDBOX_GOAL_LABEL[goal]}</span>
                <p><b>Цель выезда.</b> {purpose}</p>
                <p><b>Успех.</b> {def.successText}</p>
                <p><b>Провал.</b> {def.failureText} Откроется альтернативная ветвь, а не перезапуск дела.</p>
                <small className="muted">Тактику ниже выбираете отдельно: она определяет, как отряд выполнит эту цель.</small>
              </section>
            );
          })()}
          <DutyBrief inc={inc} left={left} testId="dispatch-duty-brief" />
          {(() => {
            if (inc.sandbox || inc.duty) return null;
            const t = templateOf(inc);
            const stakes = publicAftermath(t);
            const late = t?.lateText;
            if (!late && !stakes.length) return null;
            const word = { escalate: 'Если опоздать, обострится', expire: 'Если опоздать, исчезнет', branch: 'Если опоздать, станет другим событием' }[lateKind(inc)];
            return (
              <div className="stakes" data-testid="dispatch-stakes">
                {late && isOpen(inc) && <p className="late"><b>{word}:</b> {houseText(late)}</p>}
                {stakes.length > 0 && <AftermathList items={stakes} />}
              </div>
            );
          })()}
        </div>
      </section>

      <div className="tabs" role="tablist" aria-label="Режим формирования">
        <button role="tab" className="btn" aria-selected={mode === 'quick'} aria-pressed={mode === 'quick'} onClick={() => setMode('quick')} data-testid="mode-quick">Быстрая отправка</button>
        <button role="tab" className="btn" aria-selected={mode === 'manual'} aria-pressed={mode === 'manual'} onClick={() => setMode('manual')} disabled={!draft} data-testid="mode-manual" title={draft ? undefined : 'Сначала выберите отряд'}>Ручная настройка</button>
      </div>

      <div className="dispatch-grid">
        <div className="dispatch-main">
          <h4 className="section-title">{mode === 'quick' ? 'Готовые отряды' : 'Машина и база'}</h4>
          <ul className="pick-list">
            {game.squads.map((q) => {
              const r = q.status === 'ready' ? buildRoute(q.currentNodeId, district.serviceNode, game.roadClosures) : null;
              const fit = q.memberIds.filter((id) => !memberBlocker(game, id, q.id)).length;
              const why = q.status !== 'ready' ? SQUAD_STATUS[q.status].label : !r ? 'нет маршрута' : null;
              const members = q.memberIds.map((id) => game.staff.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => !!p);
              return (
                <li key={q.id}>
                  <button className="btn pick squad-pick" aria-pressed={draft?.squadId === q.id} disabled={!!why} onClick={() => pickSquad(q.id)} data-testid={`pick-${q.id}`}>
                    <span className={`monogram banner-${q.id}`} aria-hidden="true" />
                    <span className="squad-pick-text">
                      <b>«{q.name}»</b>
                      <small>{why ?? `${fit} чел. · ≈${etaMinutes(r!, 0)} мин`}</small>
                    </span>
                    <span className="squad-members" data-testid={`pick-members-${q.id}`}>
                      {members.map((p) => <SquadMember key={p.id} p={p} testPrefix="pick-member" />)}
                    </span>
                    <span className="visually-hidden">. Состав: {members.length ? members.map(memberSummary).join('; ') : 'нет бойцов'}.</span>
                  </button>
                </li>
              );
            })}
          </ul>

          {mode === 'manual' && draft && (
            <>
              <h4 className="section-title">Состав (до {DISPATCH_RULES.squad.maxMembers})</h4>
              <ul className="pick-list people">
                {game.staff.filter((p) => p.health !== 'dead').map((p) => {
                  const chosen = draft.memberIds.includes(p.id);
                  const why = memberBlocker(game, p.id, draft.squadId);
                  const full = !chosen && draft.memberIds.length >= DISPATCH_RULES.squad.maxMembers;
                  const home = game.squads.find((q) => q.memberIds.includes(p.id));
                  return (
                    <li key={p.id}>
                      <button className="btn pick with-face" aria-pressed={chosen} disabled={!chosen && (!!why || full)} onClick={() => toggleMember(p.id)} data-testid={`member-${p.id}`}>
                        <Portrait id={p.id} name={p.name} health={p.health} size="sm" />
                        <span className="pick-text">
                          <b>{p.name}</b>
                          <small>{ROLE_LABEL[p.role]} · ранг {p.rank} · усталость {p.fatigue}{home ? ` · «${home.name}»` : ' · резерв'}{why ? ` — ${why}` : ''}</small>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {draft.memberIds.length > 0 && (
                <>
                  <h4 className="section-title">Командир</h4>
                  <div className="seg">
                    {draft.memberIds.map((id) => (
                      <button key={id} className="btn" aria-pressed={draft.commanderId === id} onClick={() => setDraft({ ...draft, commanderId: id })} data-testid={`commander-${id}`}>{nameOf(id)}</button>
                    ))}
                  </div>
                </>
              )}
              <h4 className="section-title">Снаряжение (до {DISPATCH_RULES.squad.maxEquipment})</h4>
              <ul className="gear-list">
                {EQUIPMENT_TYPES.map((t) => {
                  const taken = draft.equipmentIds.filter((id) => game.equipment.find((e) => e.id === id)?.typeId === t.id).length;
                  const free = game.equipment.filter((e) => e.typeId === t.id && e.state === 'available').length - taken;
                  const relevant = t.tags.some((x) => prof.tags.includes(x));
                  return (
                    <li key={t.id} className={relevant ? 'relevant' : ''}>
                      <span><b>{t.label}</b><small>{t.consumable ? 'расходник' : 'многоразовое'} · на складе {free}{relevant ? ' · подходит' : ''}</small></span>
                      <button className="btn icon-only" onClick={() => removeGear(t.id)} disabled={!taken} aria-label={`Убрать: ${t.label}`} data-testid={`gear-remove-${t.id}`}>−</button>
                      <output data-testid={`gear-count-${t.id}`}>{taken}</output>
                      <button className="btn icon-only" onClick={() => addGear(t.id)} disabled={free <= 0 || draft.equipmentIds.length >= DISPATCH_RULES.squad.maxEquipment} aria-label={`Добавить: ${t.label}`} data-testid={`gear-add-${t.id}`}>+</button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {draft && (
            <>
              <h4 className="section-title">Тактика</h4>
              <ul className="pick-list tactics">
                {TACTICS.map((t) => {
                  const why = tacticBlocker(game, t.id, draft.memberIds, draft.equipmentIds);
                  const legal = permitBlocker(game, incidentId, t.id) ? legalRequirement(inc, t.id) : null;
                  return (
                    <li key={t.id}>
                      <button className="btn pick" aria-pressed={draft.tactic === t.id} disabled={!!why} onClick={() => setTactic(t.id)} data-testid={`tactic-${t.id}`}>
                        <b>{t.label}</b>
                        <small>{why ?? `риск для группы: ${['низкий', 'низкий', 'средний', 'высокий'][t.squadRisk]}`}{!why && legal ? ` · нужно ${PERMIT_NAME[legal.permit]}` : ''}</small>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {tactic && (
                <p className="hint" data-testid="tactic-effects">
                  На месте +{tactic.sceneMinutes} мин · риск для горожан: {civilianRiskWord(tactic.id)} · улики {tactic.evidence} · {tactic.escape}.
                </p>
              )}
              {tactic && permitBlocker(game, incidentId, tactic.id) && (() => {
                const req = legalRequirement(inc, tactic.id)!;
                const reqWhy = requestBlocker(game, incidentId, req.permit);
                const E = POLITICS.permits.emergency;
                return (
                  <div className="legal-box" data-testid="legal-box">
                    <p><b>Нужно {PERMIT_NAME[req.permit]}.</b> {req.why}</p>
                    <div className="row-actions wrap">
                      <button className="btn" disabled={!!reqWhy} onClick={() => dispatch({ type: 'REQUEST_PERMIT', incidentId, kind: req.permit })} data-testid="dispatch-request-permit">
                        Запросить {req.permit === 'judicial' ? 'ордер' : 'допуск'} · ≈{POLITICS.permits[req.permit].reviewMinutes} мин
                      </button>
                      <button className="btn" aria-pressed={!!draft.emergency} onClick={() => setDraft({ ...draft, emergency: !draft.emergency })} data-testid="toggle-emergency">
                        {draft.emergency ? '✓ ' : ''}Чрезвычайное основание
                      </button>
                    </div>
                    {reqWhy && <small className="why">{reqWhy}</small>}
                    <small className="muted">Чрезвычайное основание: решение записывается на руководителя, проверка в начале смены {game.shift + 1}, риск признания нарушением {riskWord(emergencyRisk(game, inc))}. При нарушении штраф {E.fine} РЕ, суд строже к следующим запросам.</small>
                  </div>
                );
              })()}
            </>
          )}
        </div>

        <aside className="dispatch-summary" aria-label="Прогноз выезда">
          {!plan || !draft ? (
            <p className="empty">Выберите готовый отряд. Прогноз и маршрут появятся здесь.</p>
          ) : (
            <>
              <div className="forecast" data-testid="forecast">
                <b>{forecastWord(plan.forecast)}</b>
                <span>{Math.round(plan.forecast.low * 100)}–{pct(plan.forecast.high)}</span>
              </div>
              <p className="hint">Оценка по известным сведениям. Чем лучше разведка, тем уже диапазон. Успех не исключает ранений.</p>
              <dl className="kv">
                <dt>Прибытие</dt><dd data-testid="dispatch-eta">{plan.eta !== null ? `≈${plan.eta} мин` : '—'}</dd>
                <dt>Риск для группы</dt><dd data-testid="dispatch-risk">{plan.risk}</dd>
                <dt>Командир</dt><dd>{draft.commanderId ? nameOf(draft.commanderId) : '—'}</dd>
                <dt>Состав</dt><dd data-testid="dispatch-members">{draft.memberIds.map(nameOf).join(', ') || '—'}</dd>
                <dt>Снаряжение</dt><dd data-testid="dispatch-gear">{draft.equipmentIds.map((id) => equipmentType(game.equipment.find((e) => e.id === id)?.typeId ?? '')?.label).join(', ') || 'нет'}</dd>
                <dt>Стоимость</dt><dd>{formatRe(DISPATCH_COST)} РЕ</dd>
              </dl>
              {groupNotes.length > 0 && (
                <ul className="plain-list group-notes" data-testid="group-notes">
                  {groupNotes.map((n) => <li key={n}>{n}</li>)}
                </ul>
              )}
              {plan.missingRoles.length > 0 && <p className="warn" data-testid="missing-roles">Нет в группе: {plan.missingRoles.join(', ')}. Прогноз снижен.</p>}
            </>
          )}
        </aside>
      </div>
    </Modal>
  );
}
