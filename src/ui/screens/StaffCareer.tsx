import {
  BRANCH_IDS, CAREER, NODES, ORGANS, RANK_NAMES, courseBlocker, innateSystems, metabolic, nodeById, organBlocker, organById,
  promotionStatus, relationsOf, seedReasons, skillPoints,
} from '../../core/career';
import { ROLE_LABEL } from '../../core/content';
import { HEALTH_LOG } from '../../core/healthText';
import { clockLabel, formatRe } from '../../core/selectors';
import type { GameState, Staff } from '../../core/types';
import { dispatch } from '../../store';

/** W6 (часть 2): развитие (UI-08), модификации (UI-09), отношения (UI-11), история (UI-12). */

export function PersonPicker({ game, selected, onSelect, archive = false }: { game: GameState; selected: string; onSelect: (id: string) => void; archive?: boolean }) {
  const list = game.staff.filter((p) => archive || p.health !== 'dead');
  return (
    <nav className="person-picker" aria-label="Сотрудники">
      {list.map((p) => (
        <button key={p.id} className={`btn pick${p.health === 'dead' ? ' kia' : ''}`} aria-pressed={selected === p.id} onClick={() => onSelect(p.id)} data-testid={`person-${p.id}`}>
          <b>{p.name}</b>
          <small>{ROLE_LABEL[p.role]} · {RANK_NAMES[p.rank - 1]}{p.health === 'dead' ? ' · архив' : ''}</small>
        </button>
      ))}
    </nav>
  );
}

const sign = (v: number) => (v > 0 ? `+${v}` : `${v}`);
const word = (v: number) => (v >= 3 ? 'высокая' : v >= 1 ? 'есть' : v <= -3 ? 'конфликт' : v < 0 ? 'натянуто' : 'нейтрально');

