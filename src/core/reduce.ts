import { BALANCE, DISPATCH_COST, toCents } from './content';
import { setFlag } from './flags';
import { bestCommander, defaultDraft, equipmentType, forecastTerms, planDispatch, recommendedTactic, riskLevel, tacticById, type DispatchDraft } from './dispatch';
import { applyOption, beginScene, finishReturn, pendingDecision, tickScene } from './operations';
import { HEALTH_LOG } from './healthText';
import {
  admitPatient, advanceMedical, completeChecks, hireCandidate, patientOf, refreshCandidates, squadOf, treatmentForecast, vacancies, PLANS,
} from './staff';
import { ROLE_LABEL } from './content';
import { RESEARCH, advanceResearch, fabricateBlocker, isRunning, makeProject, projectDef, refreshResearch, startBlocker } from './research';
import {
  SUBSIDY, advanceConstruction, courseShiftsCut, earlyWarning, facilityDef, makeBuild, refreshQueue, repairEquipment, upgradeBlocker, upkeepPerShift,
} from './facilities';
import {
  RANK_NAMES, advanceTraining, applyOperationToRelations, courseBlocker, hasEffect, nodeById, organBlocker, organById, promotionStatus, salaryStep,
} from './career';
import {
  POLITICS, acceptBlocker, acceptDeal, advancePolitics, breakDeal, checkDeals, dealDef, decidePermits, houseById, legalRequirement, makePermit,
  needsEmergency, permitFor, requestBlocker,
} from './politics';
import {
  actionBlocker, actionDef, advanceInvestigations, advanceInvestigationsShift, analysisBlocker, caseDef, caseFile, casePermitBlocker, concludeBlocker,
  concludeCase, decideCasePermits, evidenceDef, expertiseBlocker, hasPair, interrogationBlocker, linkBlocker, makeCasePermit, openCaseFromReport,
  pairBlocker, personDef, requestExpertise, startAction, startAnalysis, startInterrogation, METHOD_LABEL,
} from './investigations';
import { RANDOM_POOL, lateKind, outcomeFlags, templateOf } from './events';
import { applyStoryChoice, beginStoryShift, finishCampaign, settleStoryShift, storyChoiceBlocker } from './campaign';
import { activeOp, advanceOps, chooseOpOption, opDef, optionBlocker, startOp, startOpBlocker } from './specialOps';
import { buildRoute, shortestPath } from './map/graph';
import { districtById, edgeById, spawnPosition } from './map/mapConfig';
import { nextInt } from './rng';
import { isAway, leaveSquad, returnHome } from './squadHome';
import {
  acknowledgeSandboxResult, advanceSandboxMinute, buySandboxSquad, concludeSandboxCase, expireSandboxIncident,
  resolveSandboxOperation, startSandboxFieldAction,
} from './sandbox';
import { DEPLOYED, aliveStaff, citySafety, isOpen } from './selectors';
import type { Command, CommandResult, GameState, Incident, Squad, Transaction, TransactionKind } from './types';

/**
 * Единственная точка изменения игрового состояния: nextState = reduce(state, command).
 * Чистая функция: не читает время, DOM и Math.random; случайность только через state.rng.
 * Неверная команда не меняет состояние и возвращает причину (ТЗ §5.3).
 */
const BALANCE_REST = 30;
const STAFF_CHECK_COST = 1;

