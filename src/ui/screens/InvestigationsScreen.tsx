import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ROLE_LABEL, INCIDENT_TEMPLATES } from '../../core/content';
import {
  CASES, CASE_RULES, DECISION_LABEL, EVIDENCE_TYPES, METHOD_LABEL, absMinute, admissibility, analysisBlocker, analysisMinutes, analysisView, caseDef,
  caseForecast, caseStatusWord, concludeBlocker, courtChance, evidenceDef, expertiseBlocker, interrogationBlocker, linkStatus, methodsOf,
  personAvailable, timedEvidence, timelineView, workerBlocker, type CaseDef, type LinkStatus,
} from '../../core/investigations';
import { houseById } from '../../core/politics';
import { formatRe } from '../../core/selectors';
import type { CaseDecisionKind, CaseFile, GameState, InterrogationMethod, StaffRole } from '../../core/types';
import { dispatch } from '../../store';
import { Icon, type IconName } from '../Icon';
import { Portrait } from '../Portrait';

/** W9: расследования (ТЗ §11). Экран читает только ядро: скрытая истина в интерфейс не попадает. */

type Tab = 'board' | 'timeline' | 'interviews' | 'conclusion';
const TABS: { id: Tab; label: string }[] = [
  { id: 'board', label: 'Доска' },
  { id: 'timeline', label: 'Реконструкция' },
  { id: 'interviews', label: 'Допросы' },
  { id: 'conclusion', label: 'Заключение' },
];
/** До ART-010 у типов улик — значки из общего набора. */
const TYPE_ICON: Record<string, IconName> = {
  bio_sample: 'beaker', document: 'folder', recording: 'radio', testimony: 'person', object: 'search', finance: 'chart', registry: 'book', location: 'pin',
};
const LINK_WORD: Record<LinkStatus, string> = { proposed: 'предложена', supported: 'подтверждена', contradicted: 'опровергнута' };
const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10, m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
};
const minutesLeft = (game: GameState, doneAt: number) => Math.max(0, doneAt - absMinute(game));

export function InvestigationsScreen({ game, onClose }: { game: GameState; onClose: () => void }) {
  const files = game.investigations.cases;
  const [caseId, setCaseId] = useState<string | null>(files[0]?.id ?? null);
  const current = files.find((f) => f.id === caseId) ?? files[0];
  return (
    <section className="panel screen" role="region" aria-label="Расследования" data-testid="investigations-screen">
      <div className="panel-header">
        <h2><Icon name="search" /> Расследования</h2>
        {files.length > 0 && (
          <div className="tabs screen-tabs" role="tablist" aria-label="Дела">
            {files.map((f) => {
              const d = caseDef(f.id)!;
              return (
                <button key={f.id} role="tab" className="btn" aria-selected={current?.id === f.id} onClick={() => setCaseId(f.id)} data-testid={`case-tab-${f.id}`}>
                  №{d.number} {d.title}
                </button>
              );
            })}
          </div>
        )}
        <button className="btn icon-only" onClick={onClose} aria-label="Вернуться к карте"><Icon name="close" /></button>
      </div>
      <div className="panel-body">
        {current ? <CaseView key={current.id} game={game} f={current} /> : <NoCases />}
      </div>
    </section>
  );
}

function NoCases() {
  return (
    <div className="career" data-testid="no-cases-yet">
      <p className="hint">Дело открывается после операции на вызове. Что попадёт в дело, зависит от того, сохранил ли отряд улики на месте.</p>
      <ul className="plain-list">
        {CASES.map((c) => (
          <li key={c.id}>
            <b>№{c.number} «{c.title}»</b> — после операции на вызове «{INCIDENT_TEMPLATES.find((t) => t.id === c.templateId)?.title}».
          </li>
        ))}
      </ul>
    </div>
  );
}

