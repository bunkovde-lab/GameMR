import { tacticById } from '../../core/dispatch';
import {
  COALITIONS, HOUSES, POLITICS, activeDeals, approvalChance, chanceWord, coalitionStrong, dealDef, hasAccess, houseById, pendingPermit,
  permitFor, recentViolations, requestBlocker, requirementsFor, riskWord, standingWord, type DealDef,
} from '../../core/politics';
import { clockLabel, isOpen } from '../../core/selectors';
import type { GameState, Permit, PermitStatus } from '../../core/types';
import { dispatch } from '../../store';

/** W8: Дирекция — Полномочия (UI-19) и Политика Домов (UI-20). Все значения выводятся из ядра. */

const STATUS: Record<PermitStatus, { label: string; tone: string }> = {
  pending: { label: 'на рассмотрении', tone: 'mid' },
  granted: { label: 'выдано', tone: 'good' },
  denied: { label: 'отказано', tone: 'bad' },
  used: { label: 'использовано', tone: '' },
  expired: { label: 'истекло', tone: '' },
  justified: { label: 'проверка: обосновано', tone: 'good' },
  violation: { label: 'проверка: нарушение', tone: 'bad' },
};
const KIND: Record<Permit['kind'], string> = { judicial: 'Судебное', interagency: 'Межведомственное', emergency: 'Чрезвычайное' };
const sign = (v: number) => (v > 0 ? `+${v}` : `${v}`);

