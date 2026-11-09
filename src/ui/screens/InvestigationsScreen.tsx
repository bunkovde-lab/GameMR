import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ROLE_LABEL } from '../../core/content';
import {
  CASE_RULES, EVIDENCE_TYPES, METHOD_LABEL, absMinute, actionBlocker, actionPermitState, admissibility, analysisBlocker, analysisMinutes, analysisView,
  caseApproval, caseDef, caseForecast, casePermitBlocker, caseStatusWord, concludeBlocker, conclusionDef, courtChance, evidenceDef, expertiseBlocker,
  interrogationBlocker, lineVisible, linkStatus, pairBlocker, pairStatus, personAvailable, refFound, refTitle, resolveRef, supportedEdges,
  timedEvidence, timelineComplete, timelineView, workerBlocker, type CaseDef, type ConclusionDef, type LinkStatus,
} from '../../core/investigations';
import { POLITICS, houseById } from '../../core/politics';
import { formatRe } from '../../core/selectors';
import type { CaseFile, GameState, InterrogationMethod, StaffRole } from '../../core/types';
import { dispatch } from '../../store';
import { HouseCrest, artUrl, evidenceIconUrl } from '../art';
import { Icon, type IconName } from '../Icon';
import { Portrait } from '../Portrait';
import { CampaignPanel } from './CampaignPanel';

/** W9: расследования (ТЗ §11, сценарий «Неисполненный жребий»). Экран читает только ядро: скрытая истина в интерфейс не попадает. */

type Tab = 'board' | 'actions' | 'timeline' | 'interviews' | 'conclusion';
const TABS: { id: Tab; label: string }[] = [
  { id: 'board', label: 'Доска' },
  { id: 'actions', label: 'Действия' },
  { id: 'timeline', label: 'Реконструкция' },
  { id: 'interviews', label: 'Допросы' },
  { id: 'conclusion', label: 'Заключение' },
];
/** Запасные значки типов улик, если файла ART-010 для типа нет. */
const TYPE_ICON: Record<string, IconName> = {
  bio_sample: 'beaker', document: 'folder', recording: 'radio', testimony: 'person', object: 'search', finance: 'chart', registry: 'book', location: 'pin',
};
const LINK_WORD: Record<LinkStatus, string> = { proposed: 'предложена', supported: 'подтверждена', contradicted: 'опровергнута' };
const PAIR_WORD: Record<LinkStatus, string> = { proposed: 'ждёт проверки улик', supported: 'связь подтверждена', contradicted: 'связи нет' };
const KIND_WORD = { field: 'выезд', desk: 'кабинетная работа', lab: 'лаборатория' } as const;
const CASE_ART: Record<string, string> = { c1: 'case1_registry_office', c2: 'case2_clinic', c3: 'case3_lab' };
const minutesLeft = (game: GameState, doneAt: number) => Math.max(0, doneAt - absMinute(game));
const chanceWord = (p: number) => (p >= 0.65 ? 'шансы высокие' : p >= 0.4 ? 'шансы средние' : 'шансы низкие');
/** ART-010: значок вида улики; при отсутствии файла — значок из общего набора. */
function EvIcon({ type }: { type: string }) {
  const url = evidenceIconUrl(type);
  return url ? <img className="ev-icon" src={url} alt="" width={18} height={18} data-testid={`ev-icon-${type}`} /> : <Icon name={TYPE_ICON[type] ?? 'folder'} />;
}
/** Фон доски уже тёмный: затемнение слабее, чем у иллюстраций дел. */
const boardBg = () => {
  const url = artUrl('investigation_board_bg');
  return url ? { backgroundImage: `linear-gradient(rgba(10,12,16,.25), rgba(10,12,16,.25)), url(${url})` } : undefined;
};
const bg = (key: string) => {
  const url = artUrl(key);
  return url ? { backgroundImage: `linear-gradient(rgba(10,12,16,.72), rgba(10,12,16,.72)), url(${url})`, backgroundSize: 'cover' } : undefined;
};