function CaseView({ game, f }: { game: GameState; f: CaseFile }) {
  const d = caseDef(f.id)!;
  const [tab, setTab] = useState<Tab>('board');
  return (
    <div className="career case-view" data-testid={`case-${f.id}`}>
      <header className="case-head">
        <p>{d.summary}</p>
        <small className="muted">
          Открыто в смену {f.openedShift} · объект в ведении: {houseById(d.houseId)?.label} · улик: {f.evidence.length} · <b data-testid="case-status">{caseStatusWord(f)}</b>
        </small>
      </header>
      <div className="tabs case-tabs" role="tablist" aria-label="Режимы дела">
        {TABS.map((t) => (
          <button key={t.id} role="tab" className="btn" aria-selected={tab === t.id} onClick={() => setTab(t.id)} data-testid={`case-mode-${t.id}`}>{t.label}</button>
        ))}
      </div>
      {tab === 'board' && <Board game={game} f={f} d={d} />}
      {tab === 'timeline' && <Timeline f={f} d={d} />}
      {tab === 'interviews' && <Interviews game={game} f={f} d={d} />}
      {tab === 'conclusion' && <Conclusion game={game} f={f} d={d} onContinue={() => setTab('board')} />}
    </div>
  );
}

// ---------- Доска ----------

function Board({ game, f, d }: { game: GameState; f: CaseFile; d: CaseDef }) {
  const [sel, setSel] = useState<string | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<{ key: string; x1: number; y1: number; x2: number; y2: number; status: LinkStatus }[]>([]);
  const linksKey = f.links.map((l) => `${l.evidenceId}-${l.hypothesisId}`).join() + f.evidence.map((e) => e.analysis).join();

  // Линии связей рисуются поверх доски по фактическому положению карточек (на узком экране — скрыты, вместо них подписи).
  useLayoutEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const measure = () => {
      const box = el.getBoundingClientRect();
      const next = f.links.flatMap((l) => {
        const a = el.querySelector(`[data-ev="${l.evidenceId}"]`)?.getBoundingClientRect();
        const b = el.querySelector(`[data-hyp="${l.hypothesisId}"]`)?.getBoundingClientRect();
        if (!a || !b) return [];
        return [{ key: `${l.evidenceId}-${l.hypothesisId}`, x1: a.right - box.left, y1: a.top + a.height / 2 - box.top, x2: b.left - box.left, y2: b.top + 22 - box.top, status: linkStatus(f, d, l.evidenceId, l.hypothesisId).status }];
      });
      setLines(next);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [linksKey, sel, f, d]);

  const selected = sel ? f.evidence.find((e) => e.id === sel) : undefined;
  return (
    <div className="board-wrap">
      <p className="hint">Связи строите вы. Линия остаётся «предложенной», пока улику не проверили. Доска не показывает, какая версия верна: только что подтверждают и что опровергают проверенные улики.</p>
      <div className="board" ref={boardRef} data-testid="board">
        <svg className="board-lines" aria-hidden="true">
          {lines.map((l) => {
            const mx = (l.x1 + l.x2) / 2;
            return <path key={l.key} className={`link ${l.status}`} d={`M${l.x1},${l.y1} C${mx},${l.y1} ${mx},${l.y2} ${l.x2},${l.y2}`} />;
          })}
        </svg>
        <div className="evidence-grid" aria-label="Улики">
          {f.evidence.map((ev) => {
            const def = evidenceDef(d, ev.id)!;
            const a = analysisView(ev, def);
            const task = f.tasks.find((t) => t.target === ev.id);
            const adm = admissibility(game, f, ev, def);
            return (
              <button key={ev.id} data-ev={ev.id} className={`evidence-card${sel === ev.id ? ' selected' : ''}`} aria-pressed={sel === ev.id} onClick={() => setSel(sel === ev.id ? null : ev.id)} data-testid={`ev-${ev.id}`}>
                <span className="ev-type"><Icon name={TYPE_ICON[def.type] ?? 'folder'} /> {EVIDENCE_TYPES[def.type]}</span>
                <b>{def.title}</b>
                <span className="ev-tags">
                  <span className={`tag ${a.tone}`}>{task ? `в работе · ${minutesLeft(game, task.doneAt)} мин` : a.word}</span>
                  {!adm.ok && <span className="tag bad">сомнительна</span>}
                </span>
                {f.links.filter((l) => l.evidenceId === ev.id).map((l) => {
                  const st = linkStatus(f, d, ev.id, l.hypothesisId).status;
                  return <small key={l.hypothesisId} className={`link-chip ${st}`}>→ {d.hypotheses.find((h) => h.id === l.hypothesisId)?.title}: {LINK_WORD[st]}</small>;
                })}
              </button>
            );
          })}
        </div>
        <div className="hypotheses" aria-label="Версии">
          {d.hypotheses.map((h) => {
            const ls = f.links.filter((l) => l.hypothesisId === h.id).map((l) => linkStatus(f, d, l.evidenceId, h.id).status);
            const n = (st: LinkStatus) => ls.filter((x) => x === st).length;
            return (
              <article key={h.id} data-hyp={h.id} className={`hyp-card${f.working === h.id ? ' working' : ''}`} data-testid={`hyp-${h.id}`}>
                <header><b>{h.title}</b>{f.working === h.id && <span className="tag good">рабочая версия</span>}</header>
                <small className="muted">{h.text}</small>
                <small data-testid={`hyp-count-${h.id}`}>
                  Связей: {ls.length}{ls.length ? ` · подтверждено ${n('supported')} · опровергнуто ${n('contradicted')} · предложено ${n('proposed')}` : ''}
                </small>
                {f.status === 'open' && (
                  <button className="btn" onClick={() => dispatch({ type: 'SET_WORKING_HYPOTHESIS', caseId: f.id, hypothesisId: f.working === h.id ? null : h.id })} data-testid={`working-${h.id}`}>
                    {f.working === h.id ? 'Снять отметку' : 'Сделать рабочей'}
                  </button>
                )}
              </article>
            );
          })}
        </div>
      </div>
      {selected ? <EvidencePanel game={game} f={f} d={d} id={selected.id} onClose={() => setSel(null)} /> : <p className="muted">Выберите улику, чтобы увидеть источник, допустимость и действия.</p>}
    </div>
  );
}