export function AuthorityTab({ game }: { game: GameState }) {
  const cases = game.incidents.filter((i) => isOpen(i) && requirementsFor(i).length);
  const permits = [...game.politics.permits].reverse();
  const viol = recentViolations(game);
  return (
    <div className="career" data-testid="dir-authority">
      <p className="hint">Высокий ранг не отменяет закон. Документ нужен под конкретный вызов и тактику. Действовать без него можно только по чрезвычайному основанию: это записывается на руководителя и проверяется в начале следующей смены.</p>
      <div className="table-scroll">
        <table className="staff-table levels" data-testid="authority-levels">
          <thead><tr><th>Уровень</th><th>Группа</th><th>Кто разрешает</th><th>Что допускает</th><th>Как получить</th></tr></thead>
          <tbody>
            {POLITICS.levels.map((l) => (
              <tr key={l.id}><td><b>{l.label}</b></td><td>{l.group}</td><td>{l.issuer}</td><td className="wrap">{l.examples}</td><td className="wrap">{l.how}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      {viol > 0 && <p className="warn" data-testid="violations">Нарушений по проверкам за последние смены: {viol}. Суд строже к запросам, следующие проверки жёстче.</p>}

      <h4 className="section-title">Вызовы, где нужен документ</h4>
      {cases.length === 0 ? <p className="muted" data-testid="no-cases">Сейчас нет открытых вызовов, для которых тактике нужен документ.</p> : (
        <div className="card-grid">
          {cases.map((inc) => (
            <article key={inc.id} className="sq-card" data-testid={`case-${inc.id}`}>
              <header><b>{inc.title}</b><small>{game.districts.find((d) => d.id === inc.districtId)?.name}</small></header>
              {requirementsFor(inc).map((r) => {
                const lvl = POLITICS.levels.find((l) => l.id === r.permit)!;
                const doc = permitFor(game, inc.id, r.permit);
                const wait = pendingPermit(game, inc.id, r.permit);
                const viaDeal = r.permit === 'interagency' && r.houseId && hasAccess(game, r.houseId);
                const why = requestBlocker(game, inc.id, r.permit);
                const fee = POLITICS.permits[r.permit].fee;
                return (
                  <div key={r.permit} className="case-req">
                    <p><b>{lvl.label}</b> · {r.tactics.map((t) => `«${tacticById(t).label}»`).join(', ')}</p>
                    <small className="muted">{r.why}</small>
                    <p data-testid={`case-status-${inc.id}`}>
                      {viaDeal ? <span className="tag good">допуск по договору с Домом</span>
                        : doc ? <span className="tag good">выдано до конца смены {doc.expiresShift}</span>
                        : wait ? <span className="tag">на рассмотрении, решение к {clock(game, wait.decideMinute ?? 0)}</span>
                        : <span className="tag">нет документа · {chanceWord(approvalChance(game, inc, r.permit))}</span>}
                    </p>
                    {!doc && !wait && !viaDeal && (
                      <>
                        <button className="btn" disabled={!!why} onClick={() => dispatch({ type: 'REQUEST_PERMIT', incidentId: inc.id, kind: r.permit })} data-testid={`request-${r.permit}-${inc.id}`}>
                          Запросить {r.permit === 'judicial' ? 'ордер' : 'допуск'}{fee ? ` · пошлина ${String(fee).replace('.', ',')} РЕ` : ''} · ≈{POLITICS.permits[r.permit].reviewMinutes} мин
                        </button>
                        {why && <small className="why">{why}</small>}
                      </>
                    )}
                  </div>
                );
              })}
            </article>
          ))}
        </div>
      )}

      <h4 className="section-title">Журнал разрешений</h4>
      {permits.length === 0 ? <p className="muted">Запросов и чрезвычайных действий ещё не было.</p> : (
        <div className="table-scroll">
          <table className="staff-table" data-testid="permits-table">
            <thead><tr><th>Вид</th><th>Цель и объём</th><th>Кто</th><th>Основание и требования</th><th>Срок / проверка</th><th>Риск проверки</th><th>Статус</th></tr></thead>
            <tbody>
              {permits.map((p) => (
                <tr key={p.id} data-testid={`permit-${p.id}`}>
                  <td>{KIND[p.kind]}</td>
                  <td className="wrap">{p.target}<br /><small className="muted">{p.scope.map((t) => tacticById(t).label.toLowerCase()).join(', ')}</small></td>
                  <td className="wrap">{p.issuer}</td>
                  <td className="wrap"><small>{p.legalBasis}<br />{p.requirements.join('; ')}</small></td>
                  <td>{p.reviewShift ? `проверка: смена ${p.reviewShift}` : `до конца смены ${p.expiresShift}`}</td>
                  <td>{p.kind === 'emergency' ? riskWord(p.auditRisk) : '—'}</td>
                  <td className={STATUS[p.status].tone}>{STATUS[p.status].label}{p.note ? <><br /><small className="muted">{p.note}</small></> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const clock = (game: GameState, m: number) => clockLabel({ ...game, minute: m });

function Terms({ def }: { def: DealDef }) {
  return (
    <dl className="kv terms">
      <dt>Выгода</dt><dd>{def.benefit}</dd>
      <dt>Политическая цена</dt><dd>{def.cost}</dd>
      <dt>Срок</dt><dd>{def.durationShifts} смен.</dd>
      <dt>Условия</dt><dd>{def.conditions.map((c) => c.text).join(' ')}</dd>
      <dt>Проверка</dt><dd>{def.verification}</dd>
      <dt>При нарушении</dt><dd>{def.breachText}{def.reprisal ? ` Позже: ${def.reprisal.text.toLowerCase()}` : ''}</dd>
    </dl>
  );
}

export function PoliticsTab({ game }: { game: GameState }) {
  const P = game.politics;
  const active = activeDeals(game);
  const past = P.deals.filter((d) => d.status !== 'active').slice().reverse();
  const events = game.log.filter((e) => /^(deal_|audit_|permit_|emergency_)/.test(e.type)).slice(-8).reverse();
  return (
    <div className="career" data-testid="dir-politics">
      <p className="hint">Шесть Домов — разные институты с внутренними течениями. Коалиции пересекают Дома. Названия Домов утверждены по лору; названия течений рабочие (OPEN-04).</p>
      <h4 className="section-title">Коалиции</h4>
      <div className="coalitions" data-testid="coalitions">
        {COALITIONS.map((c) => {
          const v = P.coalitions[c.id] ?? 0;
          const strong = coalitionStrong(game, c.id);
          return (
            <section key={c.id} className={`sq-card coalition${strong ? ' strong' : ''}`} data-testid={`coalition-${c.id}`}>
              <header><b>{c.label}</b><small>{v} из 100{strong ? ' · сильна' : ''}</small></header>
              <div className="meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={v} aria-label={`Влияние: ${c.label}`}>
                <span style={{ width: `${v}%` }} />
                <i style={{ left: `${POLITICS.threshold}%` }} aria-hidden="true" />
              </div>
              <small className="muted">{c.desc}</small>
              <small className={strong ? 'good' : 'muted'}>{c.effect}</small>
            </section>
          );
        })}
      </div>

      <h4 className="section-title">Дома</h4>
      <div className="card-grid houses">
        {HOUSES.map((h) => {
          const st = P.standing[h.id] ?? 0;
          const deal = active.find((d) => dealDef(d.templateId)?.houseId === h.id);
          return (
            <article key={h.id} className="sq-card" data-testid={`house-${h.id}`}>
              <header><b>{h.label}</b><small className={st >= 10 ? 'good' : st <= -10 ? 'bad' : undefined}>{sign(st)} · {standingWord(st)}</small></header>
              <small className="muted">Ведает: {h.controls}.</small>
              <ul className="plain-list currents">
                {h.currents.map((c) => <li key={c.label}>{c.label} · {COALITIONS.find((x) => x.id === c.coalition)!.label} · {c.share}%</li>)}
              </ul>
              {deal && <span className="tag good">договор до смены {deal.endShift}</span>}
            </article>
          );
        })}
      </div>

      <h4 className="section-title">Предложения</h4>
      {P.offers.length === 0 ? <p className="muted">Новых предложений нет. Они появляются в начале смены.</p> : (
        <div className="card-grid deals">
          {P.offers.map((o) => {
            const def = dealDef(o.templateId)!;
            const dup = active.some((d) => d.templateId === o.templateId);
            return (
              <article key={o.id} className="sq-card deal" data-testid={`offer-${o.templateId}`}>
                <header><b>{def.title}</b><small>{houseById(def.houseId)!.label} · до конца смены {o.expiresShift}</small></header>
                <Terms def={def} />
                <div className="row-actions wrap">
                  <button className="btn primary" disabled={dup} onClick={() => dispatch({ type: 'ACCEPT_DEAL', offerId: o.id })} data-testid={`accept-${o.templateId}`}>Принять договор</button>
                  <button className="btn" onClick={() => dispatch({ type: 'DECLINE_DEAL', offerId: o.id })} data-testid={`decline-${o.templateId}`}>Отклонить · отношения {POLITICS.declineStanding}</button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <h4 className="section-title">Действующие обязательства</h4>
      {active.length === 0 ? <p className="muted" data-testid="no-deals">Договоров нет.</p> : (
        <div className="card-grid deals">
          {active.map((d) => {
            const def = dealDef(d.templateId)!;
            return (
              <article key={d.id} className="sq-card deal" data-testid={`deal-${d.templateId}`}>
                <header><b>{def.title}</b><small>{houseById(def.houseId)!.label} · смены {d.acceptedShift}–{d.endShift}</small></header>
                <Terms def={def} />
                <button className="btn danger" onClick={() => dispatch({ type: 'BREAK_DEAL', dealId: d.id })} data-testid={`break-${d.templateId}`}>Расторгнуть: {def.breachText.toLowerCase()}</button>
              </article>
            );
          })}
        </div>
      )}

      {(past.length > 0 || events.length > 0) && (
        <>
          <h4 className="section-title">История</h4>
          <ul className="plain-list" data-testid="politics-history">
            {past.map((d) => <li key={d.id}>«{dealDef(d.templateId)?.title}»: {d.status === 'completed' ? 'исполнен' : 'нарушен'}.</li>)}
            {events.map((e) => <li key={e.id}><small className="muted">Смена {e.shift}.</small> {e.text}</li>)}
          </ul>
        </>
      )}
    </div>
  );
}
