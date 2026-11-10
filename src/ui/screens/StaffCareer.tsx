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
import { IconTile, type TileState, type TipLine } from '../IconTile';
import { Portrait } from '../Portrait';
import { OrganArt, SkillArt } from '../skillArt';
import { StatusFace } from '../StatusFace';
import { staffGroups } from './staffGroups';

/** Разделы личного дела на одном экране: развитие (UI-08), модификации (UI-09), отношения (UI-11), история (UI-12). */

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
                    <StatusFace p={p} />
                    <span className="pick-text">
                      <b>{p.name}</b>
                      <small>{ROLE_LABEL[p.role]}{g.commanderId === p.id ? ' · командир' : ''}{p.health === 'dead' ? ' · архив' : ''}</small>
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
const STATE_WORD: Record<TileState, string> = { learned: 'изучено', studying: 'идёт курс', open: 'можно изучить', locked: 'закрыто', innate: 'врождённое' };
const cap = (w: string) => w[0]!.toUpperCase() + w.slice(1);

/** Требования узла: что уже выполнено, а что нет (предыдущий навык ветки, ранг, качество, очки). */
function requirements(p: Staff, n: NodeDef): TipLine[] {
  const prev = NODES.find((x) => x.branch === n.branch && x.tier === n.tier - 1);
  const out: TipLine[] = [];
  if (prev) out.push({ tone: p.skills.includes(prev.id) ? 'ok' : 'no', text: `Навык «${prev.label}»` });
  out.push({ tone: p.rank >= n.rankMin ? 'ok' : 'no', text: `Ранг ${RANK_NAMES[n.rankMin - 1]}` });
  if (n.stat) out.push({ tone: p.stats[n.stat.key] >= n.stat.min ? 'ok' : 'no', text: `${cap(STAT_WORD[n.stat.key])} ${n.stat.min}+` });
  return out;
}

/** Развитие (UI-08): три ветки рядом, навык — значок; изучение нажатием на значок, цена и требования в подсказке. */
export function Development({ game, p }: { game: GameState; p: Staff }) {
  const pts = skillPoints(p);
  const promo = promotionStatus(game, p.id);
  const stateOf = (n: NodeDef): TileState =>
    p.skills.includes(n.id) ? 'learned' : p.training?.nodeId === n.id ? 'studying' : courseBlocker(game, p.id, n.id) ? 'locked' : 'open';
  return (
    <section className="cab-sec cab-dev" data-testid="development" aria-label="Развитие">
      <header className="cab-sec-head">
        <h4>Развитие</h4>
        <small>Очки навыка: <b data-testid="skill-points">{pts.free} из {pts.earned}</b></small>
      </header>
      {p.training && <p className="cab-note">Идёт курс «{nodeById(p.training.nodeId)?.label}», ещё {p.training.shiftsLeft} смен.</p>}
      <div className="skill-tree">
        {BRANCH_IDS.map((b) => (
          <section key={b} className="skill-branch" data-testid={`branch-${b}`} title={CAREER.branches[b].hint}>
            <header><b>{CAREER.branches[b].label}</b></header>
            <ol className="skill-path">
              {NODES.filter((n) => n.branch === b).map((n) => {
                const st = stateOf(n);
                const why = st === 'locked' ? courseBlocker(game, p.id, n.id) : null;
                const lines: TipLine[] = [
                  { tone: 'cost', text: `Курс: ${n.points} оч. навыка · ${n.cost} РЕ · ${n.shifts} смен.` },
                  ...(st === 'learned' || st === 'studying' ? [] : requirements(p, n)),
                  { text: STATE_WORD[st] + (st === 'studying' ? `, ещё ${p.training?.shiftsLeft} смен.` : '') },
                  ...(why ? [{ tone: 'no' as const, text: why }] : []),
                ];
                return (
                  <IconTile
                    key={n.id} id={n.id} state={st} label={n.label} desc={n.desc} lines={lines}
                    art={<SkillArt id={n.id} />} tier={RANK_NAMES[n.tier - 1]} testId={`course-${n.id}`}
                    action={st === 'open' ? { run: () => dispatch({ type: 'START_COURSE', staffId: p.id, nodeId: n.id }), hint: 'начать курс' } : null}
                  />
                );
              })}
            </ol>
          </section>
        ))}
      </div>
      {!promo ? <p className="cab-note">Высший ранг.</p> : (
        <div className="promo" data-testid="promotion">
          <small>Аттестация на ранг {RANK_NAMES[promo.next - 1]}: опыт {promo.xp} из {promo.xpNeed} · операции {promo.ops} из {promo.opsNeed} · должности {promo.holders} из {promo.slots}</small>
          <button className="btn" disabled={!!promo.blocker} onClick={() => dispatch({ type: 'PROMOTE', staffId: p.id })} data-testid="promote">
            Аттестовать · {formatRe(promo.fee)} РЕ
          </button>
          {promo.blocker && <small className="why">{promo.blocker}</small>}
        </div>
      )}
      <p className="hint">Очки дают опыт, а не ранг. Курс стоит денег и выводит сотрудника из отряда до окончания. Свободного сброса нет.</p>
    </section>
  );
}