export function reduce(state: GameState, command: Command): CommandResult {
  const s: GameState = structuredClone(state);
  const reject = (reason: string): CommandResult => ({ ok: false, state, reason });

  switch (command.type) {
    case 'START_SHIFT': {
      if (s.phase !== 'BRIEFING') return reject('Смена уже идёт.');
      s.phase = 'ACTIVE';
      s.paused = false;
      log(s, 'shift_started', `Смена ${s.shift} началась.`);
      return { ok: true, state: s };
    }

    case 'PAUSE':
    case 'RESUME': {
      if (s.phase !== 'ACTIVE') return reject('Время идёт только во время активной смены.');
      if (command.type === 'RESUME' && s.sandbox?.defeatReason) return reject('Сценарий завершён. Начните новую песочницу.');
      s.paused = command.type === 'PAUSE';
      return { ok: true, state: s };
    }

    case 'SET_SPEED': {
      if (![1, 2, 4].includes(command.speed)) return reject('Недопустимая скорость.');
      s.speed = command.speed;
      return { ok: true, state: s };
    }

    case 'TICK': {
      if (s.phase !== 'ACTIVE' || s.paused) return reject('Время остановлено.');
      if (s.sandbox?.defeatReason) return reject('Сценарий завершён.');
      if (!Number.isInteger(command.minutes) || command.minutes < 1) return reject('Некорректный шаг времени.');
      if (pendingDecision(s)) return reject('Ожидается решение по операции.');
      if (activeOp(s)) return reject(`Идёт особая операция «${opDef(activeOp(s)!.id)!.title}»: примите решение.`);
      // Новый вызов ставит игру на паузу (s.paused) — оставшиеся минуты этого шага не идут.
      for (let i = 0; i < command.minutes && s.phase === 'ACTIVE' && !s.paused && !pendingDecision(s); i++) advanceMinute(s);
      returnHome(s, staffLog(s));
      return { ok: true, state: s };
    }
    case 'CHOOSE_OPTION': {
      const pending = pendingDecision(s);
      if (!pending || pending.squad.id !== command.squadId) return reject('Сейчас нет решения для этого отряда.');
      const option = pending.stage.options.find((o) => o.id === command.optionId);
      if (!option) return reject('Такого варианта нет.');
      applyOption(s, pending.squad, option, pending.stage);
      log(s, 'operation_decision', `«${pending.squad.name}», ${pending.incident.title}: ${option.label.toLowerCase()}.`);
      return { ok: true, state: s };
    }
    case 'ACK_OPERATION_REPORT': {
      const r = s.operationReports.find((x) => x.id === command.reportId);
      if (!r) return reject('Отчёт не найден.');
      r.seen = true;
      return { ok: true, state: s };
    }

    case 'ACKNOWLEDGE_INCIDENT': {
      const inc = s.incidents.find((i) => i.id === command.incidentId);
      if (!inc) return reject('Происшествие не найдено.');
      if (inc.state !== 'new') return reject('Вызов уже принят или закрыт.');
      inc.state = 'acknowledged';
      log(s, 'incident_acknowledged', `Вызов принят: ${inc.title}.`);
      return { ok: true, state: s };
    }

    case 'ASSIGN_STAFF': {
      const person = s.staff.find((p) => p.id === command.staffId);
      const target = s.squads.find((q) => q.id === command.squadId);
      if (!person) return reject('Сотрудник не найден.');
      if (!target) return reject('Отряд не найден.');
      if (['dead', 'missing', 'critical', 'serious_injury'].includes(person.health))
        return reject(`${person.name} не допущен(а) к службе по состоянию.`);
      const current = s.squads.find((q) => q.memberIds.includes(person.id));
      if (current?.id === target.id) return reject(`${person.name} уже в отряде «${target.name}».`);
      if (current && DEPLOYED.includes(current.status))
        return reject(`${person.name} на задании в отряде «${current.name}»; перевод после возвращения.`);
      if (DEPLOYED.includes(target.status)) return reject(`Отряд «${target.name}» на задании.`);
      if (target.memberIds.length >= BALANCE.squad.maxMembers)
        return reject(`В отряде «${target.name}» нет свободных мест.`);
      if (current) current.memberIds = current.memberIds.filter((id) => id !== person.id);
      target.memberIds.push(person.id);
      person.home = null;
      log(s, 'staff_transferred', `${person.name} переведён(а) в отряд «${target.name}».`, [person.id]);
      return { ok: true, state: s };
    }

    case 'DISPATCH_SQUAD': {
      const sq = s.squads.find((q) => q.id === command.squadId);
      const inc = s.incidents.find((i) => i.id === command.incidentId);
      if (!sq) return reject('Отряд не найден.');
      if (!inc) return reject('Происшествие не найдено.');
      if (s.phase !== 'ACTIVE' && s.phase !== 'BRIEFING') return reject('Отправка возможна только во время смены.');
      const check = dispatchBlocker(s, sq, inc);
      if (check) return reject(check);
      const base = defaultDraft(s, sq.id, inc.id);
      const memberIds = command.memberIds ?? base.memberIds;
      const equipmentIds = command.equipmentIds ?? base.equipmentIds;
      const draft: DispatchDraft = {
        squadId: sq.id,
        incidentId: inc.id,
        memberIds,
        equipmentIds,
        commanderId: command.commanderId ?? (command.memberIds ? bestCommander(s, memberIds) : base.commanderId),
        tactic: command.tactic ?? (command.memberIds || command.equipmentIds ? recommendedTactic(s, { ...base, memberIds, equipmentIds }) : base.tactic),
        emergency: command.emergency,
      };
      const plan = planDispatch(s, draft);
      if (plan.blockers.length) return reject(plan.blockers[0]!);
      const route = plan.route!;
      // W8: документ для тактики — использовать выданный или зафиксировать чрезвычайное основание.
      const req = legalRequirement(inc, draft.tactic);
      if (req) {
        const doc = permitFor(s, inc.id, req.permit);
        if (doc) { doc.status = 'used'; doc.note = `Использовано: выезд «${sq.name}».`; }
        else if (needsEmergency(s, inc.id, draft.tactic)) {
          const p = makePermit(s, inc, 'emergency', draft.tactic);
          p.note = `Выезд «${sq.name}», тактика «${tacticById(draft.tactic).label}». Проверка в смене ${p.reviewShift}.`;
          s.politics.permits.push(p);
          log(s, 'emergency_authority', `Чрезвычайное основание: ${inc.title}. Ответственный — руководитель дирекции; проверка в начале смены ${p.reviewShift}.`);
        }
      }
      const cohesion = forecastTerms(s, draft).C;
      // Ручной состав: выбранные переходят в этот отряд, не поехавшие остаются в резерве без отряда.
      // Кто не поехал из-за ранения, лечения или учёбы — помнит своё место и вернётся сам.
      for (const id of [...sq.memberIds]) {
        const p = s.staff.find((x) => x.id === id);
        if (p && !memberIds.includes(id) && isAway(s, id, sq.id)) leaveSquad(p, sq);
      }
      for (const q of s.squads) if (q.id !== sq.id) q.memberIds = q.memberIds.filter((id) => !memberIds.includes(id));
      sq.memberIds = [...memberIds];
      for (const id of equipmentIds) {
        const u = s.equipment.find((e) => e.id === id)!;
        u.state = 'deployed';
        u.squadId = sq.id;
      }
      sq.status = 'en_route';
      sq.assignedIncidentId = inc.id;
      sq.movement = { route, elapsed: 0, destinationIncidentId: inc.id, aborted: false };
      sq.operation = {
        incidentId: inc.id, tactic: draft.tactic, commanderId: draft.commanderId, equipmentIds: [...equipmentIds], cohesion, forecast: plan.forecast,
        riskLevel: riskLevel(s, draft), phase: 'travel', timer: 0, stageIndex: 0, pDelta: 0, riskDelta: 0, civil: 0, evidence: 0, decisions: [],
      };
      inc.state = 'en_route';
      post(s, 'dispatch', -DISPATCH_COST, `Выезд «${sq.name}»: ${inc.title}`);
      log(s, 'squad_dispatched', `Отряд «${sq.name}» направлен: ${inc.title}. Тактика: ${tacticById(draft.tactic).label.toLowerCase()}. Прибытие ≈${Math.ceil(route.totalMinutes)} мин.`, memberIds);
      return { ok: true, state: s };
    }
    case 'SET_ROAD_ENABLED': {
      if (!edgeById(command.edgeId)) return reject('Дорога не найдена.');
      const closed = s.roadClosures.includes(command.edgeId);
      if (closed === !command.enabled) return reject('Состояние дороги не изменилось.');
      s.roadClosures = command.enabled ? s.roadClosures.filter((e) => e !== command.edgeId) : [...s.roadClosures, command.edgeId].sort();
      log(s, command.enabled ? 'road_opened' : 'road_closed', `${command.enabled ? 'Открыта' : 'Перекрыта'} дорога ${command.edgeId}.`);
      for (const sq of s.squads) if (sq.movement && !sq.movement.aborted) reroute(s, sq);
      return { ok: true, state: s };
    }

    case 'UNASSIGN_STAFF': {
      const person = s.staff.find((p) => p.id === command.staffId);
      if (!person) return reject('Сотрудник не найден.');
      const sq = squadOf(s, person.id);
      if (!sq) return reject(`${person.name} уже в резерве.`);
      if (DEPLOYED.includes(sq.status)) return reject(`${person.name} на задании в отряде «${sq.name}»; перевод после возвращения.`);
      if (isAway(s, person.id, sq.id)) {
        leaveSquad(person, sq);
        log(s, 'staff_transferred', `${person.name} переведён(а) в резерв; вернётся в отряд «${sq.name}», когда будет годен(на).`, [person.id]);
        return { ok: true, state: s };
      }
      sq.memberIds = sq.memberIds.filter((id) => id !== person.id);
      if (sq.commanderId === person.id) sq.commanderId = null;
      person.home = null;
      log(s, 'staff_transferred', `${person.name} переведён(а) в резерв.`, [person.id]);
      return { ok: true, state: s };
    }
    case 'SWAP_STAFF': {
      const out = s.staff.find((p) => p.id === command.staffId);
      const inn = s.staff.find((p) => p.id === command.withId);
      if (!out || !inn) return reject('Сотрудник не найден.');
      const sq = squadOf(s, out.id);
      if (!sq) return reject(`${out.name} не входит в отряд.`);
      if (DEPLOYED.includes(sq.status)) return reject(`Отряд «${sq.name}» на задании; замена после возвращения.`);
      if (squadOf(s, inn.id)) return reject(`${inn.name} не в резерве.`);
      if (['dead', 'missing', 'critical', 'serious_injury'].includes(inn.health))
        return reject(`${inn.name} не допущен(а) к службе по состоянию.`);
      inn.home = null;
      if (isAway(s, out.id, sq.id)) {
        leaveSquad(out, sq, inn.id);
        log(s, 'staff_transferred', `${inn.name} подменяет ${out.name} в отряде «${sq.name}»; ${out.name} вернётся на своё место, когда будет годен(на).`, [out.id, inn.id]);
        return { ok: true, state: s };
      }
      sq.memberIds = sq.memberIds.map((id) => (id === out.id ? inn.id : id));
      if (sq.commanderId === out.id) sq.commanderId = null;
      out.home = null;
      log(s, 'staff_transferred', `${out.name} переведён(а) в резерв, ${inn.name} — в отряд «${sq.name}».`, [out.id, inn.id]);
      return { ok: true, state: s };
    }
    case 'SET_COMMANDER': {
      const sq = s.squads.find((q) => q.id === command.squadId);
      const person = s.staff.find((p) => p.id === command.staffId);
      if (!sq || !person) return reject('Отряд или сотрудник не найден.');
      if (!sq.memberIds.includes(person.id)) return reject(`${person.name} не входит в отряд «${sq.name}».`);
      if (DEPLOYED.includes(sq.status)) return reject(`Отряд «${sq.name}» на задании.`);
      sq.commanderId = person.id;
      log(s, 'commander_set', `${person.name} назначен(а) командиром отряда «${sq.name}».`, [person.id]);
      return { ok: true, state: s };
    }
    case 'START_TREATMENT': {
      if (!PLANS[command.plan]) return reject('Нет такого плана лечения.');
      const f = treatmentForecast(s, command.staffId, command.plan);
      if (f.blocker) return reject(f.blocker);
      const person = s.staff.find((p) => p.id === command.staffId)!;
      const pt = admitPatient(s, command.staffId, command.plan);
      if (pt.status === 'treating') post(s, 'treatment', -f.cost, `Лечение: ${person.name}`);
      log(s, pt.status === 'treating' ? 'treatment_started' : 'treatment_queued',
        `${person.name}: ${PLANS[command.plan].label.toLowerCase()} лечение${pt.status === 'queued' ? ', очередь на место' : ''}. Ожидаемое возвращение — смена ${f.returnShift}.`, [person.id]);
      return { ok: true, state: s };
    }
    case 'DEEP_CHECK': {
      const c = s.candidates.find((x) => x.id === command.candidateId);
      if (!c) return reject('Кандидат не найден.');
      if (c.check !== 'none') return reject('Проверка уже проведена или идёт.');
      const analyst = s.staff.some((p) => p.health !== 'dead' && !p.training && !patientOf(s, p.id) && hasEffect(p, 'cheap_check'));
      const cost = toCents(STAFF_CHECK_COST) / (analyst ? 2 : 1);
      if (s.economy.balance < cost) return reject('Недостаточно средств на проверку.');
      c.check = 'pending';
      post(s, 'check', -cost, `Проверка кандидата: ${c.name}`);
      log(s, 'candidate_check_started', `Начата проверка кандидата ${c.name}; результат к следующей смене.`);
      return { ok: true, state: s };
    }
    case 'HIRE': {
      const c = s.candidates.find((x) => x.id === command.candidateId);
      if (!c) return reject('Кандидат не найден.');
      if (vacancies(s)[c.role] <= 0) return reject(`Нет вакансии: ${ROLE_LABEL[c.role].toLowerCase()}.`);
      if (s.economy.balance < c.hireCost) return reject('Недостаточно средств на найм.');
      post(s, 'hiring', -c.hireCost, `Найм: ${c.name}`);
      const person = hireCandidate(s, c);
      log(s, 'staff_hired', `${person.name} принят(а) на службу (${ROLE_LABEL[person.role].toLowerCase()}), в резерве${person.adaptation ? `, адаптация ${person.adaptation} смен.` : '.'}`, [person.id]);
      return { ok: true, state: s };
    }
    case 'START_COURSE': {
      const why = courseBlocker(s, command.staffId, command.nodeId);
      if (why) return reject(why);
      const p = s.staff.find((x) => x.id === command.staffId)!;
      const n = nodeById(command.nodeId)!;
      const shifts = n.shifts > 1 ? Math.max(1, n.shifts - courseShiftsCut(s)) : n.shifts;
      p.training = { nodeId: n.id, shiftsLeft: shifts };
      const sq = squadOf(s, p.id);
      if (sq) leaveSquad(p, sq);
      post(s, 'training', -toCents(n.cost), `Курс «${n.label}»: ${p.name}`);
      log(s, 'course_started', `${p.name} направлен(а) на курс «${n.label}» (${shifts} смен.), выведен(а) в резерв.`, [p.id]);
      return { ok: true, state: s };
    }
    case 'PROMOTE': {
      const st = promotionStatus(s, command.staffId);
      if (!st) return reject('Повышение невозможно.');
      if (st.blocker) return reject(st.blocker);
      const p = s.staff.find((x) => x.id === command.staffId)!;
      post(s, 'promotion', -st.fee, `Аттестация: ${p.name}`);
      p.rank = st.next;
      p.salary += salaryStep();
      log(s, 'staff_promoted', `${p.name} аттестован(а): присвоен ранг ${RANK_NAMES[p.rank - 1]}.`, [p.id]);
      return { ok: true, state: s };
    }
    case 'INSTALL_ORGAN': {
      const why = organBlocker(s, command.staffId, command.organId);
      if (why) return reject(why);
      const p = s.staff.find((x) => x.id === command.staffId)!;
      const o = organById(command.organId)!;
      const sq = squadOf(s, p.id);
      if (sq) leaveSquad(p, sq);
      s.medical.patients.push({ staffId: p.id, plan: 'standard', status: 'treating', shiftsLeft: o.shifts, injury: p.health, since: s.shift, kind: 'implant', organId: o.id });
      post(s, 'implant', -toCents(o.cost), `Установка органа «${o.label}»: ${p.name}`);
      log(s, 'implant_started', `${p.name}: установка «${o.label}», реабилитация ${o.shifts} смен., выведен(а) в резерв.`, [p.id]);
      return { ok: true, state: s };
    }
    case 'REMOVE_ORGAN': {
      const p = s.staff.find((x) => x.id === command.staffId);
      const o = organById(command.organId);
      if (!p || !o || !p.implants.includes(o.id)) return reject('Такой орган не установлен.');
      if (!o.removable) return reject(`«${o.label}» нельзя безопасно извлечь.`);
      if (s.squads.some((q) => q.memberIds.includes(p.id) && DEPLOYED.includes(q.status))) return reject('Сотрудник на задании.');
      p.implants = p.implants.filter((id) => id !== o.id);
      log(s, 'implant_removed', `${p.name}: орган «${o.label}» извлечён.`, [p.id]);
      return { ok: true, state: s };
    }
    case 'QUEUE_UPGRADE': {
      const why = upgradeBlocker(s, command.facilityId);
      if (why) return reject(why);
      const b = makeBuild(s, command.facilityId);
      s.construction.push(b);
      refreshQueue(s);
      const def = facilityDef(command.facilityId);
      log(s, 'construction_queued', `${def.label}: улучшение до уровня ${b.toLevel} поставлено в очередь, зарезервировано ${b.cost / 100} РЕ.`);
      return { ok: true, state: s };
    }
    case 'CANCEL_UPGRADE': {
      const b = s.construction.find((x) => x.facilityId === command.facilityId);
      if (!b) return reject('Этой работы нет в очереди.');
      s.construction = s.construction.filter((x) => x !== b);
      refreshQueue(s);
      const def = facilityDef(command.facilityId);
      log(s, 'construction_cancelled', `${def.label}: работы отменены${b.paid ? `, оплаченные ${b.paid / 100} РЕ не возвращаются` : ''}.`);
      return { ok: true, state: s };
    }
    case 'PRIORITIZE_UPGRADE': {
      const i = s.construction.findIndex((x) => x.facilityId === command.facilityId);
      if (i < 0) return reject('Этой работы нет в очереди.');
      if (i === 0) return reject('Работа уже первая в очереди.');
      const [b] = s.construction.splice(i, 1);
      s.construction.unshift(b!);
      for (const x of s.construction) if (x.status === 'blocked') x.status = 'queued';
      refreshQueue(s);
      log(s, 'construction_prioritized', `${facilityDef(command.facilityId).label}: работа поставлена первой в очереди.`);
      return { ok: true, state: s };
    }
    case 'START_PROJECT': {
      const why = startBlocker(s, command.projectId, command.protocol, command.researcherId);
      if (why) return reject(why);
      const p = s.staff.find((x) => x.id === command.researcherId)!;
      const sq = squadOf(s, p.id);
      if (sq) leaveSquad(p, sq);
      s.research = s.research.filter((x) => x.id !== command.projectId);
      s.research.push(makeProject(s, command.projectId, command.protocol, p.id));
      refreshResearch(s);
      const d = projectDef(command.projectId)!;
      log(s, 'research_started', `Начато исследование «${d.label}» (${RESEARCH.protocols[command.protocol].label.toLowerCase()} протокол). Ведёт ${p.name}, выведен(а) из отряда.`, [p.id]);
      return { ok: true, state: s };
    }
    case 'CANCEL_PROJECT': {
      const pr = s.research.find((x) => x.id === command.projectId && isRunning(x));
      if (!pr) return reject('Проект не идёт.');
      s.research = s.research.filter((x) => x !== pr);
      refreshResearch(s);
      log(s, 'research_cancelled', `Исследование «${projectDef(pr.id)?.label}» остановлено; затраты не возвращаются.`, [pr.researcherId]);
      returnHome(s, staffLog(s));
      return { ok: true, state: s };
    }
    case 'FABRICATE': {
      const why = fabricateBlocker(s, command.projectId);
      if (why) return reject(why);
      const f = projectDef(command.projectId)!.fabricate!;
      post(s, 'fabrication', -toCents(f.cost), `Изготовление: ${equipmentType(f.typeId)?.label ?? f.typeId}`);
      s.resources.reagents -= f.reagents;
      for (let i = 0; i < f.units; i++) {
        const n = s.equipment.filter((u) => u.typeId === f.typeId).length + 1;
        s.equipment.push({ id: `${f.typeId}-${n}`, typeId: f.typeId, state: 'available', squadId: null });
      }
      log(s, 'fabricated', `Изготовлено: ${equipmentType(f.typeId)?.label ?? f.typeId}, ${f.units} ед.`);
      return { ok: true, state: s };
    }
    case 'REQUEST_PERMIT': {
      const why = requestBlocker(s, command.incidentId, command.kind);
      if (why) return reject(why);
      const inc = s.incidents.find((i) => i.id === command.incidentId)!;
      const p = makePermit(s, inc, command.kind);
      s.politics.permits.push(p);
      const fee = toCents(POLITICS.permits[command.kind].fee);
      if (fee) post(s, 'permit_fee', -fee, `Пошлина: ${command.kind === 'judicial' ? 'ордер' : 'допуск'} по вызову «${inc.title}»`);
      log(s, 'permit_requested', `Запрошено ${command.kind === 'judicial' ? 'судебное разрешение' : 'межведомственное разрешение'} (${p.issuer}): ${inc.title}. Решение ≈ через ${POLITICS.permits[command.kind].reviewMinutes} мин.`);
      return { ok: true, state: s };
    }
    case 'ACCEPT_DEAL': {
      const why = acceptBlocker(s, command.offerId);
      if (why) return reject(why);
      const offer = s.politics.offers.find((o) => o.id === command.offerId)!;
      acceptDeal(s, offer, (a, n) => post(s, 'deal', a, n), (t, x) => log(s, t, x));
      return { ok: true, state: s };
    }
    case 'DECLINE_DEAL': {
      const offer = s.politics.offers.find((o) => o.id === command.offerId);
      if (!offer) return reject('Предложение не найдено или истекло.');
      const def = dealDef(offer.templateId)!;
      s.politics.offers = s.politics.offers.filter((o) => o !== offer);
      s.politics.standing[def.houseId] = Math.max(-100, (s.politics.standing[def.houseId] ?? 0) + POLITICS.declineStanding);
      log(s, 'deal_declined', `Отклонено предложение (${houseById(def.houseId)!.label}): «${def.title}».`);
      return { ok: true, state: s };
    }
    case 'BREAK_DEAL': {
      const deal = s.politics.deals.find((d) => d.id === command.dealId && d.status === 'active');
      if (!deal) return reject('Действующий договор не найден.');
      breakDeal(s, deal, 'дирекция расторгла договор.', (a, n) => post(s, 'sanction', a, n), (t, x) => log(s, t, x));
      return { ok: true, state: s };
    }
    case 'ANALYZE_EVIDENCE': {
      const why = analysisBlocker(s, command.caseId, command.evidenceId, command.staffId);
      if (why) return reject(why);
      startAnalysis(s, command.caseId, command.evidenceId, command.staffId);
      const p = s.staff.find((x) => x.id === command.staffId)!;
      log(s, 'evidence_analysis_started', `${p.name}: проверка улики «${evidenceDef(caseDef(command.caseId)!, command.evidenceId)!.title}».`, [p.id]);
      return { ok: true, state: s };
    }
    case 'LINK_EVIDENCE':
    case 'UNLINK_EVIDENCE': {
      const why = linkBlocker(s, command.caseId, command.evidenceId, command.hypothesisId);
      if (why) return reject(why);
      const f = caseFile(s, command.caseId)!;
      const has = f.links.some((l) => l.evidenceId === command.evidenceId && l.hypothesisId === command.hypothesisId);
      if (command.type === 'LINK_EVIDENCE') {
        if (has) return reject('Такая связь уже есть.');
        f.links.push({ evidenceId: command.evidenceId, hypothesisId: command.hypothesisId });
      } else {
        if (!has) return reject('Такой связи нет.');
        f.links = f.links.filter((l) => !(l.evidenceId === command.evidenceId && l.hypothesisId === command.hypothesisId));
      }
      return { ok: true, state: s };
    }
    case 'LINK_PAIR':
    case 'UNLINK_PAIR': {
      const why = pairBlocker(s, command.caseId, command.a, command.b);
      if (why) return reject(why);
      const f = caseFile(s, command.caseId)!;
      const has = hasPair(f, command.a, command.b);
      if (command.type === 'LINK_PAIR') {
        if (has) return reject('Эти улики уже сопоставлены.');
        f.pairs.push({ a: command.a, b: command.b });
      } else {
        if (!has) return reject('Такого сопоставления нет.');
        f.pairs = f.pairs.filter((p) => !((p.a === command.a && p.b === command.b) || (p.a === command.b && p.b === command.a)));
      }
      return { ok: true, state: s };
    }
    case 'SET_WORKING_HYPOTHESIS': {
      const f = caseFile(s, command.caseId);
      if (!f || f.status !== 'open') return reject('Дело не найдено или уже решено.');
      if (command.hypothesisId && !caseDef(f.id)!.hypotheses.some((h) => h.id === command.hypothesisId)) return reject('Версия не найдена.');
      f.working = command.hypothesisId;
      return { ok: true, state: s };
    }
    case 'PLACE_EVIDENCE': {
      const f = caseFile(s, command.caseId);
      if (!f || f.status !== 'open') return reject('Дело не найдено или уже решено.');
      const d = caseDef(f.id)!;
      if (!f.evidence.some((e) => e.id === command.evidenceId) || evidenceDef(d, command.evidenceId)?.slot === undefined) return reject('Эту улику нельзя привязать ко времени.');
      if (command.slot === null) delete f.timeline[command.evidenceId];
      else {
        if (!Number.isInteger(command.slot) || command.slot < 0 || command.slot >= d.slots.length) return reject('Нет такого времени.');
        f.timeline[command.evidenceId] = command.slot;
      }
      return { ok: true, state: s };
    }
    case 'INTERROGATE': {
      const why = interrogationBlocker(s, command.caseId, command.personId, command.lineId, command.staffId);
      if (why) return reject(why);
      startInterrogation(s, command.caseId, command.personId, command.lineId, command.staffId);
      const p = s.staff.find((x) => x.id === command.staffId)!;
      const person = personDef(caseDef(command.caseId)!, command.personId)!;
      const line = person.lines.find((l) => l.id === command.lineId)!;
      log(s, 'interrogation_started', `${p.name}: ${METHOD_LABEL[line.method].toLowerCase()} — ${person.name}.`, [p.id]);
      return { ok: true, state: s };
    }
    case 'CASE_ACTION': {
      const action = actionDef(caseDef(command.caseId)!, command.actionId);
      if (s.mode === 'sandbox' && action?.kind === 'field') {
        const why = actionBlocker(s, command.caseId, command.actionId);
        if (why) return reject(why);
        const incident = startSandboxFieldAction(s, command.caseId, command.actionId);
        if (!incident) return reject('Для этого действия нет события на карте.');
        log(s, 'case_action_event', `Дело №${caseDef(command.caseId)!.number}: на карте открыт выезд «${incident.title}».`);
        return { ok: true, state: s };
      }
      if (!command.staffId) return reject('Выберите сотрудника для следственного действия.');
      const why = actionBlocker(s, command.caseId, command.actionId, command.staffId);
      if (why) return reject(why);
      startAction(s, command.caseId, command.actionId, command.staffId);
      const p = s.staff.find((x) => x.id === command.staffId)!;
      log(s, 'case_action_started', `${p.name}: ${actionDef(caseDef(command.caseId)!, command.actionId)!.label.toLowerCase()}.`, [p.id]);
      return { ok: true, state: s };
    }
    case 'REQUEST_CASE_PERMIT': {
      const why = casePermitBlocker(s, command.caseId, command.actionId);
      if (why) return reject(why);
      const f = caseFile(s, command.caseId)!;
      const a = actionDef(caseDef(f.id)!, command.actionId)!;
      const permit = makeCasePermit(s, f, a);
      s.politics.permits.push(permit);
      const fee = toCents(POLITICS.permits[a.permit!].fee);
      if (fee) post(s, 'permit_fee', -fee, `Пошлина: ${permit.target}`);
      log(s, 'permit_requested', `${permit.target}: запрос направлен (${permit.issuer}).`);
      return { ok: true, state: s };
    }
    case 'REQUEST_EXPERTISE': {
      const why = expertiseBlocker(s, command.caseId);
      if (why) return reject(why);
      requestExpertise(s, command.caseId, (a, n) => post(s, 'expertise', a, n), (t, x) => log(s, t, x));
      return { ok: true, state: s };
    }
    case 'CONCLUDE_CASE': {
      const why = concludeBlocker(s, command.caseId, command.conclusionId, command.hypothesisId);
      if (why) return reject(why);
      if (s.mode === 'sandbox') concludeSandboxCase(s, command.caseId, command.conclusionId, command.hypothesisId);
      else concludeCase(s, command.caseId, command.conclusionId, command.hypothesisId, (a, n) => post(s, a < 0 ? 'sanction' : 'deal', a, n), (t, x) => log(s, t, x));
      return { ok: true, state: s };
    }
    case 'BUY_SANDBOX_SQUAD': {
      const why = buySandboxSquad(s);
      if (why) return reject(why);
      return { ok: true, state: s };
    }
    case 'ACK_SANDBOX_RESULT': {
      const why = acknowledgeSandboxResult(s);
      if (why) return reject(why);
      return { ok: true, state: s };
    }
    case 'STORY_CHOICE': {
      const why = storyChoiceBlocker(s, command.shift, command.optionId);
      if (why) return reject(why);
      applyStoryChoice(s, command.shift, command.optionId, (a, n) => post(s, a < 0 ? 'sanction' : 'deal', a, n), (t, x) => log(s, t, x));
      return { ok: true, state: s };
    }
    case 'START_SPECIAL_OP': {
      const why = startOpBlocker(s, command.opId, command.squadId);
      if (why) return reject(why);
      startOp(s, command.opId, command.squadId, (t, x, ids) => log(s, t, x, ids));
      return { ok: true, state: s };
    }
    case 'SPECIAL_OP_CHOICE': {
      const op = activeOp(s);
      if (!op || op.id !== command.opId) return reject('Эта операция сейчас не идёт.');
      const why = optionBlocker(s, op, command.optionId);
      if (why) return reject(why);
      chooseOpOption(s, op, command.optionId, (a, n) => post(s, a < 0 ? 'sanction' : 'deal', a, n), (t, x, ids) => log(s, t, x, ids));
      return { ok: true, state: s };
    }
    case 'ACK_SPECIAL_OP': {
      const op = s.campaign.ops.find((o) => o.id === command.opId);
      if (!op?.report) return reject('Отчёт не найден.');
      op.report.seen = true;
      return { ok: true, state: s };
    }
    case 'ACK_ENDING': {
      if (!s.campaign.ending) return reject('Кампания ещё идёт.');
      s.campaign.endingSeen = true;
      return { ok: true, state: s };
    }
    case 'END_SHIFT': {
      if (s.mode === 'sandbox') return reject('В песочнице непрерывное время: смен нет.');
      if (s.phase !== 'ACTIVE' && s.phase !== 'REVIEW_PENDING') return reject('Сейчас нельзя завершить смену.');
      if (pendingDecision(s)) return reject('Сначала примите решение по операции.');
      if (activeOp(s)) return reject('Сначала завершите особую операцию.');
      // Вызовы, не успевшие поступить (смену закрыли раньше), всё равно приходят и переносятся на следующую смену.
      while (s.incoming.length) receiveCall(s);
      // Начало смены — до её первой транзакции (платежи между сменами относятся к новой смене).
      const opening = s.economy.balance - s.economy.ledger.filter((t) => t.shift === s.shift).reduce((x, t) => x + t.amount, 0);
      post(s, 'funding', toCents(BALANCE.fundingPerShift), 'Финансирование смены');
      if (SUBSIDY.shifts.includes(s.shift)) {
        const safety = citySafety(s);
        if (safety >= SUBSIDY.minSafety) {
          post(s, 'subsidy', toCents(SUBSIDY.amount), `Субсидия за цели смены ${s.shift}`);
          log(s, 'subsidy_granted', `Субсидия получена: безопасность города ${safety}%.`);
        } else log(s, 'subsidy_refused', `Субсидия не выделена: безопасность города ${safety}% ниже ${SUBSIDY.minSafety}%.`);
      }
      const wages = aliveStaff(s).reduce((sum, p) => sum + p.salary, 0);
      const payable = Math.min(wages, s.economy.balance);
      post(s, 'salary', -payable, `Жалование: ${aliveStaff(s).length} сотрудников`);
      if (payable < wages) {
        s.economy.unpaidObligations += wages - payable;
        log(s, 'salary_arrears', `Не хватило средств на жалование: долг ${(wages - payable) / 100} РЕ.`);
      }
      const upkeep = upkeepPerShift(s);
      if (upkeep > 0) {
        const paidUp = Math.min(upkeep, s.economy.balance);
        post(s, 'upkeep', -paidUp, 'Содержание объектов');
        if (paidUp < upkeep) {
          s.economy.unpaidObligations += upkeep - paidUp;
          log(s, 'upkeep_arrears', `Не хватило средств на содержание объектов: долг ${(upkeep - paidUp) / 100} РЕ.`);
        }
      }
      checkDeals(s, (a, n) => post(s, 'deal', a, n), (t, x) => log(s, t, x));
      settleStoryShift(s, (a, n) => post(s, a < 0 ? 'sanction' : 'deal', a, n), (t, x) => log(s, t, x));
      const ledger = s.economy.ledger.filter((t) => t.shift === s.shift);
      const open = s.incidents.filter(isOpen);
      const ops = s.operationReports.filter((r) => r.shift === s.shift);
      s.reports.push({
        shift: s.shift,
        openingBalance: opening,
        closingBalance: s.economy.balance,
        income: ledger.filter((t) => t.amount > 0).reduce((a, t) => a + t.amount, 0),
        expenses: -ledger.filter((t) => t.amount < 0).reduce((a, t) => a + t.amount, 0),
        unpaid: s.economy.unpaidObligations,
        openIncidents: open.length,
        escalatedIncidents: open.filter((i) => i.state === 'escalated').length,
        operations: {
          success: ops.filter((r) => r.outcome === 'success').length,
          partial: ops.filter((r) => r.outcome === 'partial').length,
          failure: ops.filter((r) => r.outcome === 'failure').length,
        },
        injured: ops.flatMap((r) => r.casualties).filter((c) => c.after !== 'dead').length,
        killed: ops.flatMap((r) => r.casualties).filter((c) => c.after === 'dead').length,
      });
      s.phase = 'SHIFT_REPORT';
      s.paused = true;
      log(s, 'shift_ended', `Смена ${s.shift} завершена. Открытых вызовов: ${open.length}.`);
      finishCampaign(s, (t, x) => log(s, t, x));
      return { ok: true, state: s };
    }

    case 'ADVANCE_SHIFT': {
      if (s.mode === 'sandbox') return reject('В песочнице непрерывное время: смен нет.');
      if (s.phase !== 'SHIFT_REPORT') return reject('Сначала завершите смену.');
      s.shift += 1;
      s.minute = 0;
      s.phase = 'BRIEFING';
      s.paused = true;
      for (const q of s.squads) if (q.status === 'resting' || q.status === 'recovery' || q.status === 'treatment') q.status = 'ready';
      // Между сменами: клиника, проверки кандидатов, адаптация новичков (W6).
      advanceMedical(s, staffLog(s), (amount, note) => {
        if (s.economy.balance + amount < 0) return false;
        post(s, 'treatment', amount, note);
        return true;
      });
      completeChecks(s, (type, text) => log(s, type, text));
      advanceTraining(s, staffLog(s));
      advanceConstruction(s, (amount, note) => {
        if (s.economy.balance + amount < 0) return false;
        post(s, 'construction', amount, note);
        return true;
      }, (type, text) => log(s, type, text));
      repairEquipment(s, (type, text) => log(s, type, text));
      advanceResearch(s, (amount, note) => { post(s, 'research', amount, note); return true; }, (type, text, ids) => log(s, type, text, ids));
      advancePolitics(s, (a, n) => post(s, a < 0 ? 'sanction' : 'deal', a, n), (t, x) => log(s, t, x));
      advanceInvestigationsShift(s, (a, n) => post(s, 'sanction', a, n), (type, text, ids) => log(s, type, text, ids));
      advanceOps(s, (a, n) => post(s, 'sanction', a, n), (type, text, ids) => log(s, type, text, ids));
      for (const p of s.staff) if (p.adaptation > 0) p.adaptation -= 1;
      // Лёгкие ранения заживают сами (ТЗ §7.4), усталость снижается.
      for (const p of s.staff) {
        if (p.health === 'dead') continue;
        if ((p.health === 'light_injury' || p.health === 'fatigued') && !patientOf(s, p.id)) {
          p.health = 'healthy';
          log(s, 'staff_recovered', `${p.name}: лёгкое ранение зажило.`, [p.id]);
        }
        p.fatigue = Math.max(0, p.fatigue - BALANCE_REST);
      }
      // Незакрытые вызовы переносятся (ТЗ §2.2, SHIFT-01): их срок отсчитывается заново от начала новой смены.
      for (const inc of s.incidents) if (isOpen(inc)) inc.deadlineMinute = Math.max(0, inc.deadlineMinute - BALANCE.shift.lengthMinutes);
      // Выздоровевшие и окончившие курс возвращаются на свои места в отрядах.
      returnHome(s, staffLog(s));
      spawnIncidents(s, BALANCE.incidentsPerNewShift);
      refreshCandidates(s);
      beginStoryShift(s, (t, x) => log(s, t, x));
      log(s, 'shift_briefing', `Брифинг смены ${s.shift}.`);
      return { ok: true, state: s };
    }
  }
}