export function InvestigationsScreen({ game, onClose }: { game: GameState; onClose: () => void }) {
  const files = game.investigations.cases;
  const [tab, setTab] = useState<string>(files.find((f) => f.status === 'open')?.id ?? files[0]?.id ?? 'campaign');
  const current = files.find((f) => f.id === tab);
  return (
    <section className="panel screen" role="region" aria-label="Расследования" data-testid="investigations-screen">
      <div className="panel-header">
        <h2><Icon name="search" /> Расследования</h2>
        <div className="tabs screen-tabs" role="tablist" aria-label="Дела и кампания">
          <button role="tab" className="btn" aria-selected={tab === 'campaign'} onClick={() => setTab('campaign')} data-testid="case-tab-campaign">Кампания</button>
          {files.map((f) => {
            const d = caseDef(f.id)!;
            return (
              <button key={f.id} role="tab" className="btn" aria-selected={tab === f.id} onClick={() => setTab(f.id)} data-testid={`case-tab-${f.id}`}>
                №{d.number} {d.title}{f.status !== 'open' ? ' ✓' : ''}
              </button>
            );
          })}
        </div>
        <button className="btn icon-only" onClick={onClose} aria-label="Вернуться к карте"><Icon name="close" /></button>
      </div>
      <div className="panel-body">
        {current ? <CaseView key={current.id} game={game} f={current} /> : <CampaignPanel game={game} />}
      </div>
    </section>
  );
}

function CaseView({ game, f }: { game: GameState; f: CaseFile }) {
  const d = caseDef(f.id)!;
  const [tab, setTab] = useState<Tab>('board');
  const loc = artUrl(CASE_ART[f.id] ?? '');
  return (
    <div className="career case-view" data-testid={`case-${f.id}`}>
      <header className={`case-head${loc ? ' with-art' : ''}`} style={loc ? { backgroundImage: `linear-gradient(90deg, rgba(10,12,16,.92) 40%, rgba(10,12,16,.4)), url(${loc})` } : undefined} data-art={CASE_ART[f.id]}>
        <p>{d.summary}</p>
        <small className="muted">
          Открыто в смену {f.openedShift} · объект в ведении: <span className="with-crest"><HouseCrest houseId={d.houseId} size={24} />{houseById(d.houseId)?.label}</span> · улик: {f.evidence.length} · <b data-testid="case-status">{caseStatusWord(f)}</b>
        </small>
      </header>
      <div className="tabs case-tabs" role="tablist" aria-label="Режимы дела">
        {TABS.map((t) => (
          <button key={t.id} role="tab" className="btn" aria-selected={tab === t.id} onClick={() => setTab(t.id)} data-testid={`case-mode-${t.id}`}>{t.label}</button>
        ))}
      </div>
      {tab === 'board' && <Board game={game} f={f} d={d} />}
      {tab === 'actions' && <Actions game={game} f={f} d={d} />}
      {tab === 'timeline' && <Timeline f={f} d={d} />}
      {tab === 'interviews' && <Interviews game={game} f={f} d={d} />}
      {tab === 'conclusion' && <Conclusion game={game} f={f} d={d} onContinue={() => setTab('board')} />}
    </div>
  );
}

// ---------- Общие элементы ----------

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
            <button key={p.id} className="btn staff-pick" aria-pressed={value === p.id} disabled={!!w} title={w ?? undefined} onClick={() => onChange(p.id)} data-testid={`${testid}-${p.id}`}>
              <Portrait id={p.id} name={p.name} health={p.health} size="xs" /> {p.name} · {ROLE_LABEL[p.role].toLowerCase()} · анализ {p.stats.analysis}
            </button>
          );
        })}
      </div>
      {people.every((p) => workerBlocker(game, p.id, roles)) && <small className="why">Нет свободных: нужен {roles.map((r) => ROLE_LABEL[r].toLowerCase()).join(' или ')}.</small>}
      {value && why(value) && <small className="why">{why(value)}</small>}
    </>
  );
}

/** Первый свободный сотрудник нужной должности (выбор игрока сохраняется, пока он свободен). */
function useWorker(game: GameState, roles: StaffRole[]) {
  const firstFree = game.staff.find((p) => roles.includes(p.role) && !workerBlocker(game, p.id, roles))?.id ?? '';
  const [picked, setWho] = useState(firstFree);
  const who = picked && !workerBlocker(game, picked, roles) ? picked : firstFree;
  return [who, setWho] as const;
}