/** Ветки модификаций по системам организма — только раскладка экрана, на правила не влияет. */
const ORGAN_BRANCHES: { id: string; label: string; hint: string; organs: string[] }[] = [
  { id: 'senses', label: 'Чувства', hint: 'след, запах, биоматериал', organs: ['org_scent', 'org_trace'] },
  { id: 'defense', label: 'Защита', hint: 'выживаемость группы', organs: ['org_dermal'] },
  { id: 'nerves', label: 'Нервная система', hint: 'реакция и захват', organs: ['org_adapt'] },
];

/** Модификации (UI-09): панель как у развития — значки по ветвям; установка нажатием, извлечение двойным нажатием. */
export function Modifications({ game, p }: { game: GameState; p: Staff }) {
  const m = metabolic(p);
  const rehab = game.medical.patients.find((x) => x.staffId === p.id && x.kind === 'implant');
  const organTile = (id: string) => {
    const o = organById(id);
    if (!o) return null;
    const installed = p.implants.includes(o.id);
    const inRehab = rehab?.organId === o.id;
    const why = installed || inRehab ? null : organBlocker(game, p.id, o.id);
    const st: TileState = installed ? 'learned' : inRehab ? 'studying' : why ? 'locked' : 'open';
    const lines: TipLine[] = [
      { tone: 'cost', text: `Установка: ${o.cost} РЕ · нагрузка ${o.load} · реабилитация ${o.shifts} смен.` },
      { text: `${o.ability}.${o.removable ? '' : ' Не извлекается.'}` },
      ...(installed ? [{ tone: 'ok' as const, text: 'Установлен' }] : []),
      ...(why ? [{ tone: 'no' as const, text: why }] : []),
    ];
    const action = st === 'open'
      ? { run: () => dispatch({ type: 'INSTALL_ORGAN', staffId: p.id, organId: o.id }), hint: 'установить' }
      : installed && o.removable ? { run: () => dispatch({ type: 'REMOVE_ORGAN', staffId: p.id, organId: o.id }), hint: 'извлечь', confirm: true } : null;
    return <IconTile key={o.id} id={o.id} state={st} label={o.label} desc={o.desc} lines={lines} art={<OrganArt id={o.id} />} action={action} testId={`install-${o.id}`} />;
  };
  const pct = Math.min(100, Math.round((m.used / Math.max(1, m.capacity)) * 100));
  return (
    <section className="cab-sec cab-mods" data-testid="modifications" aria-label="Модификации">
      <header className="cab-sec-head">
        <h4>Модификации</h4>
        <small>Запас организма: <b data-testid="metabolic">{m.used} из {m.capacity}</b></small>
      </header>
      <span className="meter load-meter" title="Занято врождёнными системами и органами; растёт со стойкостью"><span style={{ width: `${pct}%` }} /></span>
      {rehab && <p className="cab-note">Реабилитация: «{organById(rehab.organId!)?.label}», ещё {rehab.shiftsLeft} смен.</p>}
      <div className="skill-tree mods-tree">
        <section className="skill-branch innate" data-testid="mods-innate">
          <header><b>Врождённое</b></header>
          <ol className="skill-path loose">
            {innateSystems(p.role).map((x) => (
              <IconTile key={x.id} id={x.id} state="innate" label={x.label} desc={x.desc} lines={[{ text: `Нагрузка ${x.load}. Не удаляется.` }]}
                art={<OrganArt id={x.id} />} action={null} testId={`innate-${x.id}`} />
            ))}
          </ol>
        </section>
        {ORGAN_BRANCHES.map((b) => (
          <section key={b.id} className="skill-branch" title={b.hint} data-testid={`mods-${b.id}`}>
            <header><b>{b.label}</b></header>
            <ol className="skill-path loose">{b.organs.map(organTile)}</ol>
          </section>
        ))}
      </div>
      {/* Причины недоступности — и текстом, чтобы их было видно без наведения. */}
      <ul className="plain-list cab-why">
        {ORGANS.filter((o) => !p.implants.includes(o.id) && rehab?.organId !== o.id).map((o) => {
          const why = organBlocker(game, p.id, o.id);
          return why ? <li key={o.id}><b>{o.label}:</b> {why.replace(/\.$/, '')}</li> : null;
        })}
      </ul>
    </section>
  );
}

