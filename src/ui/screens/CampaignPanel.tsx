import { useState } from 'react';
import { CAMPAIGN, storyNode, visibleNodes } from '../../core/campaign';
import { caseDef, caseFile, caseStatusWord, CASES } from '../../core/investigations';
import { INCIDENT_TEMPLATES } from '../../core/content';
import { OP_RULES, SPECIAL_OPS, fitMembers, opAvailability, opState, startOpBlocker } from '../../core/specialOps';
import type { GameState } from '../../core/types';
import { dispatch } from '../../store';
import { ArtSlot } from '../art';

/** W9: вкладка «Кампания» — сюжетное решение смены, особые операции, хроника и состояние трёх дел. */
export function CampaignPanel({ game }: { game: GameState }) {
  return (
    <div className="career campaign" data-testid="campaign-panel">
      <ArtSlot artKey="campaign_title" label="Заставка кампании" className="campaign-title">
        <h3>«{CAMPAIGN.title}»</h3>
        <small>Смена {Math.min(game.shift, CAMPAIGN.lastShift)} из {CAMPAIGN.lastShift}</small>
      </ArtSlot>
      <StoryCard game={game} />
      <h4 className="section-title">Особые операции</h4>
      <div className="card-grid">
        {SPECIAL_OPS.map((o) => <OpCard key={o.id} game={game} id={o.id} />)}
      </div>
      <h4 className="section-title">Дела</h4>
      <ul className="plain-list" data-testid="campaign-cases">
        {CASES.map((c) => {
          const f = caseFile(game, c.id);
          return (
            <li key={c.id}>
              <b>№{c.number} «{c.title}»</b> · смены {c.fromShift}–{c.toShift} ·{' '}
              {f ? caseStatusWord(f) : game.shift < c.fromShift ? 'ещё не началось' : game.shift > c.toShift ? 'не открыто' : `откроется после операции на вызове «${INCIDENT_TEMPLATES.find((t) => t.id === c.templateId)?.title}»`}
            </li>
          );
        })}
      </ul>
      <h4 className="section-title">Хроника</h4>
      <ol className="plain-list chronicle" data-testid="chronicle">
        {visibleNodes(game).map((n) => {
          const chosen = n.options?.find((o) => o.id === game.campaign.choices[String(n.shift)]);
          return (
            <li key={n.shift}>
              <b>Смена {n.shift}. {n.title}.</b>{chosen ? ` Решение: ${chosen.label.toLowerCase()}.` : ''}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Сюжетный узел текущей смены: текст и решение (если есть). Тот же блок показывается на брифинге. */
export function StoryCard({ game, compact = false }: { game: GameState; compact?: boolean }) {
  const n = storyNode(game.shift);
  if (!n) return null;
  const chosen = game.campaign.choices[String(n.shift)];
  return (
    <article className="sq-card story-card" data-testid="story-card">
      <header><b>Смена {n.shift}: «{n.title}»</b></header>
      <p>{n.text}</p>
      {n.options && (
        chosen ? (
          <p className="good" data-testid="story-chosen">Решение принято: {n.options.find((o) => o.id === chosen)?.label}.</p>
        ) : (
          <div className="decision-list">
            {n.options.map((o) => (
              <div key={o.id}>
                <button className="btn" onClick={() => dispatch({ type: 'STORY_CHOICE', shift: n.shift, optionId: o.id })} data-testid={`story-choice-${o.id}`}>{o.label}</button>
                <small className="muted">{o.hint}</small>
              </div>
            ))}
            {!compact && <small className="muted">Если не ответить до конца смены, предложение считается отклонённым.</small>}
          </div>
        )
      )}
    </article>
  );
}

function OpCard({ game, id }: { game: GameState; id: string }) {
  const d = SPECIAL_OPS.find((o) => o.id === id)!;
  const st = opState(game, id);
  const av = opAvailability(game, id);
  const squads = game.squads.filter((q) => q.status === 'ready' && fitMembers(game, q.id).length >= OP_RULES.minMembers);
  const [squad, setSquad] = useState('');
  const sq = squads.find((q) => q.id === squad)?.id ?? squads[0]?.id ?? '';
  const why = sq ? startOpBlocker(game, id, sq) : av.why ?? `Нет готового отряда: нужно не меньше ${OP_RULES.minMembers} годных к выезду.`;
  const OUT = { success: 'успешно', partial: 'частично', failure: 'провал' } as const;
  return (
    <article className="sq-card op-card" data-testid={`op-${id}`}>
      <ArtSlot artKey={d.art} label={`Операция «${d.title}»`} className="op-thumb" />
      <header><b>«{d.title}»</b><span className="tag">дело №{caseDef(d.caseId)?.number} · смены {d.fromShift}–{d.toShift}</span></header>
      {st?.report ? (
        <p className={st.report.outcome === 'success' ? 'good' : st.report.outcome === 'failure' ? 'why' : ''}>Проведена: {OUT[st.report.outcome]}.</p>
      ) : !av.open ? (
        <small className="muted">{av.why}</small>
      ) : (
        <>
          <small className="muted">{d.brief}</small>
          <div className="seg wrap" role="group" aria-label="Отряд">
            {squads.map((q) => (
              <button key={q.id} className="btn" aria-pressed={sq === q.id} onClick={() => setSquad(q.id)} data-testid={`op-squad-${q.id}`}>
                {q.name} · {fitMembers(game, q.id).length} чел.
              </button>
            ))}
          </div>
          <button className="btn primary" disabled={!!why} onClick={() => dispatch({ type: 'START_SPECIAL_OP', opId: id, squadId: sq })} data-testid={`op-start-${id}`}>Начать операцию</button>
          <small className={why ? 'why' : 'muted'}>{why ?? 'Время остановится: каждое решение по фазам займёт полчаса.'}</small>
        </>
      )}
    </article>
  );
}
