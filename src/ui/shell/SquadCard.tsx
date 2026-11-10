import { useState } from 'react';
import { ROLE_LABEL } from '../../core/content';
import { DISPATCH_RULES, memberBlocker } from '../../core/dispatch';
import { HEALTH_LOG } from '../../core/healthText';
import { etaMinutes } from '../../core/map/graph';
import { formatRe } from '../../core/selectors';
import { PLAN_IDS, PLANS, TREATABLE, patientOf, treatmentForecast } from '../../core/staff';
import { STAT_KEYS, reserveOptions, squadSummary } from '../../core/squadSummary';
import type { GameState, Stats } from '../../core/types';
import { dispatch } from '../../store';
import { SQUAD_STATUS } from '../labels';
import { Portrait } from '../Portrait';
import type { Selection } from '../uiState';

const STAT_LABEL: Record<keyof Stats, string> = { reaction: 'Реакция', analysis: 'Анализ', control: 'Контроль', resilience: 'Стойкость', authority: 'Авторитет' };
const RANKS = ['I', 'II', 'III', 'IV', 'V'];

/** Что открыто под строкой сотрудника: выбор лечения или замена из резерва. */
type Open = { id: string; kind: 'treat' | 'swap' } | null;

/**
 * Карточка «Отряд» на карте смены: сводка для быстрой настройки и действия по каждому бойцу
 * (командир, лечение, в резерв, замена из резерва). Все правила — в ядре (reduce/staff/dispatch).
 */