/** Причина, по которой отряд нельзя отправить; null — можно. Используется ядром и интерфейсом (одна логика). */
export function dispatchBlocker(s: GameState, sq: Squad, inc: Incident): string | null {
  if (s.sandbox?.defeatReason) return 'Сценарий завершён.';
  if (s.sandbox && !s.sandbox.unlockedDistricts.includes(inc.districtId)) return 'Район ещё не открыт расследованием.';
  if (sq.status !== 'ready') return `Отряд «${sq.name}» недоступен.`;
  if (!['new', 'acknowledged', 'escalated'].includes(inc.state)) return 'На этот вызов уже назначен отряд или он закрыт.';
  if (s.economy.balance < DISPATCH_COST) return 'Недостаточно средств на выезд.';
  const target = districtById(inc.districtId);
  if (!target || !spawnPosition(inc.spawnId)) return 'Нет точки события на карте.';
  if (!shortestPath(sq.currentNodeId, target.serviceNode, s.roadClosures)) return 'Маршрут недоступен: дороги перекрыты.';
  return null;
}

/** Перестроить оставшийся путь после изменения дорог (W3 §4 п.9). Текущее ребро отряд доезжает. */
function reroute(s: GameState, sq: Squad) {
  const m = sq.movement!;
  const r = m.route;
  let t = m.elapsed, i = 0;
  while (i < r.edgeIds.length && t >= r.legMinutes[i]!) { t -= r.legMinutes[i]!; i++; }
  const committed = Math.min(i + 1, r.edgeIds.length); // рёбра, которые уже пройдены или на которых отряд сейчас
  const remaining = r.edgeIds.slice(committed);
  if (!remaining.some((e) => s.roadClosures.includes(e))) return;
  const pivot = r.nodeIds[committed]!;
  const inc = s.incidents.find((x) => x.id === m.destinationIncidentId)!;
  const rest = buildRoute(pivot, districtById(inc.districtId)!.serviceNode, s.roadClosures);
  const prefixLegs = r.legMinutes.slice(0, committed);
  if (rest) {
    const legMinutes = [...prefixLegs, ...rest.legMinutes];
    m.route = {
      nodeIds: [...r.nodeIds.slice(0, committed + 1), ...rest.nodeIds.slice(1)],
      edgeIds: [...r.edgeIds.slice(0, committed), ...rest.edgeIds],
      legMinutes,
      totalMinutes: legMinutes.reduce((a, b) => a + b, 0),
    };
    log(s, 'squad_rerouted', `Отряд «${sq.name}»: маршрут перестроен, прибытие ≈${Math.ceil(m.route.totalMinutes - m.elapsed)} мин.`);
  } else {
    const legMinutes = [...prefixLegs, 0];
    m.route = { nodeIds: r.nodeIds.slice(0, committed + 1), edgeIds: r.edgeIds.slice(0, committed), legMinutes, totalMinutes: prefixLegs.reduce((a, b) => a + b, 0) };
    m.aborted = true;
    log(s, 'squad_route_blocked', `Отряд «${sq.name}»: маршрут недоступен, остановка на узле ${pivot}.`);
  }
}

