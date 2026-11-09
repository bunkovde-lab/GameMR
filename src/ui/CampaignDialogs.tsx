import { CAMPAIGN, computeEnding } from '../core/campaign';
import { caseDef } from '../core/investigations';
import { activeOp, opDef, optionBlocker, unseenOpReport } from '../core/specialOps';
import type { GameState } from '../core/types';
import { dispatch } from '../store';
import { ArtSlot, artUrl } from './art';
import { Modal } from './Modal';
import { Portrait } from './Portrait';

/** W9: окно особой операции (ТЗ §12). Пока оно открыто, время стоит; каждое решение — полчаса и последствия. */

const RISK_WORD = ['низкий', 'умеренный', 'высокий', 'очень высокий'];
const PHASES = ['Подход', 'Контакт', 'Кризис', 'Разрешение', 'Отчёт'];
const RESULT_WORD = { done: 'выполнено', partial: 'частично', failed: 'провалено' } as const;
const OUTCOME_WORD = { success: 'Операция успешна', partial: 'Операция выполнена частично', failure: 'Операция провалена' } as const;
const HEALTH_WORD: Record<string, string> = {
  healthy: 'в строю', fatigued: 'устал(а)', light_injury: 'лёгкое ранение', recovering: 'восстанавливается', serious_injury: 'тяжёлое ранение', critical: 'критическое состояние', missing: 'пропал(а)', dead: 'погиб(ла)',
};

export function SpecialOpDialog({ game }: { game: GameState }) {
  const op = activeOp(game);
  if (!op) return null;
  const d = opDef(op.id)!;
  const phase = d.phases[op.phase]!;
  const phaseKey = `${op.id}_phase_${phase.id}`;
  const members = op.memberIds.map((id) => game.staff.find((p) => p.id === id)!).filter(Boolean);
  return (
    <Modal title={`Особая операция «${d.title}»`} subtitle={`${phase.label} · фаза ${op.phase + 1} из ${d.phases.length}`} testId="special-op" className="wide op-dialog">
      <ArtSlot artKey={artUrl(phaseKey) ? phaseKey : d.art} label={`Операция «${d.title}», ${phase.label.toLowerCase()}`} className="op-art" />
      <ol className="op-steps" aria-label="Фазы операции">
        {PHASES.map((p, i) => <li key={p} className={i < op.phase ? 'done' : i === op.phase ? 'current' : ''}>{p}</li>)}
      </ol>
      {op.phase === 0 && <p>{d.brief}</p>}
      <div className="op-side">
        <div>
          <h5 className="section-title">Цели</h5>
          <ul className="plain-list">{d.objectives.map((o) => <li key={o.id}>{o.label}</li>)}</ul>
          <small className="muted">Все цели сразу выполнить нельзя. Каждая оценивается отдельно в отчёте.</small>
        </div>
        <div>
          <h5 className="section-title">Группа</h5>
          <ul className="plain-list op-team">
            {members.map((m) => <li key={m.id}><Portrait id={m.id} name={m.name} health={m.health} size="xs" /> {m.name}</li>)}
          </ul>
        </div>
      </div>
      <h5 className="section-title">Решение: {phase.label.toLowerCase()}</h5>
      <div className="op-options">
        {phase.options.map((o) => {
          const why = optionBlocker(game, op, o.id);
          return (
            <button key={o.id} className={`op-option${o.emergency ? ' emergency' : ''}`} disabled={!!why} onClick={() => dispatch({ type: 'SPECIAL_OP_CHOICE', opId: op.id, optionId: o.id })} data-testid={`op-choice-${o.id}`}>
              <b>{o.label}</b>
              <small>{o.text}</small>
              <span className="ev-tags">
                <span className={`tag${o.risk >= 2 ? ' bad' : o.risk === 1 ? ' mid' : ''}`}>риск для группы: {RISK_WORD[Math.min(3, o.risk)]}</span>
                {o.requires && <span className={`tag${why ? ' bad' : ' good'}`}>{o.requires === 'judicial' ? 'ордер' : 'допуск'}: {why ? 'нет' : 'есть'}</span>}
                {o.emergency && <span className="tag mid">чрезвычайное основание: проверка на следующей смене</span>}
              </span>
              {why && <small className="why">{why}</small>}
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

export function SpecialOpReportDialog({ game }: { game: GameState }) {
  const op = unseenOpReport(game);
  if (!op?.report) return null;
  const d = opDef(op.id)!;
  const r = op.report;
  return (
    <Modal title={`Отчёт: «${d.title}»`} subtitle={OUTCOME_WORD[r.outcome]} testId="special-op-report" className="wide">
      <ArtSlot artKey={d.art} label={`Операция «${d.title}»`} className="op-art short" />
      <table className="staff-table" data-testid="op-objectives">
        <tbody>
          {r.objectives.map((o) => (
            <tr key={o.id}><td>{o.label}</td><td className={o.result === 'done' ? 'good' : o.result === 'failed' ? 'bad' : 'mid'}>{RESULT_WORD[o.result]}</td></tr>
          ))}
        </tbody>
      </table>
      <h5 className="section-title">Сотрудники</h5>
      {r.casualties.length ? (
        <ul className="plain-list">{r.casualties.map((c) => <li key={c.staffId} className={c.after === 'dead' ? 'bad' : 'warn'}>{c.name}: {HEALTH_WORD[c.after]}</li>)}</ul>
      ) : <p className="good">Без потерь.</p>}
      {r.notes.map((n) => <p key={n} className="muted">{n}</p>)}
      <p className="muted"><small>Последствия для граждан, улик и политики уже учтены: смотрите дело №{caseDef(d.caseId)?.number}, журнал и раздел «Дирекция».</small></p>
      <div className="modal-actions">
        <button className="btn primary" onClick={() => dispatch({ type: 'ACK_SPECIAL_OP', opId: op.id })} data-testid="ack-special-op">Принять отчёт</button>
      </div>
    </Modal>
  );
}

export function EndingDialog({ game }: { game: GameState }) {
  const id = game.campaign.ending;
  if (!id || game.campaign.endingSeen) return null;
  const e = CAMPAIGN.endings[id];
  const reasons = computeEnding(game).reasons;
  return (
    <Modal title={e.title} subtitle={`Итог кампании «${CAMPAIGN.title}»`} testId="ending" className="wide">
      <ArtSlot artKey={e.art} label={`Финал «${e.title}»`} className="op-art" />
      <p>{e.text}</p>
      {reasons.length > 0 && (
        <>
          <h5 className="section-title">Что к этому привело</h5>
          <ul className="plain-list" data-testid="ending-reasons">{reasons.map((r) => <li key={r}>{r}</li>)}</ul>
        </>
      )}
      <div className="modal-actions">
        <button className="btn primary" onClick={() => dispatch({ type: 'ACK_ENDING' })} data-testid="ack-ending">К отчёту смены</button>
      </div>
    </Modal>
  );
}