/** Улики других дел, которые это дело может использовать (сопоставления и требования действий). */
function pinnedRefs(game: GameState, d: CaseDef): string[] {
  const refs = new Set<string>();
  for (const e of d.edges) for (const r of [e.a, e.b]) if (r.includes(':')) refs.add(r);
  for (const a of d.actions) for (const r of a.requires ?? []) if (r.includes(':')) refs.add(r);
  return [...refs].filter((r) => refFound(game, d.id, r)).sort();
}

// ---------- Доска ----------

function Board({ game, f, d }: { game: GameState; f: CaseFile; d: CaseDef }) {
  const [sel, setSel] = useState<string | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  type Line = { key: string; x1: number; y1: number; x2: number; y2: number; status: LinkStatus; pair: boolean };
  const [lines, setLines] = useState<Line[]>([]);
  const pinned = pinnedRefs(game, d);
  const key = f.links.map((l) => `${l.evidenceId}-${l.hypothesisId}`).join() + f.pairs.map((p) => `${p.a}~${p.b}`).join() + f.evidence.map((e) => e.analysis).join() + pinned.join();

  // Линии рисуются поверх доски по фактическому положению карточек (на узком экране вместо линий — подписи на карточках).
  useLayoutEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const measure = () => {
      const box = el.getBoundingClientRect();
      const at = (sel: string) => el.querySelector(sel)?.getBoundingClientRect();
      const next: Line[] = f.links.flatMap((l) => {
        const a = at(`[data-ev="${l.evidenceId}"]`);
        const b = at(`[data-hyp="${l.hypothesisId}"]`);
        if (!a || !b) return [];
        return [{ key: `${l.evidenceId}-${l.hypothesisId}`, x1: a.right - box.left, y1: a.top + a.height / 2 - box.top, x2: b.left - box.left, y2: b.top + 22 - box.top, status: linkStatus(f, d, l.evidenceId, l.hypothesisId).status, pair: false }];
      });
      for (const p of f.pairs) {
        const a = at(`[data-ev="${p.a}"]`);
        const b = at(`[data-ev="${p.b}"]`);
        if (!a || !b) continue;
        next.push({ key: `${p.a}~${p.b}`, x1: a.left + a.width / 2 - box.left, y1: a.top + a.height / 2 - box.top, x2: b.left + b.width / 2 - box.left, y2: b.top + b.height / 2 - box.top, status: pairStatus(game, f, p.a, p.b).status, pair: true });
      }
      setLines(next);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [key, sel, f, d, game]);

  const pairsOf = (id: string) => f.pairs.filter((p) => p.a === id || p.b === id).length;
  return (
    <div className="board-wrap">
      <p className="hint">Связи строите вы: улика → версия и улика ↔ улика. Линия остаётся «предложенной», пока улики не проверены. Доска не говорит, какая версия верна.</p>
      <div className="board" ref={boardRef} data-testid="board" style={boardBg()} data-art="investigation_board_bg">
        <svg className="board-lines" aria-hidden="true">
          {lines.map((l) => {
            const mx = (l.x1 + l.x2) / 2;
            return l.pair
              ? <line key={l.key} className={`link pair ${l.status}`} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} />
              : <path key={l.key} className={`link ${l.status}`} d={`M${l.x1},${l.y1} C${mx},${l.y1} ${mx},${l.y2} ${l.x2},${l.y2}`} />;
          })}
        </svg>
        <div className="evidence-grid" aria-label="Улики">
          {f.evidence.map((ev) => {
            const def = evidenceDef(d, ev.id)!;
            const a = analysisView(ev, def);
            const task = f.tasks.find((t) => t.target === ev.id);
            const adm = admissibility(game, f, ev, def);
            const np = pairsOf(ev.id);
            return (
              <button key={ev.id} data-ev={ev.id} className={`evidence-card${sel === ev.id ? ' selected' : ''}`} aria-pressed={sel === ev.id} onClick={() => setSel(sel === ev.id ? null : ev.id)} data-testid={`ev-${ev.id}`}>
                <span className="ev-type"><EvIcon type={def.type} /> {EVIDENCE_TYPES[def.type]}</span>
                <b>{def.title}</b>
                <span className="ev-tags">
                  <span className={`tag ${a.tone}`}>{task ? `в работе · ${minutesLeft(game, task.doneAt)} мин` : a.word}</span>
                  {!adm.ok && <span className="tag bad">сомнительна</span>}
                  {np > 0 && <span className="tag">сопоставлений: {np}</span>}
                </span>
                {f.links.filter((l) => l.evidenceId === ev.id).map((l) => {
                  const st = linkStatus(f, d, ev.id, l.hypothesisId).status;
                  return <small key={l.hypothesisId} className={`link-chip ${st}`}>→ {d.hypotheses.find((h) => h.id === l.hypothesisId)?.title}: {LINK_WORD[st]}</small>;
                })}
              </button>
            );
          })}
          {pinned.length > 0 && <h5 className="section-title pinned-title">Из других дел</h5>}
          {pinned.map((r) => {
            const x = resolveRef(game, d.id, r);
            const a = analysisView(x.ev!, x.def!);
            return (
              <button key={r} data-ev={r} className={`evidence-card pinned${sel === r ? ' selected' : ''}`} aria-pressed={sel === r} onClick={() => setSel(sel === r ? null : r)} data-testid={`ev-${r.replace(':', '-')}`}>
                <span className="ev-type"><EvIcon type={x.def!.type} /> дело №{x.case!.number}</span>
                <b>{x.def!.title}</b>
                <span className="ev-tags"><span className={`tag ${a.tone}`}>{a.word}</span></span>
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
      <PairList game={game} f={f} d={d} />
      {sel && !sel.includes(':') && <EvidencePanel key={sel} game={game} f={f} d={d} id={sel} pinned={pinned} onClose={() => setSel(null)} />}
      {sel?.includes(':') && <PinnedPanel game={game} f={f} d={d} r={sel} onClose={() => setSel(null)} />}
      {!sel && <p className="muted">Выберите улику: источник, допустимость, проверка, связи с версиями и сопоставление с другой уликой.</p>}
    </div>
  );
}

function PairList({ game, f, d }: { game: GameState; f: CaseFile; d: CaseDef }) {
  if (!f.pairs.length) return null;
  return (
    <div className="pair-list" data-testid="pair-list">
      <h5 className="section-title">Сопоставления · подтверждено {supportedEdges(game, f)} из {f.pairs.length}</h5>
      <ul className="plain-list">
        {f.pairs.map((p) => {
          const st = pairStatus(game, f, p.a, p.b);
          return (
            <li key={`${p.a}~${p.b}`} className={`pair-row ${st.status}`} data-testid={`pair-${p.a}-${p.b.replace(':', '-')}`}>
              <span>«{refTitle(game, d.id, p.a)}» ↔ «{refTitle(game, d.id, p.b)}»: <b>{PAIR_WORD[st.status]}</b></span>
              {st.edge && <small className="insight"><b>{st.edge.question}</b> {st.edge.insight}</small>}
              {f.status === 'open' && <button className="btn" onClick={() => dispatch({ type: 'UNLINK_PAIR', caseId: f.id, a: p.a, b: p.b })} aria-label="Убрать сопоставление">Убрать</button>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function PairPicker({ game, f, d, id, pinned }: { game: GameState; f: CaseFile; d: CaseDef; id: string; pinned: string[] }) {
  const others = [...f.evidence.map((e) => e.id).filter((x) => x !== id), ...pinned];
  return (
    <>
      <h5 className="section-title">Сопоставить с другой уликой</h5>
      <small className="muted">Подтвердится, только если обе улики проверены и между ними действительно есть связь. Ложное сопоставление доска покажет как «связи нет».</small>
      <div className="seg wrap" role="group" aria-label="Сопоставить с">
        {others.map((o) => {
          const paired = f.pairs.some((p) => (p.a === id && p.b === o) || (p.a === o && p.b === id));
          const why = paired ? null : pairBlocker(game, f.id, id, o);
          return (
            <button key={o} className="btn" aria-pressed={paired} disabled={f.status !== 'open' || !!why} onClick={() => dispatch({ type: paired ? 'UNLINK_PAIR' : 'LINK_PAIR', caseId: f.id, a: id, b: o })} data-testid={`pair-with-${o.replace(':', '-')}`}>
              {paired ? '✓ ' : '↔ '}{refTitle(game, d.id, o)}
            </button>
          );
        })}
      </div>
    </>
  );
}

function EvidencePanel({ game, f, d, id, pinned, onClose }: { game: GameState; f: CaseFile; d: CaseDef; id: string; pinned: string[]; onClose: () => void }) {
  const ev = f.evidence.find((e) => e.id === id)!;
  const def = evidenceDef(d, id)!;
  const a = analysisView(ev, def);
  const adm = admissibility(game, f, ev, def);
  const A = CASE_RULES.analysis[def.analysis];
  const task = f.tasks.find((t) => t.target === id);
  const [who, setWho] = useWorker(game, A.roles);
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

      <PairPicker game={game} f={f} d={d} id={id} pinned={pinned} />

      {open && (
        <>
          <h5 className="section-title">{ev.analysis === 'none' ? 'Проверить' : 'Проверить ещё раз'}: {A.label}</h5>
          {task ? <p className="tag">идёт: {game.staff.find((p) => p.id === task.staffId)?.name}, осталось {minutesLeft(game, task.doneAt)} мин</p> : (
            <>
              <small className="muted">≈{analysisMinutes(game, def)} мин{A.reagents ? ` · реагентов: ${A.reagents} (есть ${game.resources.reagents})` : ''}. Результат зависит от сотрудника; повторная проверка точнее.</small>
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

function PinnedPanel({ game, f, d, r, onClose }: { game: GameState; f: CaseFile; d: CaseDef; r: string; onClose: () => void }) {
  const x = resolveRef(game, d.id, r);
  const a = analysisView(x.ev!, x.def!);
  return (
    <aside className="sq-card evidence-panel" data-testid="evidence-panel">
      <header><b>{x.def!.title}</b><button className="btn icon-only" onClick={onClose} aria-label="Закрыть карточку улики"><Icon name="close" /></button></header>
      <p>{x.def!.text}</p>
      <dl className="kv">
        <dt>Из дела</dt><dd>№{x.case!.number} «{x.case!.title}»</dd>
        <dt>Анализ</dt><dd className={a.tone}>{a.word}</dd>
      </dl>
      {a.text && <p className="result-text">{a.text}</p>}
      <small className="muted">Улика другого дела: проверять и связывать с версиями её можно только там. Здесь её можно сопоставить с уликой этого дела — выберите улику этого дела и нажмите «↔».</small>
      {f.status === 'open' && <p className="muted"><small>Сопоставлений с ней: {f.pairs.filter((p) => p.b === r).length}.</small></p>}
    </aside>
  );
}

// ---------- Следственные действия и разрешения ----------

function Actions({ game, f, d }: { game: GameState; f: CaseFile; d: CaseDef }) {
  return (
    <div className="career" data-testid="case-actions">
      <p className="hint">Следственные действия добывают новые улики. Закрытые записи Домов и обыски требуют разрешения: ордер выдаёт суд, допуск — Дом. Запрос стоит пошлину и рассматривается до часа; отказ возможен.</p>
      <div className="card-grid">
        {d.actions.map((a) => <ActionCard key={a.id} game={game} f={f} d={d} id={a.id} />)}
      </div>
    </div>
  );
}

function ActionCard({ game, f, d, id }: { game: GameState; f: CaseFile; d: CaseDef; id: string }) {
  const a = d.actions.find((x) => x.id === id)!;
  const roles = CASE_RULES.actionRoles[a.kind];
  const [who, setWho] = useWorker(game, roles);
  const done = f.actionsDone.includes(a.id);
  const task = f.tasks.find((t) => t.target === a.id);
  const permit = actionPermitState(game, f, a);
  const why = actionBlocker(game, f.id, a.id, who || undefined);
  const permitWhy = a.permit ? casePermitBlocker(game, f.id, a.id) : null;
  const fee = a.permit ? POLITICS.permits[a.permit].fee : 0;
  const permitName = a.permit === 'judicial' ? 'ордер суда' : `допуск: ${houseById(a.houseId ?? '')?.label}`;
  const denied = game.politics.permits.filter((p) => p.caseId === f.id && p.actionId === a.id && p.status === 'denied').length;
  const allFound = a.reveals.every((r) => f.evidence.some((e) => e.id === r));
  return (
    <article className={`sq-card action-card${done ? ' done' : ''}`} data-testid={`action-${a.id}`}>
      <header><b>{a.label}</b><span className="tag">{KIND_WORD[a.kind]} · {a.minutes} мин</span></header>
      {a.hint && <small className="muted">{a.hint}</small>}
      {(a.requires ?? []).length > 0 && (
        <small>Нужно: {(a.requires ?? []).map((r) => (
          <span key={r} className={refFound(game, f.id, r) ? 'good' : 'why'}> {refFound(game, f.id, r) ? '✓' : '✗'} «{refTitle(game, f.id, r)}»</span>
        ))}</small>
      )}
      {a.weak && <small className="warn">Обходной путь: {a.weak}</small>}
      {a.permit && !done && (
        <div className="permit-row" data-testid={`permit-${a.id}`}>
          <small>
            {a.permit === 'interagency' && a.houseId && <HouseCrest houseId={a.houseId} size={24} />}
            Основание — {permitName}:{' '}
            <b className={permit === 'granted' ? 'good' : permit === 'missing' ? 'why' : ''}>
              {permit === 'granted' ? 'есть' : permit === 'pending' ? 'запрос рассматривается' : denied ? `нет (отказов: ${denied})` : 'нет'}
            </b>
          </small>
          {permit === 'missing' && f.status === 'open' && (
            <>
              <button className="btn" disabled={!!permitWhy} onClick={() => dispatch({ type: 'REQUEST_CASE_PERMIT', caseId: f.id, actionId: a.id })} data-testid={`permit-req-${a.id}`}>
                Запросить {a.permit === 'judicial' ? 'ордер' : 'допуск'}{fee ? ` · ${formatRe(fee * 100)} РЕ` : ''}
              </button>
              <small className={permitWhy ? 'why' : 'muted'}>{permitWhy ?? `${chanceWord(caseApproval(game, f, a))}. ${a.permit === 'judicial' ? 'Суд учитывает проверенные улики, доверие района и нарушения.' : 'Дом учитывает отношения с дирекцией.'}`}</small>
            </>
          )}
        </div>
      )}
      {done ? (
        <small className="good">Выполнено{allFound ? `: ${a.reveals.map((r) => `«${refTitle(game, f.id, r)}»`).join(', ')}` : ''}.</small>
      ) : task ? (
        <span className="tag">идёт: {game.staff.find((p) => p.id === task.staffId)?.name} · {minutesLeft(game, task.doneAt)} мин</span>
      ) : f.status === 'open' && (
        <>
          <StaffPick game={game} roles={roles} value={who} onChange={setWho} why={() => null} testid={`actor-${a.id}`} />
          <button className="btn primary" disabled={!who || !!why} onClick={() => dispatch({ type: 'CASE_ACTION', caseId: f.id, actionId: a.id, staffId: who })} data-testid={`action-start-${a.id}`}>Начать</button>
          {why && <small className="why">{why}</small>}
        </>
      )}
    </article>
  );
}

// ---------- Реконструкция ----------

function Timeline({ f, d }: { f: CaseFile; d: CaseDef }) {
  const view = timelineView(f, d);
  const timed = timedEvidence(f, d);
  const title = (id: string) => evidenceDef(d, id)?.title;
  const complete = timelineComplete(f, d);
  return (
    <div className="career" data-testid="timeline">
      <p className="hint">Восстановите последовательность событий сами. Источник называет своё время, но источники могут противоречить друг другу или быть подделаны. Готовой хронологии нет.</p>
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
          {view.conflicts.map(([a, b]) => <li key={a + b} className="warn">Противоречие: «{title(a)}» и «{title(b)}» не могут быть правдой одновременно. Одна из улик подделана или неполна.</li>)}
        </ul>
      )}
      {complete && view.conflicts.length === 0 && <p className="good" data-testid="timeline-complete">Последовательность восстановлена: все улики со временем стоят на своих местах.</p>}
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
  standard: 'Человек рассказывает свою версию.',
  present: 'Предъявить проверенные улики и спросить о конкретном противоречии.',
  protect: 'Предложить защиту: откроет то, что человек скрывает из страха.',
  negotiate: 'Переговоры на условиях собеседника.',
  pressure: 'Показания низкой надёжности: всё сказанное этим человеком станет сомнительным для суда. Доверительные ходы закроются. «Открытый контур» −2.',
};

function Interviews({ game, f, d }: { game: GameState; f: CaseFile; d: CaseDef }) {
  const roles = CASE_RULES.interrogation.roles;
  const [who, setWho] = useWorker(game, roles);
  return (
    <div className="career interviews" data-testid="interviews" style={bg('interrogation_room_bg')} data-art="interrogation_room_bg">
      <p className="hint">Вопросы открываются, когда в деле есть улики, на которые можно сослаться. Предъявлять можно только проверенное. Самый жёсткий метод не самый верный.</p>
      {f.status === 'open' && <StaffPick game={game} roles={roles} value={who} onChange={setWho} why={() => null} testid="interrogator" />}
      <div className="card-grid">
        {d.persons.map((p) => {
          const avail = personAvailable(game, f, p);
          const task = f.tasks.find((t) => t.target === p.id);
          const asked = p.lines.filter((l) => f.asked.includes(`${p.id}:${l.id}`));
          const open = p.lines.filter((l) => !f.asked.includes(`${p.id}:${l.id}`) && lineVisible(game, f, l));
          const hidden = p.lines.filter((l) => !f.asked.includes(`${p.id}:${l.id}`) && !lineVisible(game, f, l)).length;
          return (
            <article key={p.id} className="sq-card person-card" data-testid={`person-${p.id}`}>
              <header className="face-row">
                {/* Пока фигурант неизвестен, лицо не показываем: иначе арт выдаёт, кто появится в деле. */}
                <Portrait id={avail ? p.portrait : 'npc_unknown'} name={avail ? p.name : '?'} size="sm" />
                <span><b>{avail ? p.name : 'Фигурант пока неизвестен'}</b><br /><small className="muted">{avail ? p.role : p.requiresFlag ? 'нужно сначала найти человека' : 'появится, когда найдутся основания'}</small></span>
              </header>
              {avail && asked.map((l) => (
                <p key={l.id} className={`statement${l.method === 'pressure' ? ' tainted' : ''}`} data-testid={`said-${p.id}-${l.id}`}>
                  <small className="muted">{METHOD_LABEL[l.method]}{l.needs?.length ? ` («${l.needs.map((r) => refTitle(game, f.id, r)).join('», «')}»)` : ''}:</small> {l.text}
                </p>
              ))}
              {task && <span className="tag">идёт допрос · {minutesLeft(game, task.doneAt)} мин</span>}
              {avail && f.status === 'open' && !task && (
                <div className="method-list">
                  {open.map((l) => {
                    const why = interrogationBlocker(game, f.id, p.id, l.id, who || undefined);
                    return (
                      <div key={l.id}>
                        <button className={`btn${l.method === 'pressure' ? ' danger' : ''}`} disabled={!who || !!why} onClick={() => dispatch({ type: 'INTERROGATE', caseId: f.id, personId: p.id, lineId: l.id, staffId: who })} data-testid={`ask-${p.id}-${l.id}`}>
                          {METHOD_LABEL[l.method]}{l.needs?.length ? `: ${l.needs.map((r) => `«${refTitle(game, f.id, r)}»`).join(' + ')}` : ''} · {CASE_RULES.interrogation.minutes} мин
                        </button>
                        <small className={why ? 'why' : 'muted'}>{why ?? METHOD_HINT[l.method]}</small>
                      </div>
                    );
                  })}
                  {hidden > 0 && <small className="muted">Ещё вопросов: {hidden}. Откроются с новыми уликами.</small>}
                  {!open.length && !hidden && <small className="muted">Больше спросить нечего.</small>}
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
const KIND_TAG: Record<ConclusionDef['kind'], string> = { charge: 'обвинение', final: 'итоговое решение', close: 'закрытие' };

function Conclusion({ game, f, d, onContinue }: { game: GameState; f: CaseFile; d: CaseDef; onContinue: () => void }) {
  const [hyp, setHyp] = useState<string>(f.working ?? '');
  const [confirm, setConfirm] = useState<string | null>(null);
  const exp = expertiseBlocker(game, f.id);
  if (f.status !== 'open') {
    const c = conclusionDef(d, f.decision!.conclusionId);
    const h = d.hypotheses.find((x) => x.id === f.decision?.hypothesisId);
    return (
      <div className="career" data-testid="case-decided">
        <p><b>{c?.label}</b>{h ? ` по версии «${h.title}»` : ''} · смена {f.decision!.shift}.</p>
        <p className="muted">{c?.hint}</p>
        <p className="muted">Решение записано в журнал. Если оно было ошибочным, это может вскрыться позже.</p>
        {f.revealed && <p className="warn" data-testid="case-revealed">{f.status === 'charged' ? CASE_RULES.revealFalse.text : c?.reveal?.text}</p>}
      </div>
    );
  }
  const chargeHyps = new Set(d.conclusions.flatMap((c) => c.hypotheses ?? []));
  const decide = (c: ConclusionDef) => {
    dispatch({ type: 'CONCLUDE_CASE', caseId: f.id, conclusionId: c.id, ...(c.kind === 'charge' ? { hypothesisId: hyp } : {}) });
    setConfirm(null);
  };
  const cur = confirm ? conclusionDef(d, confirm) : undefined;
  return (
    <div className="career" data-testid="conclusion">
      <p className="hint">Прогноз говорит о пригодности доказательств, а не о том, какая версия верна. Обвинить можно и по ошибочной версии: истина может вскрыться позже.</p>
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
                  <td><label className="radio"><input type="radio" name="hyp" checked={hyp === h.id} onChange={() => setHyp(h.id)} disabled={!chargeHyps.has(h.id)} /> {h.title}</label></td>
                  <td>{fc.admissibleSupported} / {fc.questionable}</td>
                  <td>{fc.contradicted}</td>
                  <td>{!chargeHyps.has(h.id) ? 'обвинения по этой версии нет' : enough ? suitWord(courtChance(game, f, h.id)) : `мало оснований (нужно ${CASE_RULES.chargeMin} допустимых)`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <small className="muted">
        Подтверждённых сопоставлений улик: {supportedEdges(game, f)}. Противоречий в реконструкции: {timelineView(f, d).conflicts.length}.
        Проверенных улик: {f.evidence.filter((e) => e.analysis !== 'none').length} из {f.evidence.length}.
      </small>

      <h4 className="section-title">Правовое решение</h4>
      {cur ? (
        <div className="sq-card confirm" data-testid="confirm-box">
          <p><b>{cur.label}{cur.kind === 'charge' ? ` по версии «${d.hypotheses.find((h) => h.id === hyp)?.title}»` : ''}?</b></p>
          <small className="muted">Решение необратимо. {cur.hint}{cur.kind === 'charge' ? ' Суд может вернуть обвинение, если доказательств мало или они сомнительны.' : ''}</small>
          <span className="row-actions">
            <button className="btn primary" onClick={() => decide(cur)} data-testid="confirm-decision">Подтвердить</button>
            <button className="btn" onClick={() => setConfirm(null)}>Отмена</button>
          </span>
        </div>
      ) : (
        <div className="decision-list">
          {d.conclusions.map((c) => {
            const why = concludeBlocker(game, f.id, c.id, c.kind === 'charge' ? hyp || undefined : undefined);
            return (
              <div key={c.id}>
                <button className={`btn${c.kind === 'charge' ? ' primary' : ''}`} disabled={!!why} onClick={() => setConfirm(c.id)} data-testid={`decide-${c.id}`}>
                  {c.label}{c.money ? ` · ${c.money > 0 ? '+' : ''}${formatRe(c.money * 100)} РЕ` : ''}
                </button>
                <small className={why ? 'why' : 'muted'}><span className="tag">{KIND_TAG[c.kind]}</span> {why ?? c.hint}</small>
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
      {f.tasks.length > 0 && <p className="muted"><small>Идёт работа по делу: {f.tasks.length}. Решение будет доступно после её окончания.</small></p>}
    </div>
  );
}