/** Двигает отряды на минуту; возвращает ID прибывших на место (их работа начнётся со следующей минуты). */
function moveSquads(s: GameState): Set<string> {
  const arrived = new Set<string>();
  for (const sq of s.squads) {
    const m = sq.movement;
    if (!m || (sq.status !== 'en_route' && sq.status !== 'returning')) continue;
    m.elapsed += 1;
    if (m.elapsed < m.route.totalMinutes) continue;
    if (sq.status === 'returning') {
      sq.currentNodeId = m.route.nodeIds[m.route.nodeIds.length - 1]!;
      finishReturn(s, sq);
      log(s, 'squad_returned', `Отряд «${sq.name}» вернулся на базу.`);
      continue;
    }
    const inc = s.incidents.find((x) => x.id === m.destinationIncidentId);
    sq.currentNodeId = m.route.nodeIds[m.route.nodeIds.length - 1]!;
    sq.movement = null;
    if (m.aborted) {
      finishReturn(s, sq);
      sq.status = 'ready';
      sq.assignedIncidentId = null;
      if (inc && inc.state === 'en_route') inc.state = 'acknowledged';
      log(s, 'squad_stopped', `Отряд «${sq.name}» остановился: дальше дороги нет.`);
    } else {
      sq.status = 'on_scene';
      if (inc) inc.state = 'on_scene';
      if (inc) beginScene(sq, inc);
      arrived.add(sq.id);
      log(s, 'squad_arrived', `Отряд «${sq.name}» прибыл: ${inc?.title ?? ''}.`);
    }
  }
  return arrived;
}