function StaffPick({ game, roles, why, value, onChange, testid }: {
  game: GameState; roles: StaffRole[]; why: (id: string) => string | null; value: string; onChange: (id: string) => void; testid: string;
}) {
  const people = game.staff.filter((p) => roles.includes(p.role) && p.health !== 'dead');
  return (
    <>
      <div className="seg wrap" role="group" aria-label="Кто выполняет">
        {people.map((p) => {
          const w = workerBlocker(game, p.id, roles);
          return (
            <button key={p.id} className="btn" aria-pressed={value === p.id} disabled={!!w} title={w ?? undefined} onClick={() => onChange(p.id)} data-testid={`${testid}-${p.id}`}>
              {p.name} · анализ {p.stats.analysis}
            </button>
          );
        })}
      </div>
      {people.every((p) => workerBlocker(game, p.id, roles)) && <small className="why">Нет свободных: нужен {roles.map((r) => ROLE_LABEL[r].toLowerCase()).join(' или ')}.</small>}
      {value && why(value) && <small className="why">{why(value)}</small>}
    </>
  );
}

function EvidencePanel({ game, f, d, id, onClose }: { game: GameState; f: CaseFile; d: CaseDef; id: string; onClose: () => void }) {
  const ev = f.evidence.find((e) => e.id === id)!;
  const def = evidenceDef(d, id)!;
  const a = analysisView(ev, def);
  const adm = admissibility(game, f, ev, def);
  const A = CASE_RULES.analysis[def.analysis];
  const task = f.tasks.find((t) => t.target === id);
  const firstFree = game.staff.find((p) => A.roles.includes(p.role) && !workerBlocker(game, p.id, A.roles))?.id ?? '';
  const [picked, setWho] = useState(firstFree);
  const who = picked && !workerBlocker(game, picked, A.roles) ? picked : firstFree;
  const open = f.status === 'open';
  const ref = useRef<HTMLElement>(null);
  useEffect(() => { ref.current?.scrollIntoView?.({ block: 'nearest' }); }, [id]);
  return (
    <aside ref={ref} className="sq-card evidence-panel" data-testid="evidence-panel">
      <header><b>{def.title}</b><button className="btn icon-only" onClick={onClose} aria-label="Закрыть карточку улики"><Icon name="close" /></button></header>
      <p>{def.text}</p>
      <dl className="kv">
        <dt>Источник</dt><dd>{def.source}</dd>
        <dt>Цепочка хранения</dt><dd>{ev.custodyNote ?? `в архиве дирекции со смены ${ev.foundShift}`}</dd>
        <dt>Время по источнику</dt><dd>{def.slot !== undefined ? d.slots[def.slot] : 'не указано'}</dd>
        <dt>Допустимость</dt><dd className={adm.ok ? undefined : 'bad'}>{adm.ok ? 'допустима' : `сомнительна: ${adm.why}`}</dd>
        <dt>Анализ</dt><dd className={a.tone} data-testid="ev-analysis">{a.word}{ev.checks > 1 ? ` · проверок: ${ev.checks}` : ''}</dd>
      </dl>
      {a.text && <p className="result-text">{a.text}</p>}

      <h5 className="section-title">Связать с версией</h5>
      <div className="seg wrap" role="group" aria-label="Связи с версиями">
        {d.hypotheses.map((h) => {
          const linked = f.links.some((l) => l.evidenceId === id && l.hypothesisId === h.id);
          const st = linked ? linkStatus(f, d, id, h.id) : null;
          return (
            <button key={h.id} className="btn" aria-pressed={linked} disabled={!open} onClick={() => dispatch({ type: linked ? 'UNLINK_EVIDENCE' : 'LINK_EVIDENCE', caseId: f.id, evidenceId: id, hypothesisId: h.id })} data-testid={`link-${id}-${h.id}`}>
              {linked ? '✓ ' : '+ '}{h.title}{st ? ` · ${LINK_WORD[st.status]}` : ''}
            </button>
          );
        })}
      </div>

      {open && (
        <>
          <h5 className="section-title">{ev.analysis === 'none' ? 'Проверить' : 'Проверить ещё раз'}: {A.label}</h5>
          {task ? <p className="tag">идёт: {game.staff.find((p) => p.id === task.staffId)?.name}, осталось {minutesLeft(game, task.doneAt)} мин</p> : (
            <>
              <small className="muted">≈{analysisMinutes(game, def)} мин{A.reagents ? ` · реагентов: ${A.reagents} (есть ${game.resources.reagents})` : ''}. Результат зависит от аналитика; повторная проверка точнее.</small>
              <StaffPick game={game} roles={A.roles} value={who} onChange={setWho} why={(sid) => analysisBlocker(game, f.id, id, sid)} testid="analyst" />
              <button className="btn primary" disabled={!who || !!analysisBlocker(game, f.id, id, who)} onClick={() => dispatch({ type: 'ANALYZE_EVIDENCE', caseId: f.id, evidenceId: id, staffId: who })} data-testid="analyze">
                Начать проверку
              </button>
            </>
          )}
        </>
      )}
    </aside>
  );
}