/** Отношения (UI-11): компактный список с шкалами −5…+5; нажатие на коллегу открывает его дело. */
export function Relations({ game, p, onOpen }: { game: GameState; p: Staff; onOpen?: (id: string) => void }) {
  const links = relationsOf(game, p.id).sort((a, b) => Math.abs(b.trust) + b.teamwork - (Math.abs(a.trust) + a.teamwork));
  const name = (id: string) => game.staff.find((x) => x.id === id)?.name ?? id;
  const seeds = seedReasons().filter((x) => x.a === p.id || x.b === p.id);
  const A = p.allegiance;
  return (
    <section className="cab-sec" data-testid="relations" aria-label="Отношения">
      <header className="cab-sec-head">
        <h4>Отношения</h4>
        <small title="Преданность государству, Дому, Дирекции">Государству {A.state} · Дому {A.house} · Дирекции <b data-testid="loyalty-directorate">{A.directorate}</b></small>
      </header>
      {links.length === 0 ? <p className="cab-note">Служебных связей пока нет.</p> : (
        <ul className="plain-list rel-rows" data-testid="relations-table">
          {links.map((r) => {
            const o = game.staff.find((x) => x.id === r.other);
            const seed = seeds.find((x) => x.a === r.other || x.b === r.other);
            return (
              <li key={r.other} className={`rel-row${o?.health === 'dead' ? ' kia' : ''}`}>
                <button className="btn rel-who" disabled={!onOpen} onClick={() => onOpen?.(r.other)} data-testid={`rel-open-${r.other}`}>
                  <Portrait id={r.other} name={name(r.other)} health={o?.health} size="xs" />
                  <span className="pick-text"><b>{name(r.other)}</b>{o?.health === 'dead' && <small>архив</small>}</span>
                </button>
                <RelMeter label="Доверие" v={r.trust} />
                <RelMeter label="Сработанность" v={r.teamwork} />
                <RelMeter label="Лояльность" v={r.loyalty} />
                {seed && <small className="rel-why">{seed.why} (до службы)</small>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Связь от −5 до +5: полоска от центра, цвет по знаку, значение и смысл — в подписи. */
function RelMeter({ label, v }: { label: string; v: number }) {
  const w = (Math.abs(v) / 5) * 50;
  return (
    <span className="rel-meter" title={`${label}: ${sign(v)} · ${word(v)}`}>
      <small>{label}</small>
      <span className="rel-bar" aria-hidden="true"><i className={v < 0 ? 'neg' : 'pos'} style={v < 0 ? { right: '50%', width: `${w}%` } : { left: '50%', width: `${w}%` }} /></span>
      <small className={v <= -3 ? 'bad' : v >= 3 ? 'good' : undefined}>{sign(v)} · {word(v)}</small>
    </span>
  );
}

const minuteLabel = (game: GameState, m: number) => clockLabel({ ...game, minute: m });

/** История (UI-12): записи журнала о сотруднике, свежие сверху. */
export function History({ game, p }: { game: GameState; p: Staff }) {
  const entries = game.log.filter((e) => e.staffIds?.includes(p.id)).slice().reverse();
  return (
    <section className="cab-sec" data-testid="history" aria-label="История">
      <header className="cab-sec-head"><h4>История службы</h4><small>{HEALTH_LOG[p.health]}{p.health === 'dead' ? ' · служебный архив' : ''}</small></header>
      {entries.length === 0 ? <p className="cab-note" data-testid="history-empty">Записей пока нет. Они появляются только из журнала событий. Биография до службы не утверждена (OPEN-08).</p> : (
        <ol className="history-list" data-testid="history-list">
          {entries.map((e) => <li key={e.id}><small>Смена {e.shift}, {minuteLabel(game, e.minute)}</small>{e.text}</li>)}
        </ol>
      )}
    </section>
  );
}
