import { useState } from 'react';
import { ROLE_LABEL } from '../../core/content';
import { equipmentType } from '../../core/dispatch';
import { researchCells } from '../../core/facilities';
import {
  BRANCHES, PROJECTS, PROTOCOL_IDS, RESEARCH, experimentalFail, fabricateBlocker, projectView, reagentSupply, researcherBlocker,
  stageCost, stagesFor, stored, type ProjectDef,
} from '../../core/research';
import { formatRe } from '../../core/selectors';
import type { GameState, ResearchProtocol } from '../../core/types';
import { dispatch } from '../../store';

const STATUS: Record<string, string> = {
  locked: 'закрыт', available: 'доступен', queued: 'ждёт ячейку', active: 'идёт', blocked_inputs: 'стоит: нет ресурсов',
  blocked_staff: 'стоит: нет исследователя', completed: 'завершён', failed: 'провален',
};

/** W7 (часть 2): Дирекция — Проекты (UI-18). */
export function ProjectsTab({ game }: { game: GameState }) {
  const running = game.research.filter((p) => ['queued', 'active', 'blocked_inputs', 'blocked_staff'].includes(p.status)).length;
  return (
    <div className="career" data-testid="dir-projects">
      <dl className="chips">
        <div><dt>Ячейки лаборатории</dt><dd data-testid="cells">{Math.min(running, researchCells(game))} / {researchCells(game)}</dd></div>
        <div><dt>Реагенты</dt><dd data-testid="reagents">{game.resources.reagents} / {RESEARCH.reagents.cap}</dd></div>
        <div><dt>Поставка</dt><dd>+{reagentSupply(game)} за смену</dd></div>
      </dl>
      <p className="hint">Этапы оплачиваются деньгами и реагентами между сменами. Исследователь на время проекта выходит из отряда. Реагенты нельзя купить сразу: они приходят с поставкой.</p>
      <div className="branch-grid">
        {BRANCHES.map((b) => (
          <section key={b} className="sq-card branch" data-testid={`rbranch-${b}`}>
            <header><b>{RESEARCH.branches[b]}</b></header>
            <ol className="node-list">
              {PROJECTS.filter((d) => d.branch === b).map((d) => <ProjectRow key={d.id} game={game} d={d} />)}
            </ol>
          </section>
        ))}
      </div>
    </div>
  );
}

function ProjectRow({ game, d }: { game: GameState; d: ProjectDef }) {
  const v = projectView(game, d.id);
  const st = stored(game, d.id);
  const [open, setOpen] = useState(false);
  const canStart = v.status === 'available' || v.status === 'failed';
  return (
    <li className={v.status === 'completed' ? 'learned' : ''} data-testid={`project-${d.id}`}>
      <span><b>{d.label}</b><small>{d.result}</small></span>
      <small className={`pstatus st-${v.status}`}>{STATUS[v.status]}{st && st.status !== 'completed' && st.status !== 'failed' ? ` · этап ${st.stagesDone} из ${st.stagesTotal} · ведёт ${game.staff.find((p) => p.id === st.researcherId)?.name}` : ''}</small>
      {v.reason && <small className="why">{v.reason}</small>}
      {canStart && !open && (
        <button className="btn" onClick={() => setOpen(true)} data-testid={`plan-${d.id}`}>Начать…</button>
      )}
      {canStart && open && <StartForm game={game} d={d} onDone={() => setOpen(false)} />}
      {st && ['queued', 'active', 'blocked_inputs', 'blocked_staff'].includes(st.status) && (
        <button className="btn danger" onClick={() => dispatch({ type: 'CANCEL_PROJECT', projectId: d.id })} data-testid={`stop-${d.id}`}>Остановить</button>
      )}
      {v.status === 'completed' && d.fabricate && (() => {
        const why = fabricateBlocker(game, d.id);
        const t = equipmentType(d.fabricate.typeId);
        return (
          <>
            <button className="btn" disabled={!!why} onClick={() => dispatch({ type: 'FABRICATE', projectId: d.id })} data-testid={`fab-${d.id}`}>
              Изготовить {t?.label.toLowerCase()} ×{d.fabricate.units} · {d.fabricate.cost} РЕ{d.fabricate.reagents ? ` · ${d.fabricate.reagents} реаг.` : ''}
            </button>
            {why && <small className="why">{why}</small>}
          </>
        );
      })()}
    </li>
  );
}

function StartForm({ game, d, onDone }: { game: GameState; d: ProjectDef; onDone: () => void }) {
  const [protocol, setProtocol] = useState<ResearchProtocol>('conservative');
  const people = game.staff.filter((p) => d.roles.includes(p.role) && p.health !== 'dead');
  const free = people.filter((p) => !researcherBlocker(game, d.id, p.id));
  const [who, setWho] = useState(free[0]?.id ?? '');
  const researcher = game.staff.find((p) => p.id === who);
  const stages = stagesFor(d, protocol);
  const cost = stageCost(d, protocol);
  const P = RESEARCH.protocols[protocol];
  return (
    <div className="start-form" data-testid={`start-form-${d.id}`}>
      <div className="seg" role="group" aria-label="Протокол">
        {PROTOCOL_IDS.map((id) => (
          <button key={id} className="btn" aria-pressed={protocol === id} onClick={() => setProtocol(id)} data-testid={`proto-${d.id}-${id}`}>{RESEARCH.protocols[id].label}</button>
        ))}
      </div>
      <small className="muted">
        {P.hint}. {stages} этап(а) × {formatRe(cost)} РЕ{d.reagentsPerStage ? ` и ${d.reagentsPerStage} реаг.` : ''} = {formatRe(cost * stages)} РЕ.
        {protocol === 'experimental' && researcher ? ` Риск провала на каждом этапе: ${Math.round(experimentalFail(game, researcher) * 100)}%.` : ''}
        {protocol === 'accelerated' ? ` Осложнение: ${Math.round((P.complication ?? 0) * 100)}% на этап.` : ''}
      </small>
      <div className="seg" role="group" aria-label="Исследователь">
        {people.map((p) => {
          const why = researcherBlocker(game, d.id, p.id);
          return (
            <button key={p.id} className="btn" aria-pressed={who === p.id} disabled={!!why} title={why ?? undefined} onClick={() => setWho(p.id)} data-testid={`res-${d.id}-${p.id}`}>
              {p.name} · анализ {p.stats.analysis}
            </button>
          );
        })}
      </div>
      {free.length === 0 && <small className="why">Нет свободных: нужен {d.roles.map((r) => ROLE_LABEL[r].toLowerCase()).join(' или ')}.</small>}
      <span className="row-actions">
        <button className="btn primary" disabled={!who || !!researcherBlocker(game, d.id, who)} onClick={() => { dispatch({ type: 'START_PROJECT', projectId: d.id, protocol, researcherId: who }); onDone(); }} data-testid={`start-${d.id}`}>Начать</button>
        <button className="btn" onClick={onDone}>Отмена</button>
      </span>
    </div>
  );
}
