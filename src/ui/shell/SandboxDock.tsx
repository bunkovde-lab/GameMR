import { useState } from 'react';
import { caseDef } from '../../core/investigations';
import { SANDBOX_RULES } from '../../core/sandbox';
import { formatRe } from '../../core/selectors';
import type { GameState } from '../../core/types';
import { dispatch } from '../../store';
import { Icon } from '../Icon';

/** Статус сценария, покупка слота, статистика и прогрессия — без кампанских целей. */
export function SandboxDock({ game, onOpenCase }: { game: GameState; onOpenCase: () => void }) {
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<'status' | 'stats' | 'records'>('status');
  const sb = game.sandbox!;
  const active = caseDef(sb.activeCaseId);
  const cost = SANDBOX_RULES.squadSlotCostRe * 100;
  const reason = game.squads.length >= SANDBOX_RULES.maxSquads ? `Максимум ${SANDBOX_RULES.maxSquads} отряда`
    : game.squads.length >= sb.unlockedDistricts.length ? 'Сначала откройте следующий район расследованием'
      : game.economy.balance < cost ? `Нужно ${SANDBOX_RULES.squadSlotCostRe} РЕ` : null;

  const stats = sb.stats;
  const records = sb.records ?? [];
  const prog = sb.progression;
  const nextDistrict = prog?.nextDistrict;
  const reNeed = 15;
  const orderNeed = 50;
  const rePct = Math.min(100, Math.round(((prog?.reProgress ?? 0) / reNeed) * 100));
  const orderPct = Math.min(100, Math.round(((prog?.orderProgress ?? 0) / orderNeed) * 100));

  return (
    <div className={`goals-dock sandbox-dock${open ? ' open' : ''}`} data-testid="sandbox-dock">
      <button className="btn goals-toggle" onClick={() => setOpen(!open)} aria-expanded={open} data-testid="sandbox-dock-toggle">
        <Icon name="shield" /><span className="label">Песочница</span><span className="chev">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <section className="panel goals-panel" aria-label="Состояние песочницы">
          <div className="panel-body">
            <div className="dock-tabs" role="tablist">
              <button className={`dock-tab${tab === 'status' ? ' active' : ''}`} onClick={() => setTab('status')} role="tab" aria-selected={tab === 'status'}>Статус</button>
              <button className={`dock-tab${tab === 'stats' ? ' active' : ''}`} onClick={() => setTab('stats')} role="tab" aria-selected={tab === 'stats'}>Статистика</button>
              {records.length > 0 && (
                <button className={`dock-tab${tab === 'records' ? ' active' : ''}`} onClick={() => setTab('records')} role="tab" aria-selected={tab === 'records'}>Рекорды</button>
              )}
            </div>

            {tab === 'status' && (
              <>
                <h3 className="section-title">Активное дело</h3>
                <p className="sandbox-active-case"><b>№{active?.number} «{active?.title}»</b><small>{sb.unlockedDistricts.length} района открыто · {sb.controlledDistricts.length} под контролем</small></p>
                <button className="btn wide" onClick={onOpenCase} data-testid="sandbox-open-case"><Icon name="folder" /> Перейти к расследованию</button>
                <dl className="kv sandbox-vitals">
                  <dt>Порядок</dt><dd data-testid="sandbox-order">{sb.order}%</dd>
                  <dt>Легитимность</dt><dd>{sb.legitimacy}%</dd>
                  <dt>Боеспособность</dt><dd>{sb.readiness}%</dd>
                  <dt>Отряды</dt><dd>{game.squads.length} / {SANDBOX_RULES.maxSquads}</dd>
                </dl>
                <section className="sandbox-duty-status" data-testid="sandbox-duty-status">
                  <h3 className="section-title">Дежурный фон</h3>
                  <p className="hint">Обычные вызовы: {game.incidents.filter((i) => i.duty && ['new', 'acknowledged', 'escalated', 'en_route', 'on_scene'].includes(i.state)).length} / 2. {sb.duty.nextAt === null ? 'Начнутся после первого выезда по делу.' : 'Не связаны с расследованием; можно передать наряду.'}</p>
                </section>
                <h3 className="section-title">Дополнительный отряд</h3>
                <p className="hint">Ускоряет выезды и даёт резерв, но не заменяет улики, связи и заключение.</p>
                <button className="btn primary wide" disabled={!!reason || !!sb.defeatReason} onClick={() => dispatch({ type: 'BUY_SANDBOX_SQUAD' })} data-testid="buy-sandbox-squad">
                  <Icon name="users" /> Купить слот · {formatRe(cost)} РЕ
                </button>
                {reason && <small className="why" data-testid="buy-squad-reason">{reason}</small>}

                {nextDistrict && (
                  <section className="sandbox-progression" data-testid="sandbox-progression">
                    <h3 className="section-title">Прогрессия: следующий район</h3>
                    <p className="hint">Альтернатива расследованию — открыть район через достижения.</p>
                    <div className="progress-row">
                      <span className="progress-label">РЕ заработано</span>
                      <div className="progress-bar"><div className="progress-fill" style={{ width: `${rePct}%` }} /></div>
                      <span className="progress-value">{prog?.reProgress ?? 0} / {reNeed}</span>
                    </div>
                    <div className="progress-row">
                      <span className="progress-label">Порядок</span>
                      <div className="progress-bar"><div className="progress-fill order" style={{ width: `${orderPct}%` }} /></div>
                      <span className="progress-value">{prog?.orderProgress ?? 0}% / {orderNeed}%</span>
                    </div>
                    <p className="hint">Следующий: {game.districts.find((d) => d.id === nextDistrict)?.name ?? nextDistrict}</p>
                  </section>
                )}
              </>
            )}

            {tab === 'stats' && stats && (
              <section className="sandbox-stats" data-testid="sandbox-stats">
                <h3 className="section-title">Статистика сессии</h3>
                <dl className="kv compact">
                  <dt>Смен прожито</dt><dd>{stats.shiftsSurvived}</dd>
                  <dt>Минут в игре</dt><dd>{stats.minutesPlayed}</dd>
                  <dt>Районов открыто</dt><dd>{stats.districtsOpened}</dd>
                  <dt>Дел завершено</dt><dd>{stats.casesCompleted}</dd>
                  <dt>Дел провалено</dt><dd>{stats.casesFailed}</dd>
                </dl>
                <h4 className="subsection-title">Дежурные вызовы</h4>
                <dl className="kv compact">
                  <dt>Всего</dt><dd>{stats.dutyTotal}</dd>
                  <dt>Успех</dt><dd className="ok">{stats.dutySuccess}</dd>
                  <dt>Частично</dt><dd className="warn">{stats.dutyPartial}</dd>
                  <dt>Провал</dt><dd className="bad">{stats.dutyFailure}</dd>
                  <dt>Делегировано</dt><dd>{stats.dutyDelegated}</dd>
                  <dt>Проигнорировано</dt><dd>{stats.dutyIgnored}</dd>
                </dl>
                <h4 className="subsection-title">Операции по делам</h4>
                <dl className="kv compact">
                  <dt>Всего</dt><dd>{stats.opsTotal}</dd>
                  <dt>Успех</dt><dd className="ok">{stats.opsSuccess}</dd>
                  <dt>Частично</dt><dd className="warn">{stats.opsPartial}</dd>
                  <dt>Провал</dt><dd className="bad">{stats.opsFailure}</dd>
                </dl>
                <h4 className="subsection-title">Тактики</h4>
                <dl className="kv compact">
                  <dt>Разведка</dt><dd>{stats.tacticsUsed.recon}</dd>
                  <dt>Задержание</dt><dd>{stats.tacticsUsed.arrest}</dd>
                  <dt>Подавление</dt><dd>{stats.tacticsUsed.suppression}</dd>
                  <dt>Карантин</dt><dd>{stats.tacticsUsed.quarantine}</dd>
                </dl>
                <h4 className="subsection-title">Экономика и потери</h4>
                <dl className="kv compact">
                  <dt>РЕ заработано</dt><dd className="ok">{stats.reEarned}</dd>
                  <dt>РЕ потрачено</dt><dd className="bad">{stats.reSpent}</dd>
                  <dt>Потери (ранения)</dt><dd className="bad">{stats.casualties}</dd>
                </dl>
              </section>
            )}

            {tab === 'records' && records.length > 0 && (
              <section className="sandbox-records" data-testid="sandbox-records">
                <h3 className="section-title">Последние попытки</h3>
                {records.slice(-3).reverse().map((r, i) => (
                  <div key={i} className={`record-card ${r.outcome}`}>
                    <div className="record-header">
                      <span className="record-date">{new Date(r.date).toLocaleDateString()}</span>
                      <span className={`record-outcome ${r.outcome}`}>
                        {r.outcome === 'victory' ? 'Победа' : r.outcome === 'defeat' ? 'Поражение' : 'Брошено'}
                      </span>
                    </div>
                    <dl className="kv compact">
                      <dt>Смен</dt><dd>{r.shifts}</dd>
                      <dt>Порядок</dt><dd>{r.finalOrder}%</dd>
                      <dt>Легитимность</dt><dd>{r.finalLegitimacy}%</dd>
                      <dt>Баланс</dt><dd>{r.finalBalanceRe} РЕ</dd>
                      <dt>Вызовов</dt><dd>{r.stats.dutyTotal}</dd>
                      <dt>Дел</dt><dd>{r.stats.casesCompleted}</dd>
                    </dl>
                  </div>
                ))}
              </section>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
