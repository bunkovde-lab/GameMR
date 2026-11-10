import { useEffect, useState } from 'react';
import type { GameState } from '../../core/types';
import { Icon } from '../Icon';
import { DirectorateOverview, directorateProblems } from '../screens/DirectorateScreen';

interface Props { game: GameState; onOpenDirectorate: () => void }

/**
 * Кнопка «Цели» в левом верхнем углу карты: раскрывает то же, что вкладка «Обзор» Дирекции
 * (касса, проблемы, приоритеты). По умолчанию свёрнута, чтобы не закрывать карту.
 */
export function GoalsDock({ game, onOpenDirectorate }: Props) {
  const [open, setOpen] = useState(false);
  const problems = directorateProblems(game);
  const bad = problems.some((p) => p.tone === 'bad');
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  return (
    <div className={`goals-dock${open ? ' open' : ''}`} data-testid="goals-dock">
      <button
        className="btn goals-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="goals-panel"
        data-testid="goals-toggle"
        title={open ? 'Свернуть цели' : 'Показать цели и проблемы'}
      >
        <Icon name="briefcase" /> <span className="label">Цели</span>
        {problems.length > 0 && <span className={`count${bad ? ' bad' : ''}`} data-testid="goals-count">{problems.length}</span>}
        <span className="chev" aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <section className="panel goals-panel" id="goals-panel" aria-label="Цели и проблемы" data-testid="goals-panel">
          <div className="panel-body">
            <DirectorateOverview game={game} testId="goals-overview" />
          </div>
          <div className="goals-foot">
            <button className="btn" onClick={() => { setOpen(false); onOpenDirectorate(); }} data-testid="goals-open-directorate">Открыть Дирекцию</button>
            <button className="btn" onClick={() => setOpen(false)} data-testid="goals-close">Свернуть</button>
          </div>
        </section>
      )}
    </div>
  );
}
