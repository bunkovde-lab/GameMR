import { useState } from 'react';
import {
  BRANCH_IDS, CAREER, NODES, ORGANS, RANK_NAMES, courseBlocker, innateSystems, metabolic, nodeById, organBlocker, organById,
  STAT_WORD, promotionStatus, relationsOf, seedReasons, skillPoints, type NodeDef,
} from '../../core/career';
import { ROLE_LABEL } from '../../core/content';
import { HEALTH_LOG } from '../../core/healthText';
import { clockLabel, formatRe } from '../../core/selectors';
import type { GameState, Staff } from '../../core/types';
import { dispatch } from '../../store';
import { Icon } from '../Icon';
import { Portrait } from '../Portrait';
import { SkillArt } from '../skillArt';
import { staffGroups } from './staffGroups';

/** W6 (часть 2): развитие (UI-08), модификации (UI-09), отношения (UI-11), история (UI-12). */

export function PersonPicker({ game, selected, onSelect, archive = false }: { game: GameState; selected: string; onSelect: (id: string) => void; archive?: boolean }) {
  const groups = staffGroups(game, archive);
  const home = groups.find((g) => g.members.some((p) => p.id === selected))?.key;
  // Свёрнуто всё, кроме состава выбранного сотрудника; игрок сам раскрывает остальные стрелкой.
  const [open, setOpen] = useState<Set<string>>(() => new Set(home ? [home] : []));
  const toggle = (key: string) => setOpen((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  return (
    <nav className="person-picker grouped" aria-label="Сотрудники по составам">
      {groups.filter((g) => g.members.length > 0).map((g) => {
        const isOpen = open.has(g.key);
        const hasSelected = g.key === home;
        return (
          <section key={g.key} className={`pick-group${g.key === 'reserve' ? ' reserve' : ''}${g.key === 'archive' ? ' archive' : ''}`} data-testid={`pick-group-${g.key}`}>
            <button
              className="btn group-toggle"
              aria-expanded={isOpen}
              aria-controls={`pick-group-body-${g.key}`}
              onClick={() => toggle(g.key)}
              data-testid={`group-toggle-${g.key}`}
            >
              <span className="caret" aria-hidden="true">{isOpen ? '▾' : '▸'}</span>
              <b>{g.title}</b>
              <small>{g.members.length} чел.{!isOpen && hasSelected ? ' · выбран' : ''}</small>
            </button>
            {isOpen && (
              <div className="pick-group-body" id={`pick-group-body-${g.key}`}>
                {g.members.map((p) => (
                  <button key={p.id} className={`btn pick with-face${p.health === 'dead' ? ' kia' : ''}`} aria-pressed={selected === p.id} onClick={() => onSelect(p.id)} data-testid={`person-${p.id}`}>
                    <Portrait id={p.id} name={p.name} health={p.health} size="xs" />
                    <span className="pick-text">
                      <b>{p.name}</b>
                      <small>{ROLE_LABEL[p.role]} · {RANK_NAMES[p.rank - 1]}{g.commanderId === p.id ? ' · командир' : ''}{p.health === 'dead' ? ' · архив' : ''}</small>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </nav>
  );
}

const sign = (v: number) => (v > 0 ? `+${v}` : `${v}`);
const word = (v: number) => (v >= 3 ? 'высокая' : v >= 1 ? 'есть' : v <= -3 ? 'конфликт' : v < 0 ? 'натянуто' : 'нейтрально');

type NodeState = 'learned' | 'studying' | 'open' | 'locked';
const STATE_WORD: Record<NodeState, string> = { learned: 'изучено', studying: 'идёт курс', open: 'можно изучить', locked: 'закрыто' };

/** Требования узла списком: что уже выполнено, а что нет (ранг, качество, предыдущий навык ветки). */
function requirements(p: Staff, n: NodeDef) {
  const prev = NODES.find((x) => x.branch === n.branch && x.tier === n.tier - 1);
  const out: { ok: boolean; text: string }[] = [];
  if (prev) out.push({ ok: p.skills.includes(prev.id), text: `Навык «${prev.label}»` });
  out.push({ ok: p.rank >= n.rankMin, text: `Ранг ${RANK_NAMES[n.rankMin - 1]}` });
  if (n.stat) out.push({ ok: p.stats[n.stat.key] >= n.stat.min, text: `${STAT_WORD[n.stat.key][0]!.toUpperCase()}${STAT_WORD[n.stat.key].slice(1)} ${n.stat.min}+` });
  out.push({ ok: skillPoints(p).free >= n.points || p.skills.includes(n.id), text: `Очки навыка: ${n.points}` });
  return out;
}

/** Развитие (UI-08) деревом: три ветки, у каждого навыка значок; наведение — подсказка, нажатие — карточка с курсом. */
export function Development({ game, p }: { game: GameState; p: Staff }) {
  const promo = promotionStatus(game, p.id);
  const stateOf = (n: NodeDef): NodeState =>
    p.skills.includes(n.id) ? 'learned' : p.training?.nodeId === n.id ? 'studying' : courseBlocker(game, p.id, n.id) ? 'locked' : 'open';
  const firstOpen = NODES.find((n) => stateOf(n) === 'open') ?? NODES[0]!;
  const [selId, setSelId] = useState(firstOpen.id);
  const sel = nodeById(selId) ?? firstOpen;
  const selState = stateOf(sel);
  const why = selState === 'locked' ? courseBlocker(game, p.id, sel.id) : null;
  return (
    <div className="career" data-testid="development">
      <div className="skill-tree" role="group" aria-label="Дерево навыков">
        {BRANCH_IDS.map((b) => (
          <section key={b} className="skill-branch" data-testid={`branch-${b}`}>
            <header><b>{CAREER.branches[b].label}</b><small>{CAREER.branches[b].hint}</small></header>
            <ol className="skill-path">
              {NODES.filter((n) => n.branch === b).map((n) => {
                const st = stateOf(n);
                const blocker = st === 'locked' ? courseBlocker(game, p.id, n.id) : null;
                return (
                  <li key={n.id} className={`skill-step st-${st}`}>
                    <button
                      className={`skill-node st-${st}`}
                      aria-pressed={sel.id === n.id}
                      aria-label={`${n.label}: ${STATE_WORD[st]}`}
                      aria-describedby={`tip-${n.id}`}
                      onClick={() => setSelId(n.id)}
                      data-testid={`skill-${n.id}`}
                    >
                      <SkillArt id={n.id} />
                      <span className="skill-tier">{RANK_NAMES[n.tier - 1]}</span>
                      {st === 'learned' && <span className="skill-badge good" aria-hidden="true">✓</span>}
                      {st === 'locked' && <span className="skill-badge" aria-hidden="true"><Icon name="lock" /></span>}
                      {st === 'studying' && <span className="skill-badge warn" aria-hidden="true"><Icon name="clock" /></span>}
                    </button>
                    <span className="skill-caption">{n.label}</span>
                    <span className="skill-tip" role="tooltip" id={`tip-${n.id}`}>
                      <b>{n.label}</b>
                      <span>{n.desc}</span>
                      <small>{STATE_WORD[st]}{blocker ? ` · ${blocker}` : ''}</small>
                    </span>
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
      </div>
      <article className={`sq-card skill-detail st-${selState}`} data-testid="skill-detail" aria-live="polite">
        <div className="skill-detail-head">
          <span className={`skill-node big st-${selState}`} aria-hidden="true"><SkillArt id={sel.id} /></span>
          <span>
            <small className="muted">{CAREER.branches[sel.branch].label} · ступень {RANK_NAMES[sel.tier - 1]}</small>
            <h4>{sel.label}</h4>
            <span className={`tag st-${selState}`}>{STATE_WORD[selState]}</span>
          </span>
        </div>
        <p className="skill-gives"><b>Что даёт:</b> {sel.desc}</p>
        <ul className="plain-list req-list">
          {requirements(p, sel).map((r) => <li key={r.text} className={r.ok ? 'ok' : 'no'}><span aria-hidden="true">{r.ok ? '✓' : '✗'}</span> {r.text}</li>)}
        </ul>
        {selState === 'learned' ? null : selState === 'studying' ? (
          <p className="muted">Курс идёт: осталось {p.training?.shiftsLeft} смен.</p>
        ) : (
          <>
            <button className="btn primary" disabled={!!why} onClick={() => dispatch({ type: 'START_COURSE', staffId: p.id, nodeId: sel.id })} data-testid={`course-${sel.id}`}>
              Начать курс · {sel.points} оч. · {sel.cost} РЕ · {sel.shifts} смен.
            </button>
            {why && <small className="why">{why}</small>}
          </>
        )}
      </article>
      <p className="hint">Очки дают опыт, а не ранг. Курс стоит денег и выводит сотрудника из отряда до окончания. Свободного сброса нет. Значки навыков временные — до картинок художника.</p>
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

export function Relations({ game, p, onOpen }: { game: GameState; p: Staff; onOpen?: (id: string) => void }) {
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
        <ul className="plain-list rel-cards" data-testid="relations-table">
          {links.map((r) => {
            const o = game.staff.find((x) => x.id === r.other);
            return (
              <li key={r.other} className={`rel-card${dead(r.other) ? ' kia' : ''}${r.trust <= -3 ? ' conflict' : r.teamwork >= 3 ? ' close' : ''}`}>
                <button className="btn rel-who" disabled={!onOpen} onClick={() => onOpen?.(r.other)} data-testid={`rel-open-${r.other}`}>
                  <Portrait id={r.other} name={name(r.other)} health={o?.health} size="sm" />
                  <span className="pick-text"><b>{name(r.other)}</b><small>{o ? ROLE_LABEL[o.role] : ''}{dead(r.other) ? ' · архив' : ''}</small></span>
                </button>
                <RelMeter label="Доверие" v={r.trust} />
                <RelMeter label="Сработанность" v={r.teamwork} />
                <RelMeter label="Личная лояльность" v={r.loyalty} />
              </li>
            );
          })}
        </ul>
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

/** Связь от −5 до +5: полоска от центра, цвет по знаку, словами — смысл. */
function RelMeter({ label, v }: { label: string; v: number }) {
  const w = (Math.abs(v) / 5) * 50;
  return (
    <span className="rel-meter">
      <small>{label}</small>
      <span className="rel-bar" aria-hidden="true"><i className={v < 0 ? 'neg' : 'pos'} style={v < 0 ? { right: '50%', width: `${w}%` } : { left: '50%', width: `${w}%` }} /></span>
      <small className={v <= -3 ? 'bad' : v >= 3 ? 'good' : undefined}>{sign(v)} · {word(v)}</small>
    </span>
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
