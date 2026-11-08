import { formatRe, isOpen } from '../core/selectors';
import type { GameState } from '../core/types';
import { dispatch } from '../store';
import { Modal } from './Modal';
import { StoryCard } from './screens/CampaignPanel';

export function BriefingDialog({ game, onOpenSettings }: { game: GameState; onOpenSettings: () => void }) {
  const open = game.incidents.filter(isOpen);
  const ready = game.squads.filter((q) => q.status === 'ready').length;
  return (
    <Modal title={`Смена ${game.shift} · брифинг`} testId="briefing">
      <dl className="kv">
        <dt>Касса</dt><dd>{formatRe(game.economy.balance)} РЕ</dd>
        <dt>Открытые вызовы</dt><dd>{open.length}</dd>
        <dt>Готовые отряды</dt><dd>{ready} из {game.squads.length}</dd>
      </dl>
      <StoryCard game={game} compact />
      <div className="modal-actions">
        <button className="btn" onClick={onOpenSettings} data-testid="briefing-saves">Сохранения</button>
        <button className="btn primary" onClick={() => dispatch({ type: 'START_SHIFT' })} data-testid="start-shift">
          Начать смену
        </button>
      </div>
    </Modal>
  );
}

export function EndShiftConfirm({ game, onCancel }: { game: GameState; onCancel: () => void }) {
  const open = game.incidents.filter(isOpen).length;
  return (
    <Modal title="Завершить смену?" onClose={onCancel} testId="end-shift-confirm">
      <p>Открытых вызовов: {open}. Они перейдут в следующую смену. Будут начислены финансирование и жалование.</p>
      <div className="modal-actions">
        <button className="btn" onClick={onCancel}>Отмена</button>
        <button className="btn primary" onClick={() => { dispatch({ type: 'END_SHIFT' }); onCancel(); }} data-testid="confirm-end-shift">
          Завершить смену
        </button>
      </div>
    </Modal>
  );
}

export function ShiftReportDialog({ game }: { game: GameState }) {
  const report = game.reports[game.reports.length - 1];
  const ledger = game.economy.ledger.filter((t) => t.shift === game.shift);
  if (!report) return null;
  return (
    <Modal title={`Итоги смены ${report.shift}`} testId="shift-report">
      <dl className="kv">
        <dt>Касса на начало</dt><dd>{formatRe(report.openingBalance)} РЕ</dd>
        {ledger.map((t) => (
          <FragmentRow key={t.id} label={t.note} value={`${t.amount >= 0 ? '+' : ''}${formatRe(t.amount)} РЕ`} />
        ))}
        <dt>Касса на конец</dt><dd data-testid="closing-balance">{formatRe(report.closingBalance)} РЕ</dd>
        {report.unpaid > 0 && (<><dt>Невыплаченные обязательства</dt><dd>{formatRe(report.unpaid)} РЕ</dd></>)}
        <dt>Открытых вызовов</dt><dd>{report.openIncidents}</dd>
        <dt>Из них с ухудшением</dt><dd>{report.escalatedIncidents}</dd>
        <dt>Операции: успех / частично / провал</dt><dd data-testid="report-ops">{report.operations.success} / {report.operations.partial} / {report.operations.failure}</dd>
        <dt>Ранены</dt><dd data-testid="report-injured">{report.injured}</dd>
        <dt>Погибли</dt><dd data-testid="report-killed">{report.killed}</dd>
      </dl>
      <p className="hint">Числа взяты из журнала транзакций и отчётов об операциях смены.</p>
      <div className="modal-actions">
        <button className="btn primary" onClick={() => dispatch({ type: 'ADVANCE_SHIFT' })} data-testid="next-shift">
          Следующая смена
        </button>
      </div>
    </Modal>
  );
}

function FragmentRow({ label, value }: { label: string; value: string }) {
  return (<><dt>{label}</dt><dd>{value}</dd></>);
}
