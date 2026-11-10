import { RANK_NAMES, promotionStatus } from '../../core/career';
import { ROLE_LABEL } from '../../core/content';
import { HEALTH_LOG } from '../../core/healthText';
import { patientOf, squadCommander, squadOf } from '../../core/staff';
import type { GameState, Stats } from '../../core/types';
import { formatRe } from '../../core/selectors';
import { StatusFace } from '../StatusFace';
import { Development, History, Modifications, PersonPicker, Relations } from './StaffCareer';

/**
 * Личное дело сотрудника — «Сводка» в «Кадрах». Всё на одном экране без вкладок:
 * слева составы, в центре досье, модификации, отношения и история, справа — панель развития.
 * Всё выводится из состояния игры.
 */
const STATS: { key: keyof Stats; label: string }[] = [
  { key: 'reaction', label: 'Реакция' },
  { key: 'analysis', label: 'Анализ' },
  { key: 'control', label: 'Контроль' },
  { key: 'resilience', label: 'Стойкость' },
  { key: 'authority', label: 'Авторитет' },
];

export function PersonCabinet({ game, personId, onSelect }: { game: GameState; personId: string; onSelect: (id: string) => void }) {
  const p = game.staff.find((x) => x.id === personId) ?? game.staff[0]!;
  const sq = squadOf(game, p.id);
  const isCmd = sq ? squadCommander(game, sq)?.id === p.id : false;
  const promo = promotionStatus(game, p.id);
  const pt = patientOf(game, p.id);
  const xpPct = promo ? Math.min(100, Math.round((p.xp / Math.max(1, promo.xpNeed)) * 100)) : 100;
  return (
    <div className="cabinet" data-testid="person-cabinet">
      <div className="person-split">
        <div className="cabinet-side">
          <PersonPicker key={p.id} game={game} selected={p.id} onSelect={onSelect} archive />
        </div>
        <div className="person-detail cabinet-main">
          <header className="dossier-card" data-testid="dossier">
            <StatusFace p={p} size="lg" />
            <div className="dossier-main">
              <h3 className="person-name">{p.name}</h3>
              <p className="dossier-line">
                {ROLE_LABEL[p.role]}
                {' · '}{sq ? <>состав «{sq.name}»{isCmd ? <em className="cmd"> · командир</em> : null}</> : p.health === 'dead' ? 'служебный архив' : 'резерв'}
              </p>
              <dl className="chips dossier-chips">
                {pt && <div><dt>Клиника</dt><dd className={`health h-${p.health}`}>{pt.kind === 'implant' ? 'реабилитация' : HEALTH_LOG[p.health]}, ещё {pt.shiftsLeft} смен.</dd></div>}
                <div><dt>Жалование</dt><dd>{formatRe(p.salary)} РЕ</dd></div>
                {p.adaptation > 0 && <div><dt>Адаптация</dt><dd>{p.adaptation} смен.</dd></div>}
              </dl>
              <div className="xp-row" title={promo ? `До аттестации на ранг ${RANK_NAMES[promo.next - 1]} нужно ${promo.xpNeed} опыта` : 'Высший ранг'}>
                <small>Опыт {p.xp}{promo ? ` / ${promo.xpNeed} до ранга ${RANK_NAMES[promo.next - 1]}` : ' · высший ранг'}</small>
                <span className="meter"><span style={{ width: `${xpPct}%` }} /></span>
              </div>
            </div>
            <ul className="plain-list stat-bars" aria-label="Качества">
              {STATS.map((s) => (
                <li key={s.key}>
                  <small>{s.label}</small>
                  <span className="pips" aria-label={`${p.stats[s.key]} из 5`}>
                    {[1, 2, 3, 4, 5].map((i) => <i key={i} className={i <= p.stats[s.key] ? 'on' : undefined} />)}
                  </span>
                </li>
              ))}
            </ul>
          </header>
          <Modifications game={game} p={p} />
          <Relations game={game} p={p} onOpen={onSelect} />
          <History game={game} p={p} />
        </div>
        <aside className="cabinet-dev">
          <Development key={p.id} game={game} p={p} />
        </aside>
      </div>
    </div>
  );
}