function advanceMinute(s: GameState) {
  s.minute += 1;
  if (s.incoming[0] && s.incoming[0].at <= s.minute) {
    while (s.incoming[0] && s.incoming[0].at <= s.minute) receiveCall(s);
    // Автопауза: игрок сам решает, кого отправить (ТЗ: пауза при решениях).
    s.paused = true;
  }
  const arrived = moveSquads(s);
  for (const sq of s.squads) {
    if (sq.status !== 'on_scene' || !sq.operation || arrived.has(sq.id)) continue;
    const opCommander = sq.operation.commanderId;
    const report = tickScene(s, sq);
    if (!report) continue;
    const word = report.outcome === 'success' ? 'успешно' : report.outcome === 'partial' ? 'частично' : 'провалена';
    log(s, 'operation_completed', `Операция «${report.squadName}» (${report.incidentTitle}) завершена: ${word}.`, report.memberIds);
    for (const c of report.casualties) log(s, c.after === 'dead' ? 'staff_killed' : 'staff_injured', `${c.name}: ${HEALTH_LOG[c.after]}.`, [c.staffId]);
    applyOperationToRelations(s, report, opCommander, staffLog(s));
    const tpl = s.incidents.find((i) => i.id === report.incidentId)?.templateId;
    if (tpl) openCaseFromReport(s, report, tpl, (type, text, ids) => log(s, type, text, ids));
    if (s.mode === 'sandbox') resolveSandboxOperation(s, report);
  }
  decidePermits(s, (t, x) => log(s, t, x));
  decideCasePermits(s, (t, x) => log(s, t, x));
  advanceInvestigations(s, (type, text, ids) => log(s, type, text, ids));
  for (const inc of s.incidents) {
    if ((inc.state === 'new' || inc.state === 'acknowledged') && s.minute >= inc.deadlineMinute) {
      if (inc.sandbox) {
        expireSandboxIncident(s, inc);
        continue;
      }
      // W10: опоздание по сценарию — обострение, исчезновение (вызов закрыт, следы потеряны) или новое событие.
      const kind = lateKind(inc);
      const late = templateOf(inc)?.lateText;
      const d = s.districts.find((x) => x.id === inc.districtId);
      if (d) {
        d.safety = Math.max(0, d.safety - BALANCE.district.escalationSafetyPenalty);
        d.civilianTrust = Math.max(0, d.civilianTrust - BALANCE.district.escalationTrustPenalty);
        if (kind !== 'expire') d.threat += 1;
      }
      for (const f of outcomeFlags(templateOf(inc), 'failure')) setFlag(s, f);
      if (kind === 'expire') {
        inc.state = 'expired';
        log(s, 'incident_expired', `Не успели: ${inc.title}${late ? ` — ${late}` : '.'}`);
      } else {
        inc.state = 'escalated';
        log(s, 'incident_escalated', `Ситуация ухудшилась: ${inc.title}${late ? ` — ${late}` : '.'}`);
      }
    }
  }
  if (s.mode === 'sandbox') {
    advanceSandboxMinute(s);
    return;
  }
  if (s.minute >= BALANCE.shift.lengthMinutes) {
    s.phase = 'REVIEW_PENDING';
    s.paused = true;
    log(s, 'shift_time_over', 'Время смены истекло. Проверьте активные угрозы и завершите смену.');
  }
}