export function Development({ game, p }: { game: GameState; p: Staff }) {
  const pts = skillPoints(p);
  const promo = promotionStatus(game, p.id);
  return (
    <div className="career" data-testid="development">
      <dl className="chips">
        <div><dt>Ранг</dt><dd>{RANK_NAMES[p.rank - 1]}</dd></div>
        <div><dt>Опыт</dt><dd>{p.xp}</dd></div>
        <div><dt>Очки навыка</dt><dd data-testid="skill-points">{pts.free} из {pts.earned}</dd></div>
        {p.training && <div><dt>Курс</dt><dd>«{nodeById(p.training.nodeId)?.label}», ещё {p.training.shiftsLeft} смен.</dd></div>}
      </dl>
      <p className="hint">Очки дают опыт, а не ранг. Курс стоит денег и выводит сотрудника из отряда до окончания. Свободного сброса нет.</p>
      <div className="branch-grid">
        {BRANCH_IDS.map((b) => (
          <section key={b} className="sq-card branch" data-testid={`branch-${b}`}>
            <header><b>{CAREER.branches[b].label}</b></header>
            <small className="muted">{CAREER.branches[b].hint}</small>
            <ol className="node-list">
              {NODES.filter((n) => n.branch === b).map((n) => {
                const learned = p.skills.includes(n.id);
                const why = learned ? null : courseBlocker(game, p.id, n.id);
                const studying = p.training?.nodeId === n.id;
                return (
                  <li key={n.id} className={learned ? 'learned' : ''}>
                    <span><b>{n.tier}. {n.label}</b><small>{n.desc}</small></span>
                    {learned ? <span className="tag good">изучено</span> : studying ? <span className="tag">идёт курс</span> : (
                      <button className="btn" disabled={!!why} title={why ?? undefined} onClick={() => dispatch({ type: 'START_COURSE', staffId: p.id, nodeId: n.id })} data-testid={`course-${n.id}`}>
                        Курс · {n.points} оч. · {n.cost} РЕ · {n.shifts} смен.
                      </button>
                    )}
                    {!learned && !studying && why && <small className="why">{why}</small>}
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
      </div>
      <h4 className="section-title">Аттестация на звание</h4>
      {!promo ? <p className="muted">Высший ранг.</p> : (
        <div className="promo" data-testid="promotion">
          <ul className="plain-list">
            <li>Опыт: {promo.xp} из {promo.xpNeed}</li>
            <li>Операции: {promo.ops} из {promo.opsNeed} (по журналу службы)</li>
            <li>Должности ранга {RANK_NAMES[promo.next - 1]}: занято {promo.holders} из {promo.slots}</li>
          </ul>
          <button className="btn primary" disabled={!!promo.blocker} onClick={() => dispatch({ type: 'PROMOTE', staffId: p.id })} data-testid="promote">
            Аттестовать на ранг {RANK_NAMES[promo.next - 1]} · {formatRe(promo.fee)} РЕ
          </button>
          {promo.blocker && <small className="why">{promo.blocker}</small>}
        </div>
      )}
    </div>
  );
}

export function Modifications({ game, p }: { game: GameState; p: Staff }) {
  const m = metabolic(p);
  const rehab = game.medical.patients.find((x) => x.staffId === p.id && x.kind === 'implant');
  return (
    <div className="career" data-testid="modifications">
      <dl className="chips">
        <div><dt>Метаболическая нагрузка</dt><dd data-testid="metabolic">{m.used} из {m.capacity}</dd></div>
        {rehab && <div><dt>Реабилитация</dt><dd>«{organById(rehab.organId!)?.label}», ещё {rehab.shiftsLeft} смен.</dd></div>}
      </dl>
      <p className="hint">Нагрузка ограничивает интеграцию новых органов и не ухудшает здоровье. Совместимость проверяется между конкретными системами. Названия систем рабочие, лором не утверждены.</p>
      <div className="branch-grid">
        <section className="sq-card">
          <header><b>Врождённые и линейные системы</b></header>
          <ul className="plain-list">
            {innateSystems(p.role).map((x) => <li key={x.id}><b>{x.label}</b> · нагрузка {x.load}<br /><small className="muted">{x.desc}</small></li>)}
          </ul>
        </section>
        <section className="sq-card">
          <header><b>Установленные органы</b></header>
          {p.implants.length === 0 ? <p className="muted">Нет.</p> : (
            <ul className="plain-list member-rows">
              {p.implants.map((id) => {
                const o = organById(id)!;
                return (
                  <li key={id}>
                    <span><b>{o.label}</b><small>{o.ability}: {o.desc}</small></span>
                    <button className="btn" disabled={!o.removable} title={o.removable ? undefined : 'Нельзя безопасно извлечь'} onClick={() => dispatch({ type: 'REMOVE_ORGAN', staffId: p.id, organId: id })} data-testid={`remove-${id}`}>
                      {o.removable ? 'Извлечь' : 'Не извлекается'}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <section className="sq-card">
          <header><b>Доступные органы</b></header>
          <ul className="plain-list member-rows">
            {ORGANS.filter((o) => !p.implants.includes(o.id)).map((o) => {
              const why = organBlocker(game, p.id, o.id);
              return (
                <li key={o.id}>
                  <span><b>{o.label}</b><small>{o.ability}: {o.desc} Нагрузка {o.load}, реабилитация {o.shifts} смен.{o.removable ? '' : ' Не извлекается.'}</small>{why && <small className="why">{why}</small>}</span>
                  <button className="btn" disabled={!!why} onClick={() => dispatch({ type: 'INSTALL_ORGAN', staffId: p.id, organId: o.id })} data-testid={`install-${o.id}`}>
                    Установить · {o.cost} РЕ
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}

export function Relations({ game, p }: { game: GameState; p: Staff }) {
  const links = relationsOf(game, p.id).sort((a, b) => Math.abs(b.trust) + b.teamwork - (Math.abs(a.trust) + a.teamwork));
  const name = (id: string) => game.staff.find((x) => x.id === id)?.name ?? id;
  const dead = (id: string) => game.staff.find((x) => x.id === id)?.health === 'dead';
  const seeds = seedReasons().filter((x) => x.a === p.id || x.b === p.id);
  const events = game.log.filter((e) => e.type === 'relation_changed' && e.staffIds?.includes(p.id)).slice(-6).reverse();
  const A = p.allegiance;
  return (
    <div className="career" data-testid="relations">
      <dl className="chips">
        <div><dt>Преданность государству</dt><dd>{A.state}</dd></div>
        <div><dt>Дому</dt><dd>{A.house}</dd></div>
        <div><dt>Дирекции</dt><dd data-testid="loyalty-directorate">{A.directorate}</dd></div>
      </dl>
      <p className="hint">Связи меняются только событиями: операциями, ранениями, гибелью, решениями командира. Сработанность от 3 даёт одно совместное действие (группа действует как штатная), доверие от −3 и ниже повышает риск. Эффекты не складываются.</p>
      {links.length === 0 ? <p className="muted">Служебных связей пока нет.</p> : (
        <div className="table-scroll">
          <table className="staff-table" data-testid="relations-table">
            <thead><tr><th>С кем</th><th>Доверие</th><th>Сработанность</th><th>Личная лояльность</th></tr></thead>
            <tbody>
              {links.map((r) => (
                <tr key={r.other} className={dead(r.other) ? 'kia' : undefined}>
                  <td>{name(r.other)}{dead(r.other) ? ' · архив' : ''}</td>
                  <td className={r.trust <= -3 ? 'bad' : undefined}>{sign(r.trust)} · {word(r.trust)}</td>
                  <td className={r.teamwork >= 3 ? 'good' : undefined}>{sign(r.teamwork)} · {word(r.teamwork)}</td>
                  <td>{sign(r.loyalty)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <h4 className="section-title">Почему так</h4>
      <ul className="plain-list">
        {seeds.map((x) => <li key={x.a + x.b}>{name(x.a === p.id ? x.b : x.a)}: {x.why} (до начала службы).</li>)}
        {events.map((e) => <li key={e.id}>Смена {e.shift}: {e.text}</li>)}
        {!seeds.length && !events.length && <li className="muted">Записей нет.</li>}
      </ul>
    </div>
  );
}

const minuteLabel = (game: GameState, m: number) => clockLabel({ ...game, minute: m });

export function History({ game, p }: { game: GameState; p: Staff }) {
  const entries = game.log.filter((e) => e.staffIds?.includes(p.id)).slice().reverse();
  return (
    <div className="career" data-testid="history">
      <dl className="kv dossier">
        <dt>Должность</dt><dd>{ROLE_LABEL[p.role]}, ранг {RANK_NAMES[p.rank - 1]}</dd>
        <dt>Состояние</dt><dd>{HEALTH_LOG[p.health]}{p.health === 'dead' ? ' · служебный архив' : ''}</dd>
        <dt>Навыки</dt><dd>{p.skills.map((id) => nodeById(id)?.label).join(', ') || 'нет'}</dd>
        <dt>Органы</dt><dd>{p.implants.map((id) => organById(id)?.label).join(', ') || 'нет'}</dd>
      </dl>
      <h4 className="section-title">Биография до службы</h4>
      <p className="muted">Не утверждена (OPEN-08): сценарные биографии будут добавлены после согласования лора.</p>
      <h4 className="section-title">Записи службы</h4>
      {entries.length === 0 ? <p className="muted" data-testid="history-empty">Записей пока нет. Они появляются только из журнала событий.</p> : (
        <ol className="history-list" data-testid="history-list">
          {entries.map((e) => <li key={e.id}><small>Смена {e.shift}, {minuteLabel(game, e.minute)}</small>{e.text}</li>)}
        </ol>
      )}
    </div>
  );
}