export function SquadCard({ game, id, onSelect }: { game: GameState; id: string; onSelect: (s: Selection) => void }) {
  const [open, setOpen] = useState<Open>(null);
  const [adding, setAdding] = useState(false);
  const q = game.squads.find((x) => x.id === id);
  if (!q) return null;
  const sum = squadSummary(game, q);
  const inc = q.assignedIncidentId ? game.incidents.find((i) => i.id === q.assignedIncidentId) : undefined;
  const st = SQUAD_STATUS[q.status];
  const pool = reserveOptions(game);
  const toggle = (pid: string, kind: 'treat' | 'swap') => setOpen(open?.id === pid && open.kind === kind ? null : { id: pid, kind });
  const exhausted = DISPATCH_RULES.squad.exhaustedFatigue;

  return (
    <div data-testid="squad-card" className="squad-card">
      <h3 className="card-title">«{q.name}»</h3>
      <dl className="kv">
        <dt>Статус</dt><dd data-testid="squad-card-status" className={`tone-${st.tone}`}>{st.label}</dd>
        {inc && (<><dt>Задание</dt><dd><button className="link" onClick={() => onSelect({ kind: 'incident', id: inc.id })}>{inc.title}</button></dd></>)}
        {q.movement && (<><dt>Прибытие</dt><dd>≈{etaMinutes(q.movement.route, q.movement.elapsed)} мин</dd></>)}
      </dl>

      <section className="sq-summary" aria-label="Сводка отряда" data-testid="squad-summary">
        <div className="sq-chips">
          <div><b data-testid="squad-fit">{sum.fit}/{sum.total}</b><small>годны к выезду</small></div>
          <div><b className={sum.avgFatigue >= exhausted ? 'warn-text' : ''} data-testid="squad-fatigue">{sum.avgFatigue}%</b><small>усталость</small></div>
          <div><b>{sum.needTreatment}</b><small>ждут лечения</small></div>
        </div>
        <ul className="stat-bars" data-testid="squad-stats">
          {STAT_KEYS.map((k) => (
            <li key={k}>
              <span>{STAT_LABEL[k]}</span>
              <span className="bar" aria-hidden="true"><i style={{ width: `${(sum.stats[k] / 5) * 100}%` }} /></span>
              <b>{sum.stats[k].toFixed(1)}</b>
            </li>
          ))}
        </ul>
        <p className="muted small">
          Роли: {sum.roles.length ? sum.roles.map((r) => ROLE_LABEL[r]).join(', ') : '—'}
          {sum.commander && <> · командир: {sum.commander.name}</>}
        </p>
        {sum.warnings.length > 0 && (
          <ul className="plain-list sq-warnings" data-testid="squad-warnings">{sum.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        )}
      </section>

      <h4 className="section-title">Состав · {sum.total}/{sum.max}</h4>
      {sum.locked && <p className="hint">Отряд на задании: состав и лечение — после возвращения.</p>}
      <ul className="plain-list sq-members">
        {q.memberIds.map((pid) => {
          const p = game.staff.find((x) => x.id === pid);
          if (!p) return null;
          const blocker = memberBlocker(game, p.id, q.id);
          const isCmd = sum.commander?.id === p.id;
          const treatable = TREATABLE.includes(p.health) && !patientOf(game, p.id);
          const fatigueTone = p.fatigue >= exhausted ? 'red' : p.fatigue >= exhausted / 2 ? 'amber' : 'green';
          return (
            <li key={p.id} className="sq-member" data-testid={`sq-member-${p.id}`}>
              <div className="face-row">
                <Portrait id={p.id} name={p.name} health={p.health} size="sm" />
                <span className="pick-text">
                  <span>{p.name}{isCmd && <em className="cmd"> · командир</em>}</span>
                  <small>{ROLE_LABEL[p.role]} · ранг {RANKS[p.rank - 1] ?? p.rank} · <span className={`health h-${p.health}`}>{HEALTH_LOG[p.health]}</span></small>
                  <span className={`fatigue tone-${fatigueTone}`} title="Усталость">
                    <span className="bar" aria-hidden="true"><i style={{ width: `${Math.min(100, p.fatigue)}%` }} /></span>
                    <small>усталость {p.fatigue}%</small>
                  </span>
                  {blocker && !sum.locked && <small className="warn-text">{blocker}</small>}
                </span>
              </div>
              <div className="row-actions wrap">
                <button className="btn" disabled={sum.locked || isCmd} onClick={() => dispatch({ type: 'SET_COMMANDER', squadId: q.id, staffId: p.id })} data-testid={`sq-cmd-${p.id}`}>Командир</button>
                {treatable && (
                  <button className="btn" disabled={sum.locked} aria-expanded={open?.id === p.id && open.kind === 'treat'} onClick={() => toggle(p.id, 'treat')} data-testid={`sq-treat-${p.id}`}>Лечить</button>
                )}
                <button className="btn" disabled={sum.locked || !pool.length} aria-expanded={open?.id === p.id && open.kind === 'swap'} onClick={() => toggle(p.id, 'swap')} data-testid={`sq-swap-${p.id}`}>Заменить</button>
                <button className="btn" disabled={sum.locked} onClick={() => dispatch({ type: 'UNASSIGN_STAFF', staffId: p.id })} data-testid={`sq-reserve-${p.id}`}>В резерв</button>
              </div>
              {open?.id === p.id && open.kind === 'treat' && !sum.locked && (
                <ul className="pick-list one-col" data-testid={`sq-plans-${p.id}`}>
                  {PLAN_IDS.map((plan) => {
                    const f = treatmentForecast(game, p.id, plan);
                    return (
                      <li key={plan}>
                        <button className="btn pick" disabled={!!f.blocker} onClick={() => { if (dispatch({ type: 'START_TREATMENT', staffId: p.id, plan })) setOpen(null); }} data-testid={`sq-treat-${p.id}-${plan}`}>
                          <b>{PLANS[plan].label}{f.blocker ? '' : ` · ${formatRe(f.cost)} РЕ`}</b>
                          <small>{f.blocker ?? `${f.shifts} смен. · вернётся к смене ${f.returnShift}${f.queued ? ' (очередь)' : ''} · риск осложнения ${f.complication}`}</small>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {open?.id === p.id && open.kind === 'swap' && !sum.locked && (
                <ReservePick game={game} testid={`sq-swap-list-${p.id}`} onPick={(withId) => { if (dispatch({ type: 'SWAP_STAFF', staffId: p.id, withId })) setOpen(null); }} />
              )}
            </li>
          );
        })}
      </ul>
      {sum.total < sum.max && !sum.locked && (
        <>
          <button className="btn wide" disabled={!pool.length} aria-expanded={adding} onClick={() => setAdding(!adding)} data-testid="sq-add">
            {pool.length ? '+ Добавить из резерва' : 'Резерв пуст'}
          </button>
          {adding && (
            <ReservePick game={game} testid="sq-add-list" onPick={(staffId) => { if (dispatch({ type: 'ASSIGN_STAFF', staffId, squadId: q.id })) setAdding(false); }} />
          )}
        </>
      )}
    </div>
  );
}

function ReservePick({ game, testid, onPick }: { game: GameState; testid: string; onPick: (id: string) => void }) {
  const pool = reserveOptions(game);
  if (!pool.length) return <p className="muted">В резерве нет допущенных к службе.</p>;
  return (
    <ul className="pick-list one-col reserve-pick" data-testid={testid}>
      {pool.map(({ person: r, blocker }) => (
        <li key={r.id}>
          <button className="btn pick" onClick={() => onPick(r.id)} data-testid={`${testid}-${r.id}`}>
            <span className="face-row">
              <Portrait id={r.id} name={r.name} health={r.health} size="sm" />
              <span className="pick-text">
                <b>{r.name}</b>
                <small>{ROLE_LABEL[r.role]} · усталость {r.fatigue}%{blocker ? ` · ${blocker}` : ' · готов(а)'}</small>
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
