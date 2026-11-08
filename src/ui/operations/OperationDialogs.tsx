import { tacticById } from '../../core/dispatch';
import { HEALTH_LOG } from '../../core/healthText';
import { optionPDelta, pendingDecision } from '../../core/operations';
import type { GameState, OperationReport } from '../../core/types';
import { dispatch } from '../../store';
import { Modal } from '../Modal';
import { Portrait } from '../Portrait';

const OUTCOME: Record<OperationReport['outcome'], { label: string; tone: string }> = {
  success: { label: 'Успех', tone: 'good' },
  partial: { label: 'Частичный успех', tone: 'mid' },
  failure: { label: 'Провал', tone: 'bad' },
};
const TASK: Record<OperationReport['tasks'][number]['result'], string> = { done: 'выполнено', partial: 'частично', failed: 'не выполнено' };

/**
 * DECISION_PAUSE (ТЗ §2.2, §12): доклад командира и 2–3 приказа. Пока окно открыто, время стоит;
 * выбранный приказ тратит указанные минуты. Вероятности не показываются — только смысл и цена решения.
 */
export function DecisionDialog({ game }: { game: GameState }) {
  const p = pendingDecision(game);
  if (!p) return null;
  const op = p.squad.operation!;
  const commander = game.staff.find((x) => x.id === op.commanderId);
  return (
    <Modal
      title={`${p.stage.phase}: ${p.stage.title}`}
      subtitle={`${p.incident.title} · отряд «${p.squad.name}» · этап ${p.index + 1} из ${p.total}`}
      testId="decision-dialog"
      className="wide"
    >
      <p className="hint">Время остановлено до приказа.</p>
      <blockquote className={`report-quote${commander ? ' with-face' : ''}`}>
        {commander && <Portrait id={commander.id} name={commander.name} health={commander.health} size="sm" />}
        <div>
          {p.stage.text}
          {commander && <footer>— {commander.name}, командир группы</footer>}
        </div>
      </blockquote>
      {op.decisions.length > 0 && (
        <ol className="plain-list decisions-so-far">
          {op.decisions.map((d, i) => <li key={i}><b>{d.stage}:</b> {d.result}</li>)}
        </ol>
      )}
      <h4 className="section-title">Приказ</h4>
      <ul className="pick-list options">
        {p.stage.options.map((o) => {
          const missing = o.needsEquipment && optionPDelta(game, op, o) !== o.pDelta;
          return (
            <li key={o.id}>
              <button className="btn pick" onClick={() => dispatch({ type: 'CHOOSE_OPTION', squadId: p.squad.id, optionId: o.id })} data-testid={`option-${o.id}`}>
                <b>{o.label}</b>
                <small>{o.hint}{missing ? ' · снаряжения нет' : ''} · ≈{o.minutes} мин</small>
              </button>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}

/** Отчёт после операции (ТЗ §12): исход, задачи, люди, снаряжение, город. */
export function OperationReportDialog({ game }: { game: GameState }) {
  const r = game.operationReports.find((x) => !x.seen);
  if (!r) return null;
  const o = OUTCOME[r.outcome];
  const ack = () => dispatch({ type: 'ACK_OPERATION_REPORT', reportId: r.id });
  return (
    <Modal
      title="Отчёт об операции"
      subtitle={`${r.incidentTitle} · отряд «${r.squadName}» · ${tacticById(r.tactic).label.toLowerCase()}`}
      onClose={ack}
      testId="operation-report"
      className="wide"
      footer={<button className="btn primary" onClick={ack} data-testid="ack-report">Принято</button>}
    >
      <p className={`outcome ${o.tone}`} data-testid="report-outcome">{o.label}</p>
      <div className="report-grid">
        <section>
          <h4 className="section-title">Задачи</h4>
          <ul className="plain-list task-list">
            {r.tasks.map((t) => <li key={t.label} className={`task ${t.result}`}><span>{t.label}</span><b>{TASK[t.result]}</b></li>)}
          </ul>
          {r.decisions.length > 0 && (
            <>
              <h4 className="section-title">Ход операции</h4>
              <ol className="plain-list">{r.decisions.map((d, i) => <li key={i}><b>{d.stage}:</b> {d.result}</li>)}</ol>
            </>
          )}
        </section>
        <section>
          <h4 className="section-title">Личный состав</h4>
          <div className="report-faces" data-testid="report-faces">
            {r.memberIds.map((id) => {
              const m = game.staff.find((x) => x.id === id);
              return m ? <Portrait key={id} id={id} name={m.name} health={m.health} size="sm" /> : null;
            })}
          </div>
          {r.casualties.length === 0
            ? <p className="muted" data-testid="report-no-casualties">Без потерь и ранений.</p>
            : (
              <ul className="plain-list" data-testid="report-casualties">
                {r.casualties.map((c) => <li key={c.staffId} className={`face-row${c.after === 'dead' ? ' kia' : ''}`}><Portrait id={c.staffId} name={c.name} health={c.after} size="sm" /><span><b>{c.name}</b>: {HEALTH_LOG[c.after]}</span></li>)}
              </ul>
            )}
          <p className="hint">Опыт +{r.xp} выжившим, усталость +{r.fatigue}.</p>
          <h4 className="section-title">Снаряжение</h4>
          <ul className="plain-list">
            {r.equipment.length === 0 && <li className="muted">не брали</li>}
            {r.equipment.map((e) => <li key={e.id}>{e.label}: {e.state === 'consumed' ? 'израсходовано' : e.state === 'damaged' ? 'повреждено' : 'возвращается на склад'}</li>)}
          </ul>
          <h4 className="section-title">Район</h4>
          <p className="muted">Безопасность {signed(r.district.safety)}, доверие {signed(r.district.trust)}.</p>
        </section>
      </div>
    </Modal>
  );
}

const signed = (v: number) => (v > 0 ? `+${v}` : v < 0 ? `−${-v}` : '0');
