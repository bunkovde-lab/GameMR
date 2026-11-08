import { BALANCE, DISPATCH_COST, INCIDENT_TEMPLATES, toCents } from './content';
import { bestCommander, defaultDraft, forecastTerms, planDispatch, recommendedTactic, riskLevel, tacticById, type DispatchDraft } from './dispatch';
import { applyOption, beginScene, finishReturn, pendingDecision, tickScene } from './operations';
import { HEALTH_LOG } from './healthText';
import {
  admitPatient, advanceMedical, completeChecks, hireCandidate, patientOf, refreshCandidates, squadOf, treatmentForecast, vacancies, PLANS,
} from './staff';
import { ROLE_LABEL } from './content';
import {
  RANK_NAMES, advanceTraining, applyOperationToRelations, courseBlocker, hasEffect, nodeById, organBlocker, organById, promotionStatus, salaryStep,
} from './career';
import { buildRoute, shortestPath } from './map/graph';
import { districtById, edgeById, spawnPosition } from './map/mapConfig';
import { nextInt } from './rng';
import { DEPLOYED, aliveStaff, isOpen } from './selectors';
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
      if (!Number.isInteger(command.minutes) || command.minutes < 1) return reject('Некорректный шаг времени.');
      if (pendingDecision(s)) return reject('Ожидается решение по операции.');
      for (let i = 0; i < command.minutes && s.phase === 'ACTIVE' && !pendingDecision(s); i++) advanceMinute(s);
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
      };
      const plan = planDispatch(s, draft);
      if (plan.blockers.length) return reject(plan.blockers[0]!);
      const route = plan.route!;
      const cohesion = forecastTerms(s, draft).C;
      // Ручной состав: выбранные переходят в этот отряд, не поехавшие остаются в резерве без отряда.
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
      sq.memberIds = sq.memberIds.filter((id) => id !== person.id);
      if (sq.commanderId === person.id) sq.commanderId = null;
      log(s, 'staff_transferred', `${person.name} переведён(а) в резерв.`, [person.id]);
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
      p.training = { nodeId: n.id, shiftsLeft: n.shifts };
      const sq = squadOf(s, p.id);
      if (sq) { sq.memberIds = sq.memberIds.filter((id) => id !== p.id); if (sq.commanderId === p.id) sq.commanderId = null; }
      post(s, 'training', -toCents(n.cost), `Курс «${n.label}»: ${p.name}`);
      log(s, 'course_started', `${p.name} направлен(а) на курс «${n.label}» (${n.shifts} смен.), выведен(а) в резерв.`, [p.id]);
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
      if (sq) { sq.memberIds = sq.memberIds.filter((id) => id !== p.id); if (sq.commanderId === p.id) sq.commanderId = null; }
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
    case 'END_SHIFT': {
      if (s.phase !== 'ACTIVE' && s.phase !== 'REVIEW_PENDING') return reject('Сейчас нельзя завершить смену.');
      if (pendingDecision(s)) return reject('Сначала примите решение по операции.');
      const opening = s.economy.balance;
      post(s, 'funding', toCents(BALANCE.fundingPerShift), 'Финансирование смены');
      const wages = aliveStaff(s).reduce((sum, p) => sum + p.salary, 0);
      const payable = Math.min(wages, s.economy.balance);
      post(s, 'salary', -payable, `Жалование: ${aliveStaff(s).length} сотрудников`);
      if (payable < wages) {
        s.economy.unpaidObligations += wages - payable;
        log(s, 'salary_arrears', `Не хватило средств на жалование: долг ${wages - payable} сотых РЕ.`);
      }
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
      return { ok: true, state: s };
    }

    case 'ADVANCE_SHIFT': {
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
      spawnIncidents(s, BALANCE.incidentsPerNewShift);
      refreshCandidates(s);
      log(s, 'shift_briefing', `Брифинг смены ${s.shift}.`);
      return { ok: true, state: s };
    }
  }
}

/** Причина, по которой отряд нельзя отправить; null — можно. Используется ядром и интерфейсом (одна логика). */
export function dispatchBlocker(s: GameState, sq: Squad, inc: Incident): string | null {
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
  }
  for (const inc of s.incidents) {
    if (inc.deadlineType === 'escalate' && (inc.state === 'new' || inc.state === 'acknowledged') && s.minute >= inc.deadlineMinute) {
      inc.state = 'escalated';
      const d = s.districts.find((x) => x.id === inc.districtId);
      if (d) {
        d.safety = Math.max(0, d.safety - BALANCE.district.escalationSafetyPenalty);
        d.civilianTrust = Math.max(0, d.civilianTrust - BALANCE.district.escalationTrustPenalty);
        d.threat += 1;
      }
      log(s, 'incident_escalated', `Ситуация ухудшилась: ${inc.title}.`);
    }
  }
  if (s.minute >= BALANCE.shift.lengthMinutes) {
    s.phase = 'REVIEW_PENDING';
    s.paused = true;
    log(s, 'shift_time_over', 'Время смены истекло. Проверьте активные угрозы и завершите смену.');
  }
}

function spawnIncidents(s: GameState, count: number) {
  for (let k = 0; k < count; k++) {
    let idx: number, spawn: number, jitter: number;
    [idx, s.rng] = nextInt(s.rng, INCIDENT_TEMPLATES.length);
    [spawn, s.rng] = nextInt(s.rng, 3);
    [jitter, s.rng] = nextInt(s.rng, 30);
    const t = INCIDENT_TEMPLATES[idx]!;
    const inc: Incident = {
      id: `inc-${s.nextIds.incident++}`,
      templateId: t.id,
      title: t.title,
      districtId: t.districtId,
      spawnId: `${t.districtId}:spawn:0${spawn + 1}`,
      severity: t.severity,
      state: 'new',
      deadlineType: 'escalate',
      deadlineMinute: 60 + t.deadlineMinutes + jitter,
      createdShift: s.shift,
    };
    s.incidents.push(inc);
    log(s, 'incident_created', `Новый вызов: ${inc.title}.`);
  }
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
