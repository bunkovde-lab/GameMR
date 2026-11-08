import { BALANCE, INCIDENT_TEMPLATES, toCents } from './content';
import { nextInt } from './rng';
import { DEPLOYED, aliveStaff, isOpen } from './selectors';
import type { Command, CommandResult, GameState, Incident, Transaction, TransactionKind } from './types';

/**
 * Единственная точка изменения игрового состояния: nextState = reduce(state, command).
 * Чистая функция: не читает время, DOM и Math.random; случайность только через state.rng.
 * Неверная команда не меняет состояние и возвращает причину (ТЗ §5.3).
 */
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
      for (let i = 0; i < command.minutes && s.phase === 'ACTIVE'; i++) advanceMinute(s);
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
      log(s, 'staff_transferred', `${person.name} переведён(а) в отряд «${target.name}».`);
      return { ok: true, state: s };
    }

    case 'END_SHIFT': {
      if (s.phase !== 'ACTIVE' && s.phase !== 'REVIEW_PENDING') return reject('Сейчас нельзя завершить смену.');
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
      s.reports.push({
        shift: s.shift,
        openingBalance: opening,
        closingBalance: s.economy.balance,
        income: ledger.filter((t) => t.amount > 0).reduce((a, t) => a + t.amount, 0),
        expenses: -ledger.filter((t) => t.amount < 0).reduce((a, t) => a + t.amount, 0),
        unpaid: s.economy.unpaidObligations,
        openIncidents: open.length,
        escalatedIncidents: open.filter((i) => i.state === 'escalated').length,
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
      for (const q of s.squads) if (q.status === 'resting' || q.status === 'recovery') q.status = 'ready';
      // Незакрытые вызовы переносятся (ТЗ §2.2, SHIFT-01): их срок отсчитывается заново от начала новой смены.
      for (const inc of s.incidents) if (isOpen(inc)) inc.deadlineMinute = Math.max(0, inc.deadlineMinute - BALANCE.shift.lengthMinutes);
      spawnIncidents(s, BALANCE.incidentsPerNewShift);
      log(s, 'shift_briefing', `Брифинг смены ${s.shift}.`);
      return { ok: true, state: s };
    }
  }
}

function advanceMinute(s: GameState) {
  s.minute += 1;
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

function log(s: GameState, type: string, text: string) {
  s.log.push({ id: s.nextIds.event++, shift: s.shift, minute: s.minute, type, text });
}
