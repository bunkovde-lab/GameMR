import { useState } from 'react';
import { ROLE_LABEL } from '../../core/content';
import { memberBlocker } from '../../core/dispatch';
import { HEALTH_LOG } from '../../core/healthText';
import { formatRe } from '../../core/selectors';
import {
  PLAN_IDS, PLANS, STAFF_RULES, TREATABLE, bedsUsed, capsulesUsed, patientOf, reserve, squadCommander, squadOf,
  suitability, treatmentForecast, vacancies,
} from '../../core/staff';
import type { Candidate, DossierStatus, GameState, StaffRole, Stats } from '../../core/types';
import { dispatch } from '../../store';
import { Icon } from '../Icon';
import { medicalCapacity } from '../../core/facilities';
import { Development, History, Modifications, PersonPicker, Relations } from './StaffCareer';
import { SQUAD_STATUS } from '../labels';

const RANKS = ['I', 'II', 'III', 'IV', 'V'];
type Tab = 'summary' | 'roster' | 'medical' | 'hiring' | 'development' | 'mods' | 'relations' | 'history';
const TABS: { id: Tab; label: string }[] = [
  { id: 'summary', label: 'Сводка' },
  { id: 'roster', label: 'Штат' },
  { id: 'medical', label: 'Медицина' },
  { id: 'hiring', label: 'Найм' },
  { id: 'development', label: 'Развитие' },
  { id: 'mods', label: 'Модификации' },
  { id: 'relations', label: 'Отношения' },
  { id: 'history', label: 'История' },
];
const PERSONAL: Tab[] = ['development', 'mods', 'relations', 'history'];
const STAT_LABEL: Record<keyof Stats, string> = { reaction: 'Реакция', analysis: 'Анализ', control: 'Контроль', resilience: 'Стойкость', authority: 'Авторитет' };
const DOSSIER: Record<DossierStatus, { mark: string; label: string }> = {
  verified: { mark: '✓', label: 'подтверждено' },
  reported: { mark: '', label: 'со слов' },
  unverified: { mark: '?', label: 'не проверено' },
  contested: { mark: '!', label: 'оспаривается' },
};

