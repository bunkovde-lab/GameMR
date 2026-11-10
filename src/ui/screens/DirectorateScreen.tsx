import { useState } from 'react';
import { ROLE_LABEL } from '../../core/content';
import {
  FACILITIES, SUBSIDY, buildSlots, facilityDef, financeSummary, levelDef, nextLevelDef, upgradeBlocker,
} from '../../core/facilities';
import { citySafety, formatRe } from '../../core/selectors';
import { TREATABLE, patientOf, vacancies } from '../../core/staff';
import type { GameState, StaffRole, TransactionKind } from '../../core/types';
import { dispatch } from '../../store';
import { Icon } from '../Icon';
import { artUrl } from '../art';
import { ProjectsTab } from './ProjectsTab';
import { AuthorityTab, PoliticsTab } from './PoliticsTabs';
import { politicsSummary } from '../../core/politics';

type Tab = 'overview' | 'finance' | 'infra' | 'projects' | 'authority' | 'politics';
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Обзор' },
  { id: 'finance', label: 'Финансы' },
  { id: 'infra', label: 'Инфраструктура' },
  { id: 'projects', label: 'Проекты' },
  { id: 'authority', label: 'Полномочия' },
  { id: 'politics', label: 'Политика Домов' },
];

const KIND_LABEL: Record<TransactionKind, string> = {
  funding: 'Финансирование', subsidy: 'Субсидия', salary: 'Жалование', upkeep: 'Содержание объектов', dispatch: 'Выезды',
  treatment: 'Лечение', hiring: 'Найм', check: 'Проверки', training: 'Обучение', promotion: 'Аттестация', implant: 'Органы',
  construction: 'Строительство', research: 'Исследования', fabrication: 'Изготовление',
  permit_fee: 'Пошлины', sanction: 'Санкции', deal: 'Договоры с Домами', expertise: 'Экспертизы',
};

