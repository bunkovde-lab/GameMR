import type { GameState } from '../core/types';
import { dispatch } from '../store';
import { Modal } from './Modal';

export function SandboxResultDialog({ game }: { game: GameState }) {
  const result = game.sandbox?.result;
  if (!result) return null;
  const acknowledge = () => dispatch({ type: 'ACK_SANDBOX_RESULT' });
  return (
    <Modal
      title={result.title}
      subtitle={`Дело №${result.caseId === 'c1' ? '418' : '431'} · Песочница`}
      onClose={acknowledge}
      testId="sandbox-result"
      footer={<button className="btn primary" onClick={acknowledge} data-testid="ack-sandbox-result">Продолжить</button>}
    >
      <p>{result.text}</p>
      {result.episode && <section className="sandbox-story-episode" data-testid="sandbox-episode"><h3 className="section-title">Сюжетный эпизод</h3><p>{result.episode}</p></section>}
      {result.complication && <p className="warn" data-testid="sandbox-complication"><b>Осложнение.</b> {result.complication}</p>}
      {result.outcome === 'error' && <p className="hint">Новая попытка уже доступна на карте. Провал отдельного выезда по-прежнему не перезапускает дело.</p>}
    </Modal>
  );
}

export function SandboxDefeatDialog({ game, onRestart, onMainMenu }: { game: GameState; onRestart: () => void; onMainMenu: () => void }) {
  const reason = game.sandbox?.defeatReason;
  if (!reason) return null;
  return (
    <Modal title="Сценарий завершён" subtitle="Песочница" testId="sandbox-defeat">
      <p className="warn">{reason}</p>
      <p>Можно начать сценарий заново: один район, один отряд и дело №418. Сохранения кампании не изменятся.</p>
      <div className="modal-actions wrap">
        <button className="btn primary" onClick={onRestart} data-testid="restart-sandbox">Новая песочница</button>
        <button className="btn" onClick={onMainMenu} data-testid="defeat-main-menu">Главное меню</button>
      </div>
    </Modal>
  );
}