// ---------- Реконструкция ----------

function Timeline({ f, d }: { f: CaseFile; d: CaseDef }) {
  const view = timelineView(f, d);
  const timed = timedEvidence(f, d);
  const title = (id: string) => evidenceDef(d, id)?.title;
  return (
    <div className="career" data-testid="timeline">
      <p className="hint">Расставьте улики по времени сами. Источник называет своё время, но источники могут противоречить друг другу или быть подделаны. Полной хронологии заранее нет.</p>
      <ol className="slots">
        {d.slots.map((label, i) => (
          <li key={label} className="slot" data-testid={`slot-${i}`}>
            <b>{label}</b>
            {view.placed.filter((p) => p.slot === i).map((p) => (
              <span key={p.evidenceId} className={`slot-item${p.fits ? '' : ' misfit'}`}>
                {title(p.evidenceId)}
                {!p.fits && <small className="why">источник называет другое время</small>}
              </span>
            ))}
          </li>
        ))}
      </ol>
      {view.conflicts.length > 0 && (
        <ul className="plain-list problems" data-testid="conflicts">
          {view.conflicts.map(([a, b]) => <li key={a + b} className="warn">Противоречие: «{title(a)}» и «{title(b)}» не могут быть правдой одновременно.</li>)}
        </ul>
      )}
      <h4 className="section-title">Улики со временем</h4>
      {timed.length === 0 ? <p className="muted">В деле пока нет улик, привязанных ко времени.</p> : (
        <ul className="plain-list place-list">
          {timed.map((ev) => (
            <li key={ev.id} data-testid={`place-${ev.id}`}>
              <span>{title(ev.id)}</span>
              <div className="seg wrap" role="group" aria-label={`Время: ${title(ev.id)}`}>
                {d.slots.map((label, i) => (
                  <button key={label} className="btn" aria-pressed={f.timeline[ev.id] === i} disabled={f.status !== 'open'} onClick={() => dispatch({ type: 'PLACE_EVIDENCE', caseId: f.id, evidenceId: ev.id, slot: f.timeline[ev.id] === i ? null : i })} data-testid={`place-${ev.id}-${i}`}>{label}</button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------- Допросы ----------

const METHOD_HINT: Record<InterrogationMethod, string> = {
  standard: 'Штатная процедура: человек рассказывает свою версию.',
  present: 'Предъявить проверенную улику и задать вопрос о конкретном противоречии.',
  skilled: 'Нужен сотрудник с анализом 4+. Открывает дополнительные ходы, но истину не гарантирует.',
  pressure: 'Показания низкой надёжности. Всё сказанное этим человеком станет сомнительным для суда. «Открытый контур» −2.',
};

function Interviews({ game, f, d }: { game: GameState; f: CaseFile; d: CaseDef }) {
  const roles = CASE_RULES.interrogation.roles;
  const firstFree = game.staff.find((p) => roles.includes(p.role) && !workerBlocker(game, p.id, roles))?.id ?? '';
  const [picked, setWho] = useState(firstFree);
  const who = picked && !workerBlocker(game, picked, roles) ? picked : firstFree;
  return (
    <div className="career" data-testid="interviews">
      <p className="hint">Самый жёсткий метод не самый верный. Предъявляйте конкретные проверенные улики; ответы бывают неполными.</p>
      {f.status === 'open' && <StaffPick game={game} roles={roles} value={who} onChange={setWho} why={() => null} testid="interrogator" />}
      <div className="card-grid">
        {d.persons.map((p) => {
          const avail = personAvailable(f, p);
          const done = f.interviews.filter((i) => i.personId === p.id);
          const task = f.tasks.find((t) => t.target === p.id);
          return (
            <article key={p.id} className="sq-card person-card" data-testid={`person-${p.id}`}>
              <header className="face-row">
                <Portrait id={p.portrait} name={p.name} size="sm" />
                <span><b>{avail ? p.name : 'Неизвестный фигурант'}</b><br /><small className="muted">{avail ? p.role : 'появится, когда найдутся основания'}</small></span>
              </header>
              {done.map((i) => (
                <p key={i.method} className="statement"><small className="muted">{METHOD_LABEL[i.method]}:</small> {p[i.method]?.text}</p>
              ))}
              {task && <span className="tag">идёт допрос · {minutesLeft(game, task.doneAt)} мин</span>}
              {avail && f.status === 'open' && !task && (
                <div className="method-list">
                  {methodsOf(p).filter((m) => !done.some((i) => i.method === m)).map((m) => {
                    const why = interrogationBlocker(game, f.id, p.id, m, who || undefined);
                    return (
                      <div key={m}>
                        <button className={`btn${m === 'pressure' ? ' danger' : ''}`} disabled={!who || !!why} onClick={() => dispatch({ type: 'INTERROGATE', caseId: f.id, personId: p.id, method: m, staffId: who })} data-testid={`ask-${p.id}-${m}`}>
                          {METHOD_LABEL[m]}{m === 'present' && p.present?.needs ? `: «${evidenceDef(d, p.present.needs)?.title}»` : ''} · {CASE_RULES.interrogation.minutes} мин
                        </button>
                        <small className={why ? 'why' : 'muted'}>{why ?? METHOD_HINT[m]}</small>
                      </div>
                    );
                  })}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Заключение ----------

const suitWord = (p: number) => (p >= 0.65 ? 'суд скорее примет' : p >= 0.4 ? 'исход в суде неясен' : 'суд скорее вернёт');

function Conclusion({ game, f, d, onContinue }: { game: GameState; f: CaseFile; d: CaseDef; onContinue: () => void }) {
  const [hyp, setHyp] = useState<string>(f.working ?? '');
  const [confirm, setConfirm] = useState<CaseDecisionKind | null>(null);
  const exp = expertiseBlocker(game, f.id);
  const house = houseById(d.houseId)?.label;
  if (f.status !== 'open') {
    const h = d.hypotheses.find((x) => x.id === f.decision?.hypothesisId);
    return (
      <div className="career" data-testid="case-decided">
        <p><b>{DECISION_LABEL[f.decision!.kind]}</b>{h ? ` по версии «${h.title}»` : ''} · смена {f.decision!.shift}.</p>
        <p className="muted">Решение записано в журнал. Если оно было ошибочным, это может вскрыться позже.</p>
        {f.revealed && <p className="warn" data-testid="case-revealed">{f.status === 'charged' ? CASE_RULES.effects.revealFalse.text : CASE_RULES.effects.closeUnsolved.text}</p>}
      </div>
    );
  }
  const decide = (k: CaseDecisionKind) => {
    dispatch({ type: 'CONCLUDE_CASE', caseId: f.id, decision: k, ...(k === 'charge' ? { hypothesisId: hyp } : {}) });
    setConfirm(null);
  };
  return (
    <div className="career" data-testid="conclusion">
      <p className="hint">Прогноз говорит о пригодности доказательств, а не о том, какая версия верна. Обвинение можно предъявить и по ошибочной версии, истина может вскрыться позже.</p>
      {f.decision?.court === 'returned' && <p className="warn">Суд продолжения вернул прошлое обвинение. Укрепите доказательства или выберите другое решение.</p>}
      <div className="table-scroll">
        <table className="staff-table" data-testid="forecast">
          <thead><tr><th>Версия</th><th>Подтверждают (допустимо / сомнительно)</th><th>Опровергают</th><th>Пригодность для суда</th></tr></thead>
          <tbody>
            {d.hypotheses.map((h) => {
              const fc = caseForecast(game, f, h.id);
              const enough = fc.admissibleSupported >= CASE_RULES.chargeMin;
              return (
                <tr key={h.id} data-testid={`forecast-${h.id}`}>
                  <td><label className="radio"><input type="radio" name="hyp" checked={hyp === h.id} onChange={() => setHyp(h.id)} /> {h.title}</label></td>
                  <td>{fc.admissibleSupported} / {fc.questionable}</td>
                  <td>{fc.contradicted}</td>
                  <td>{enough ? suitWord(courtChance(game, f, h.id)) : `мало оснований (нужно ${CASE_RULES.chargeMin} допустимых)`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <small className="muted">Обнаружено противоречий в реконструкции: {timelineView(f, d).conflicts.length}. Проверенных улик: {f.evidence.filter((e) => e.analysis !== 'none').length} из {f.evidence.length}.</small>

      <h4 className="section-title">Правовое решение</h4>
      {confirm ? (
        <div className="sq-card confirm" data-testid="confirm-box">
          <p><b>{confirm === 'charge' ? `Предъявить обвинение по версии «${d.hypotheses.find((h) => h.id === hyp)?.title}»?` : confirm === 'transfer' ? `Передать материалы (${house})?` : 'Закрыть дело без обвинения?'}</b></p>
          <small className="muted">Решение необратимо.{confirm === 'charge' ? ' Суд может вернуть обвинение, если доказательств мало или они сомнительны.' : ''}</small>
          <span className="row-actions">
            <button className="btn primary" onClick={() => decide(confirm)} data-testid="confirm-decision">Подтвердить</button>
            <button className="btn" onClick={() => setConfirm(null)}>Отмена</button>
          </span>
        </div>
      ) : (
        <div className="decision-list">
          {(['charge', 'transfer', 'close'] as const).map((k) => {
            const why = concludeBlocker(game, f.id, k, k === 'charge' ? hyp || undefined : undefined);
            const label = k === 'charge' ? 'Предъявить обвинение' : k === 'transfer' ? `Передать материалы: ${house}` : 'Закрыть дело';
            const hint = k === 'charge' ? 'Нужно не меньше 3 допустимых подтверждённых связей с выбранной версией.' : k === 'transfer' ? 'Дом разберётся сам, без огласки: отношения лучше, доверие района ниже.' : 'Без обвинения. Если преступление было, дело может всплыть.';
            return (
              <div key={k}>
                <button className={`btn${k === 'charge' ? ' primary' : ''}`} disabled={!!why} onClick={() => setConfirm(k)} data-testid={`decide-${k}`}>{label}</button>
                <small className={why ? 'why' : 'muted'}>{why ?? hint}</small>
              </div>
            );
          })}
          <div>
            <button className="btn" disabled={!!exp} onClick={() => dispatch({ type: 'REQUEST_EXPERTISE', caseId: f.id })} data-testid="request-expertise">
              Запросить внешнюю экспертизу · {formatRe(CASE_RULES.expertise.fee * 100)} РЕ
            </button>
            <small className={exp ? 'why' : 'muted'}>{exp ?? 'Перепроверит все проверенные улики точнее, один раз на дело.'}</small>
          </div>
          <div>
            <button className="btn" onClick={onContinue} data-testid="decide-continue">Продолжить расследование</button>
            <small className="muted">Вернуться к доске; решение можно принять позже.</small>
          </div>
        </div>
      )}
      <p className="muted"><small>Открытых задач: {f.tasks.length}. {f.tasks.length ? `Решение доступно после их окончания (${f.tasks.length} ${plural(f.tasks.length, 'задача', 'задачи', 'задач')}).` : ''}</small></p>
    </div>
  );
}