/** Первый вызов из очереди дня поступает на карту. */
function receiveCall(s: GameState) {
  const { incident } = s.incoming.shift()!;
  s.incidents.push(incident);
  log(s, 'incident_created', `Новый вызов: ${incident.title}.`);
}

/**
 * Вызовы смены: первый — к брифингу, остальные приходят в течение дня (CALLS.firstMinute…lastMinute от начала смены).
 * Срок каждого отсчитывается от поступления, поэтому запас времени у игрока тот же, что и раньше.
 */
const CALLS = { firstMinute: 60, lastMinute: 540 };
function spawnIncidents(s: GameState, count: number) {
  const made: Incident[] = [];
  for (let k = 0; k < count; k++) {
    let idx: number, spawn: number, jitter: number;
    [idx, s.rng] = nextInt(s.rng, RANDOM_POOL.length);
    [spawn, s.rng] = nextInt(s.rng, 3);
    [jitter, s.rng] = nextInt(s.rng, 30);
    const t = RANDOM_POOL[idx]!;
    const inc: Incident = {
      id: `inc-${s.nextIds.incident++}`,
      templateId: t.id,
      title: t.title,
      districtId: t.districtId,
      spawnId: `${t.districtId}:spawn:0${spawn + 1}`,
      severity: t.severity,
      state: 'new',
      deadlineType: t.deadlineType ?? 'escalate',
      deadlineMinute: 60 + t.deadlineMinutes + jitter + earlyWarning(s),
      createdShift: s.shift,
    };
    made.push(inc);
  }
  const [first, ...later] = made;
  if (first) {
    s.incidents.push(first);
    log(s, 'incident_created', `Новый вызов: ${first.title}.`);
  }
  const times: number[] = [];
  for (let k = 0; k < later.length; k++) {
    let t: number;
    [t, s.rng] = nextInt(s.rng, CALLS.lastMinute - CALLS.firstMinute + 1);
    times.push(CALLS.firstMinute + t);
  }
  times.sort((a, b) => a - b);
  later.forEach((inc, k) => {
    inc.deadlineMinute += times[k]!;
    s.incoming.push({ at: times[k]!, incident: inc });
  });
}

function post(s: GameState, kind: TransactionKind, amount: number, note: string) {
  const t: Transaction = { id: s.nextIds.transaction++, shift: s.shift, minute: s.minute, kind, amount, note };
  s.economy.ledger.push(t);
  s.economy.balance += amount;
}

function log(s: GameState, type: string, text: string, staffIds?: string[]) {
  s.log.push({ id: s.nextIds.event++, shift: s.shift, minute: s.minute, type, text, ...(staffIds?.length ? { staffIds: [...new Set(staffIds)] } : {}) });
}
/** Журнал для вспомогательных модулей: сотрудник определяется по имени в тексте записи. */
function staffLog(s: GameState) {
  return (type: string, text: string, ids?: string[]) =>
    log(s, type, text, ids ?? s.staff.filter((p) => text.startsWith(p.name) || text.includes(` ${p.name}`)).map((p) => p.id));
}
