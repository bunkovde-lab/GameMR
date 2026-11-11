import { useState } from 'react';
import { caseDef } from '../../core/investigations';
import { SANDBOX_RULES } from '../../core/sandbox';
import { formatRe } from '../../core/selectors';
import type { GameState } from '../../core/types';
import { dispatch } from '../../store';
import { Icon } from '../Icon';

/** Статус сценария и покупка слота — без кампанских целей и завершения смены. */
export function SandboxDock({ game, onOpenCase }: { game: GameState; onOpenCase: () => void }) {
  const [open, setOpen] = useState(true);
  const sb = game.sandbox!;
  const active = caseDef(sb.activeCaseId);
  const cost = SANDBOX_RULES.squadSlotCostRe * 100;
  const reason = game.squads.length >= SANDBOX_RULES.maxSquads ? `Максимум ${SANDBOX_RULES.maxSquads} отряда`
    : game.squads.length >= sb.unlockedDistricts.length ? 'Сначала откройте следующий район расследованием'
      : game.economy.balance < cost ? `Нужно ${SANDBOX_RULES.squadSlotCostRe} РЕ` : null;
  return (
    <div className={`goals-dock sandbox-dock${open ? ' open' : ''}`} data-testid="sandbox-dock">
      <button className="btn goals-toggle" onClick={() => setOpen(!open)} aria-expanded={open} data-testid="sandbox-dock-toggle">
        <Icon name="shield" /><span className="label">Песочница</span><span className="chev">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <section className="panel goals-panel" aria-label="Состояние песочницы">
          <div className="panel-body">
            <h3 className="section-title">Активное дело</h3>
            <p className="sandbox-active-case"><b>№{active?.number} «{active?.title}»</b><small>{sb.unlockedDistricts.length} района открыто · {sb.controlledDistricts.length} под контролем</small></p>
            <button className="btn wide" onClick={onOpenCase} data-testid="sandbox-open-case"><Icon name="folder" /> Перейти к расследованию</button>
            <dl className="kv sandbox-vitals">
              <dt>Порядок</dt><dd data-testid="sandbox-order">{sb.order}%</dd>
              <dt>Легитимность</dt><dd>{sb.legitimacy}%</dd>
              <dt>Боеспособность</dt><dd>{sb.readiness}%</dd>
              <dt>Отряды</dt><dd>{game.squads.length} / {SANDBOX_RULES.maxSquads}</dd>
            </dl>
            <h3 className="section-title">Дополнительный отряд</h3>
            <p className="hint">Ускоряет выезды и даёт резерв, но не заменяет улики, связи и заключение.</p>
            <button className="btn primary wide" disabled={!!reason || !!sb.defeatReason} onClick={() => dispatch({ type: 'BUY_SANDBOX_SQUAD' })} data-testid="buy-sandbox-squad">
              <Icon name="users" /> Купить слот · {formatRe(cost)} РЕ
            </button>
            {reason && <small className="why" data-testid="buy-squad-reason">{reason}</small>}
          </div>
        </section>
      )}
    </div>
  );
}
