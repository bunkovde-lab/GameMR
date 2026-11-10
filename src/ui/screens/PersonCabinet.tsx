import { useState } from 'react';
import { RANK_NAMES, nodeById, promotionStatus, skillPoints } from '../../core/career';
import { ROLE_LABEL } from '../../core/content';
import { HEALTH_LOG } from '../../core/healthText';
import { patientOf, squadCommander, squadOf } from '../../core/staff';
import type { GameState, Stats } from '../../core/types';
import { Icon } from '../Icon';
import { Portrait } from '../Portrait';
import { Development, History, Modifications, PersonPicker, Relations } from './StaffCareer';

/**
 * Личный кабинет сотрудника: открывается нажатием на портрет или имя в «Кадрах».
 * Шапка-досье (ранг, состав, здоровье, качества, опыт) и разделы: развитие, модификации, отношения, история.
 * Всё выводится из состояния игры; кабинет ничего не хранит, кроме выбранного раздела.
 */
type Section = 'development' | 'mods' | 'relations' | 'history';
const SECTIONS: { id: Section; label: string }[] = [
  { id: 'development', label: 'Развитие' },
  { id: 'mods', label: 'Модификации' },
  { id: 'relations', label: 'Отношения' },
  { id: 'history', label: 'История' },
];
const STATS: { key: keyof Stats; label: string }[] = [
  { key: 'reaction', label: 'Реакция' },
  { key: 'analysis', label: 'Анализ' },
  { key: 'control', label: 'Контроль' },
  { key: 'resilience', label: 'Стойкость' },
  { key: 'authority', label: 'Авторитет' },
];

export function PersonCabinet({ game, personId, onSelect, onBack }: { game: GameState; personId: string; onSelect: (id: string) => void; onBack: () => void }) {
  const [section, setSection] = useState<Section>('development');
  const p = game.staff.find((x) => x.id === personId) ?? game.staff[0]!;
  const sq = squadOf(game, p.id);
  const isCmd = sq ? squadCommander(game, sq)?.id === p.id : false;
  const promo = promotionStatus(game, p.id);
  const pts = skillPoints(p);
  const pt = patientOf(game, p.id);
  const xpPct = promo ? Math.min(100, Math.round((p.xp / Math.max(1, promo.xpNeed)) * 100)) : 100;
  return (
    <div className="cabinet" data-testid="person-cabinet">
      <div className="person-split">
        <div className="cabinet-side">
          <button className="btn cabinet-back" onClick={onBack} data-testid="cabinet-back"><Icon name="arrow" /> Все сотрудники</button>
          <PersonPicker key={p.id} game={game} selected={p.id} onSelect={onSelect} archive />
        </div>
        <div className="person-detail">
          <header className="dossier-card" data-testid="dossier">
            <Portrait id={p.id} name={p.name} health={p.health} size="lg" />
            <div className="dossier-main">
              <h3 className="person-name">{p.name}</h3>
              <p className="dossier-line">
                {ROLE_LABEL[p.role]} · ранг {RANK_NAMES[p.rank - 1]}
                {' · '}{sq ? <>состав «{sq.name}»{isCmd ? <em className="cmd"> · командир</em> : null}</> : p.health === 'dead' ? 'служебный архив' : 'резерв'}
              </p>
              <dl className="chips dossier-chips">
                <div><dt>Состояние</dt><dd className={`health h-${p.health}`}>{HEALTH_LOG[p.health]}{pt ? ' · в клинике' : ''}</dd></div>
                <div><dt>Усталость</dt><dd>{p.fatigue}%</dd></div>
                <div><dt>Очки навыка</dt><dd data-testid="skill-points">{pts.free} из {pts.earned}</dd></div>
                {p.training && <div><dt>Курс</dt><dd>«{nodeById(p.training.nodeId)?.label}», ещё {p.training.shiftsLeft} смен.</dd></div>}
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
          <div className="tabs cabinet-tabs" role="tablist" aria-label="Разделы личного дела">
            {SECTIONS.map((s) => (
              <button key={s.id} role="tab" className="btn" aria-selected={section === s.id} aria-pressed={section === s.id} onClick={() => setSection(s.id)} data-testid={`cab-tab-${s.id}`}>{s.label}</button>
            ))}
          </div>
          {section === 'development' && <Development key={p.id} game={game} p={p} />}
          {section === 'mods' && <Modifications game={game} p={p} />}
          {section === 'relations' && <Relations game={game} p={p} onOpen={onSelect} />}
          {section === 'history' && <History game={game} p={p} />}
        </div>
      </div>
    </div>
  );
}