/** W7 (часть 1): Дирекция — обзор (UI-15), финансы (UI-16), инфраструктура (UI-17). */
export function DirectorateScreen({ game, onClose }: { game: GameState; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('overview');
  return (
    <section className="panel screen" role="region" aria-label="Дирекция" data-testid="directorate-screen">
      <div className="panel-header">
        <h2><Icon name="briefcase" /> Дирекция</h2>
        <div className="tabs screen-tabs" role="tablist" aria-label="Разделы дирекции">
          {TABS.map((t) => (
            <button key={t.id} role="tab" className="btn" aria-selected={tab === t.id} onClick={() => setTab(t.id)} data-testid={`dir-tab-${t.id}`}>{t.label}</button>
          ))}
        </div>
        <button className="btn icon-only" onClick={onClose} aria-label="Вернуться к карте"><Icon name="close" /></button>
      </div>
      <div className="panel-body">
        {tab === 'overview' && <Overview game={game} />}
        {tab === 'finance' && <Finance game={game} />}
        {tab === 'infra' && <Infrastructure game={game} />}
        {tab === 'projects' && <ProjectsTab game={game} />}
        {tab === 'authority' && <AuthorityTab game={game} />}
        {tab === 'politics' && <PoliticsTab game={game} />}
      </div>
    </section>
  );
}

function Overview({ game }: { game: GameState }) {
  const f = financeSummary(game);
  const vac = vacancies(game);
  const openVac = (Object.keys(vac) as StaffRole[]).filter((r) => vac[r] > 0);
  const untreated = game.staff.filter((p) => TREATABLE.includes(p.health) && p.health !== 'light_injury' && !patientOf(game, p.id));
  const damaged = game.equipment.filter((u) => u.state === 'damaged').length;
  const blocked = game.construction.filter((b) => b.status === 'blocked');
  const problems: { tone: 'bad' | 'warn'; text: string }[] = [];
  if (f.unpaid > 0) problems.push({ tone: 'bad', text: `Долг по обязательствам: ${formatRe(f.unpaid)} РЕ.` });
  if (f.free < 0) problems.push({ tone: 'bad', text: `Свободных средств не хватает на ближайшую смену: ${formatRe(f.free)} РЕ.` });
  if (untreated.length) problems.push({ tone: 'bad', text: `Тяжелораненые без лечения: ${untreated.map((p) => p.name).join(', ')}.` });
  for (const b of blocked) problems.push({ tone: 'warn', text: `${facilityDef(b.facilityId).label}: стройка остановлена, нет средств на этап.` });
  if (damaged) problems.push({ tone: 'warn', text: `Повреждённое снаряжение: ${damaged} ед. (ремонт в техсекторе между сменами).` });
  const pol = politicsSummary(game);
  if (pol.violations) problems.push({ tone: 'bad', text: `Нарушения по проверкам за последние смены: ${pol.violations}. Суд строже к запросам.` });
  if (pol.reviews) problems.push({ tone: 'warn', text: `Чрезвычайные действия ждут проверки: ${pol.reviews}.` });
  if (openVac.length) problems.push({ tone: 'warn', text: `Вакансии: ${openVac.map((r) => `${ROLE_LABEL[r].toLowerCase()} (${vac[r]})`).join(', ')}.` });
  const nextSubsidy = SUBSIDY.shifts.find((x) => x >= game.shift);
  return (
    <div className="career" data-testid="dir-overview">
      <dl className="chips">
        <div><dt>Касса</dt><dd>{formatRe(f.balance)} РЕ</dd></div>
        <div><dt>Свободно</dt><dd className={f.free < 0 ? 'neg' : undefined} data-testid="overview-free">{formatRe(f.free)} РЕ</dd></div>
        <div><dt>Безопасность города</dt><dd>{citySafety(game)}%</dd></div>
        <div><dt>Стройка</dt><dd>{game.construction.length ? `${game.construction.length} раб.` : 'нет'}</dd></div>
      </dl>
      <h4 className="section-title">Проблемы</h4>
      {problems.length === 0 ? <p className="muted">Критических проблем нет.</p> : (
        <ul className="plain-list problems" data-testid="problems">
          {problems.map((p) => <li key={p.text} className={p.tone}>{p.text}</li>)}
        </ul>
      )}
      <h4 className="section-title">Приоритеты</h4>
      <ul className="plain-list">
        {nextSubsidy && <li>Субсидия {SUBSIDY.amount} РЕ после смены {nextSubsidy}, если безопасность города не ниже {SUBSIDY.minSafety}% (сейчас {citySafety(game)}%). Не гарантирована.</li>}
        <li>Монтажных бригад: {buildSlots(game)}. Остальные работы ждут очереди.</li>
        <li>Договоры с Домами: действуют {pol.deals}, предложений {pol.offers}. Запросов разрешений на рассмотрении: {pol.pending}.</li>
      </ul>
    </div>
  );
}

function Finance({ game }: { game: GameState }) {
  const f = financeSummary(game);
  const reports = game.reports.slice(-6);
  const max = Math.max(1, ...reports.flatMap((r) => [r.income, r.expenses]));
  const cur = game.economy.ledger.filter((t) => t.shift === game.shift);
  const byKind = new Map<TransactionKind, number>();
  for (const t of cur) byKind.set(t.kind, (byKind.get(t.kind) ?? 0) + t.amount);
  return (
    <div className="career" data-testid="dir-finance">
      <div className="fin-grid">
        <section className="sq-card">
          <header><b>Деньги</b></header>
          <dl className="kv">
            <dt>В кассе</dt><dd>{formatRe(f.balance)} РЕ</dd>
            <dt>Зарезервировано (стройка)</dt><dd data-testid="fin-reserved">{f.reserved ? '−' : ''}{formatRe(f.reserved)} РЕ</dd>
            <dt>Обязательства ближайшей смены</dt><dd>−{formatRe(f.obligations)} РЕ</dd>
            <dt><b>Распределяемый фонд</b></dt><dd data-testid="fin-free" className={f.free < 0 ? 'neg' : undefined}>{formatRe(f.free)} РЕ</dd>
          </dl>
          <p className="hint">Обязательные расходы нельзя «сдвинуть ползунком»: они списываются в конце смены. Не хватит денег — возникнет долг.</p>
        </section>
        <section className="sq-card">
          <header><b>Защищённые обязательства</b></header>
          <dl className="kv">
            <dt>Жалование</dt><dd>{formatRe(f.salary)} РЕ</dd>
            <dt>Содержание объектов</dt><dd>{formatRe(f.upkeep)} РЕ</dd>
            <dt>Платежи по договорам</dt><dd data-testid="fin-deals">{formatRe(f.deals)} РЕ</dd>
            <dt>Долг</dt><dd>{formatRe(f.unpaid)} РЕ</dd>
          </dl>
        </section>
        <section className="sq-card">
          <header><b>Смена {game.shift}: движение средств</b></header>
          {cur.length === 0 ? <p className="muted">Операций пока нет.</p> : (
            <dl className="kv">
              {[...byKind].map(([k, v]) => <FragmentRow key={k} label={KIND_LABEL[k]} value={`${v > 0 ? '+' : ''}${formatRe(v)} РЕ`} />)}
            </dl>
          )}
        </section>
      </div>
      <h4 className="section-title">Последние смены</h4>
      {reports.length === 0 ? <p className="muted">Отчётов смен ещё нет: график появится после первой смены.</p> : (
        <>
          <div className="fin-legend" aria-hidden="true"><span className="sw inc" /> Поступления <span className="sw exp" /> Расходы</div>
          <div className="fin-chart" role="img" aria-label="Поступления и расходы по сменам" data-testid="fin-chart">
            {reports.map((r) => (
              <div key={r.shift} className="fin-col">
                <div className="fin-bars">
                  <span className="bar inc" style={{ height: `${(r.income / max) * 100}%` }} title={`Смена ${r.shift}: поступления ${formatRe(r.income)} РЕ`} />
                  <span className="bar exp" style={{ height: `${(r.expenses / max) * 100}%` }} title={`Смена ${r.shift}: расходы ${formatRe(r.expenses)} РЕ`} />
                </div>
                <small>См. {r.shift}</small>
              </div>
            ))}
          </div>
          <div className="table-scroll">
            <table className="staff-table">
              <thead><tr><th>Смена</th><th>Начало</th><th>Поступления</th><th>Расходы</th><th>Конец</th><th>Долг</th></tr></thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.shift}><td>{r.shift}</td><td>{formatRe(r.openingBalance)}</td><td>+{formatRe(r.income)}</td><td>−{formatRe(r.expenses)}</td><td>{formatRe(r.closingBalance)}</td><td>{formatRe(r.unpaid)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Infrastructure({ game }: { game: GameState }) {
  const slots = buildSlots(game);
  return (
    <div className="career" data-testid="dir-infra">
      {game.construction.length > 0 && (
        <section className="sq-card" data-testid="build-queue">
          <header><b>Строительная очередь</b><small>бригад: {slots}</small></header>
          <ol className="plain-list member-rows">
            {game.construction.map((b, i) => {
              const def = facilityDef(b.facilityId);
              const st = b.status === 'active' ? 'идёт' : b.status === 'blocked' ? 'остановлено: нет средств' : 'ждёт бригаду';
              return (
                <li key={b.facilityId}>
                  <span><b>{def.label} → ур. {b.toLevel}</b><small>{st} · этап {b.shiftsDone} из {b.shiftsTotal} · оплачено {formatRe(b.paid)} из {formatRe(b.cost)} РЕ</small></span>
                  <span className="row-actions">
                    <button className="btn" disabled={i === 0} onClick={() => dispatch({ type: 'PRIORITIZE_UPGRADE', facilityId: b.facilityId })} data-testid={`prio-${b.facilityId}`}>Первой</button>
                    <button className="btn danger" onClick={() => dispatch({ type: 'CANCEL_UPGRADE', facilityId: b.facilityId })} data-testid={`cancel-${b.facilityId}`}>Отменить</button>
                  </span>
                </li>
              );
            })}
          </ol>
          <p className="hint">Этап оплачивается между сменами. Отмена возвращает только неоплаченный остаток резерва.</p>
        </section>
      )}
      <div className="card-grid">
        {FACILITIES.map((fd) => {
          const lv = levelDef(game, fd.id);
          const next = nextLevelDef(game, fd.id);
          const queued = game.construction.some((b) => b.facilityId === fd.id);
          const why = queued ? null : upgradeBlocker(game, fd.id);
          return (
            <article key={fd.id} className="sq-card facility" data-testid={`facility-${fd.id}`}>
              {artUrl(`facility_${fd.id}`) && <div className="fac-art" role="img" aria-label={fd.label} style={{ backgroundImage: `url(${artUrl(`facility_${fd.id}`)})` }} data-testid={`fac-art-${fd.id}`} />}
              <header><b>{fd.label}</b><small>ур. {game.facilities[fd.id]}</small></header>
              <p className="fac-now">{lv.gives}</p>
              <small className="muted">Содержание: {lv.upkeep ? `${lv.upkeep} РЕ/смена` : 'входит в базовое финансирование'}</small>
              {next ? (
                <>
                  <small className="muted">Ур. {next.level}: {next.gives} Содержание {next.upkeep} РЕ/смена.</small>
                  <button className="btn" disabled={queued || !!why} onClick={() => dispatch({ type: 'QUEUE_UPGRADE', facilityId: fd.id })} data-testid={`upgrade-${fd.id}`}>
                    {queued ? 'В очереди' : `Улучшить · ${next.cost} РЕ · ${next.shifts} смен.`}
                  </button>
                  {why && <small className="why">{why}</small>}
                </>
              ) : <small className="why">{fd.lockedNote ?? 'Предельный уровень.'}</small>}
            </article>
          );
        })}
      </div>
    </div>
  );
}

function FragmentRow({ label, value }: { label: string; value: string }) {
  return (<><dt>{label}</dt><dd>{value}</dd></>);
}