/** Кадры (W6, часть 1): сводка, штат и назначения (UI-14), медицина (UI-10), найм (UI-13). */
export function StaffScreen({ game, onClose }: { game: GameState; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('summary');
  const [personId, setPersonId] = useState('p1');
  const person = game.staff.find((p) => p.id === personId) ?? game.staff[0]!;
  const alive = game.staff.filter((p) => p.health !== 'dead').length;
  return (
    <section className="panel screen" role="region" aria-label="Кадры" data-testid="staff-screen">
      <div className="panel-header">
        <h2><Icon name="users" /> Кадры · {alive}</h2>
        <div className="tabs screen-tabs" role="tablist" aria-label="Разделы кадров">
          {TABS.map((t) => (
            <button key={t.id} role="tab" className="btn" aria-selected={tab === t.id} aria-pressed={tab === t.id} onClick={() => setTab(t.id)} data-testid={`staff-tab-${t.id}`}>{t.label}</button>
          ))}
        </div>
        <button className="btn icon-only" onClick={onClose} aria-label="Вернуться к карте"><Icon name="close" /></button>
      </div>
      <div className="panel-body">
        {tab === 'summary' && <Summary game={game} />}
        {tab === 'roster' && <Roster game={game} />}
        {tab === 'medical' && <Medical game={game} />}
        {tab === 'hiring' && <Hiring game={game} />}
        {PERSONAL.includes(tab) && (
          <div className="person-split">
            <PersonPicker game={game} selected={person.id} onSelect={setPersonId} archive={tab === 'history' || tab === 'relations'} />
            <div className="person-detail">
              <h3 className="person-name">{person.name}</h3>
              {tab === 'development' && <Development game={game} p={person} />}
              {tab === 'mods' && <Modifications game={game} p={person} />}
              {tab === 'relations' && <Relations game={game} p={person} />}
              {tab === 'history' && <History game={game} p={person} />}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function Summary({ game }: { game: GameState }) {
  return (
    <>
      <div className="table-scroll">
        <table className="staff-table">
          <thead>
            <tr><th>Сотрудник</th><th>Должность</th><th>Ранг</th><th>Отряд</th><th>Состояние</th><th>Усталость</th><th>Жалование</th></tr>
          </thead>
          <tbody>
            {game.staff.map((p) => {
              const sq = squadOf(game, p.id);
              const pt = patientOf(game, p.id);
              return (
                <tr key={p.id} data-testid={`staff-${p.id}`} className={p.health === 'dead' ? 'kia' : undefined}>
                  <td>{p.name}</td>
                  <td>{ROLE_LABEL[p.role]}</td>
                  <td>{RANKS[p.rank - 1]}</td>
                  <td>{p.health === 'dead' ? 'архив' : sq ? `«${sq.name}»` : 'резерв'}</td>
                  <td className={`health h-${p.health}`}>{HEALTH_LOG[p.health]}{pt ? ' · в клинике' : ''}{p.adaptation ? ' · адаптация' : ''}</td>
                  <td>{p.fatigue}%</td>
                  <td>{formatRe(p.salary)} РЕ</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="empty"><small>Имена и параметры временные (OPEN-08).</small></p>
    </>
  );
}

function Roster({ game }: { game: GameState }) {
  const res = reserve(game);
  const vac = vacancies(game);
  const open = (Object.keys(vac) as StaffRole[]).filter((r) => vac[r] > 0);
  const name = (id: string) => game.staff.find((p) => p.id === id)?.name ?? id;
  return (
    <div className="roster" data-testid="roster">
      <p className="muted deficit" data-testid="deficit">
        Вакансии: {open.length ? open.map((r) => `${ROLE_LABEL[r].toLowerCase()} (${vac[r]})`).join(', ') : 'нет'} · в резерве: {res.length}
      </p>
      <div className="card-grid">
        {game.squads.map((q) => {
          const busy = ['en_route', 'on_scene', 'returning'].includes(q.status);
          const cmd = squadCommander(game, q);
          const fit = q.memberIds.filter((id) => !memberBlocker(game, id, q.id)).length;
          return (
            <article key={q.id} className="sq-card" data-testid={`roster-${q.id}`}>
              <header>
                <b>«{q.name}»</b>
                <small className={`tone-${SQUAD_STATUS[q.status].tone}`}><span className="status">{SQUAD_STATUS[q.status].label}</span> · {q.memberIds.length}/3</small>
              </header>
              {fit === 0 && <p className="warn">Нет годных к выезду.</p>}
              <ul className="plain-list member-rows">
                {q.memberIds.map((id) => (
                  <li key={id}>
                    <span>{name(id)}{cmd?.id === id ? <em className="cmd"> · командир</em> : ''}<small>{ROLE_LABEL[game.staff.find((p) => p.id === id)!.role]}{memberBlocker(game, id, q.id) && !busy ? ` · ${memberBlocker(game, id, q.id)}` : ''}</small></span>
                    <span className="row-actions">
                      <button className="btn" disabled={busy || cmd?.id === id} onClick={() => dispatch({ type: 'SET_COMMANDER', squadId: q.id, staffId: id })} data-testid={`make-cmd-${id}`}>Командир</button>
                      <button className="btn" disabled={busy} onClick={() => dispatch({ type: 'UNASSIGN_STAFF', staffId: id })} data-testid={`to-reserve-${id}`}>В резерв</button>
                    </span>
                  </li>
                ))}
              </ul>
              {busy && <p className="hint">На задании: переводы после возвращения.</p>}
            </article>
          );
        })}
        <article className="sq-card reserve" data-testid="roster-reserve">
          <header><b>Резерв</b><small>{res.length} чел.</small></header>
          {res.length === 0 && <p className="muted">Все распределены по отрядам.</p>}
          <ul className="plain-list member-rows">
            {res.map((p) => (
              <li key={p.id}>
                <span>{p.name}<small>{ROLE_LABEL[p.role]} · {HEALTH_LOG[p.health]}{memberBlocker(game, p.id, '') ? ` · ${memberBlocker(game, p.id, '')}` : ''}</small></span>
                <span className="row-actions wrap">
                  {game.squads.filter((q) => q.status === 'ready' && q.memberIds.length < 3).map((q) => (
                    <button key={q.id} className="btn" onClick={() => dispatch({ type: 'ASSIGN_STAFF', staffId: p.id, squadId: q.id })} data-testid={`assign-${p.id}-${q.id}`}>→ «{q.name}»</button>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </article>
      </div>
    </div>
  );
}

function Medical({ game }: { game: GameState }) {
  const M = medicalCapacity(game);
  const injured = game.staff.filter((p) => TREATABLE.includes(p.health) && !patientOf(game, p.id));
  const name = (id: string) => game.staff.find((p) => p.id === id)?.name ?? id;
  return (
    <div data-testid="medical">
      <dl className="chips">
        <div><dt>Места</dt><dd data-testid="beds">{bedsUsed(game)} / {M.beds}</dd></div>
        <div><dt>Регенерационные капсулы</dt><dd>{capsulesUsed(game)} / {M.capsules}</dd></div>
        <div><dt>В очереди</dt><dd>{game.medical.patients.filter((p) => p.status === 'queued').length}</dd></div>
      </dl>
      <h4 className="section-title">В клинике</h4>
      {game.medical.patients.length === 0 ? <p className="muted">Никого.</p> : (
        <ul className="plain-list member-rows">
          {game.medical.patients.map((pt) => (
            <li key={pt.staffId} data-testid={`patient-${pt.staffId}`}>
              <span>{name(pt.staffId)}<small>{pt.kind === 'implant' ? `реабилитация после установки органа` : `${HEALTH_LOG[pt.injury]} · ${PLANS[pt.plan].label.toLowerCase()}`} · {pt.status === 'queued' ? 'ждёт места' : `ещё ${pt.shiftsLeft} смен.`}</small></span>
            </li>
          ))}
        </ul>
      )}
      <h4 className="section-title">Нуждаются в лечении</h4>
      {injured.length === 0 ? <p className="muted" data-testid="no-injured">Раненых без лечения нет. Лёгкие ранения заживают сами к следующей смене.</p> : (
        <div className="card-grid">
          {injured.map((p) => (
            <article key={p.id} className="sq-card" data-testid={`injured-${p.id}`}>
              <header><b>{p.name}</b><small className={`health h-${p.health}`}>{HEALTH_LOG[p.health]}</small></header>
              <ul className="pick-list one-col">
                {PLAN_IDS.map((plan) => {
                  const f = treatmentForecast(game, p.id, plan);
                  return (
                    <li key={plan}>
                      <button className="btn pick" disabled={!!f.blocker} onClick={() => dispatch({ type: 'START_TREATMENT', staffId: p.id, plan })} data-testid={`treat-${p.id}-${plan}`}>
                        <b>{PLANS[plan].label}{f.blocker ? '' : ` · ${formatRe(f.cost)} РЕ`}</b>
                        <small>{f.blocker ?? `${f.shifts} смен. · возвращение к смене ${f.returnShift}${f.queued ? ' (очередь)' : ''} · риск осложнения ${f.complication}`}</small>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function Hiring({ game }: { game: GameState }) {
  const vac = vacancies(game);
  const open = (Object.keys(vac) as StaffRole[]).filter((r) => vac[r] > 0);
  return (
    <div data-testid="hiring">
      <p className="muted">Вакансии: {open.length ? open.map((r) => `${ROLE_LABEL[r].toLowerCase()} (${vac[r]})`).join(', ') : 'нет — найм возможен после потерь или расширения штата'}.</p>
      <p className="hint">Пригодность считается по досье для выбранной вакансии, а не как общий рейтинг человека. Непроверенные сведения могут оказаться неверными.</p>
      <div className="card-grid">
        {game.candidates.map((c) => <CandidateCard key={c.id} game={game} c={c} />)}
      </div>
    </div>
  );
}

function CandidateCard({ game, c }: { game: GameState; c: Candidate }) {
  const fit = suitability(c);
  const keys = Object.keys(STAT_LABEL) as (keyof Stats)[];
  const checkCost = STAFF_RULES.deepCheck.cost;
  return (
    <article className="sq-card candidate" data-testid={`candidate-${c.id}`}>
      <header><b>{c.name}</b><small>{ROLE_LABEL[c.role]} · ранг {RANKS[c.rank - 1]}</small></header>
      <p className="fit">Пригодность: <b data-testid={`fit-${c.id}`}>{fit.word}</b>{fit.uncertain ? <small> · оценка неточная</small> : null}</p>
      <dl className="kv dossier">
        {keys.map((k) => (
          <FragmentRow key={k} label={STAT_LABEL[k]} value={`${c.dossier[k] === 'unverified' ? `${Math.max(1, c.reported[k] - 1)}–${Math.min(5, c.reported[k] + 1)}` : c.reported[k]} ${DOSSIER[c.dossier[k]].mark}`} title={DOSSIER[c.dossier[k]].label} />
        ))}
        <FragmentRow label="Найм" value={`${formatRe(c.hireCost)} РЕ`} />
        <FragmentRow label="Жалование" value={`${formatRe(c.salary)} РЕ/смена`} />
        <FragmentRow label="Адаптация" value={c.adaptation ? `${c.adaptation} смен.` : 'сразу'} />
        <FragmentRow label="Обязательства" value={c.patronKnown ? (c.patron ? `рекомендация: ${c.patron}` : 'не выявлены') : 'неизвестно'} />
      </dl>
      <div className="row-actions wrap">
        <button className="btn" disabled={c.check !== 'none'} onClick={() => dispatch({ type: 'DEEP_CHECK', candidateId: c.id })} data-testid={`check-${c.id}`}>
          {c.check === 'none' ? `Глубокая проверка · ${checkCost} РЕ` : c.check === 'pending' ? 'Проверка до следующей смены' : 'Проверен'}
        </button>
        <button className="btn primary" disabled={game.economy.balance < c.hireCost} onClick={() => dispatch({ type: 'HIRE', candidateId: c.id })} data-testid={`hire-${c.id}`}>
          Нанять
        </button>
      </div>
    </article>
  );
}

function FragmentRow({ label, value, title }: { label: string; value: string; title?: string }) {
  return (<><dt>{label}</dt><dd title={title}>{value}</dd></>);
}
