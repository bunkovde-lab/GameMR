import { DISPATCH_RULES } from '../../core/dispatch';
import { HEALTH_LOG } from '../../core/healthText';
import type { GameState, HealthState, Staff } from '../../core/types';
import { SQUAD_STATUS } from '../labels';
import { Portrait } from '../Portrait';

const initials = (name: string) => name.split(' ').map((w) => w[0]).join('');

/** Мест в отряде — из правил отправки (content/dispatch_v1.json), не из арта. */
const SLOTS = DISPATCH_RULES.squad.maxMembers;
/** Красная полоса — с того же порога, с которого сотрудник не выезжает («переутомление»). */
const EXHAUSTED = DISPATCH_RULES.squad.exhaustedFatigue;
/** Жёлтая полоса — только подсказка глазу, на баланс не влияет. */
const TIRED = Math.round(EXHAUSTED / 2);

const WOUNDED: HealthState[] = ['light_injury', 'serious_injury', 'critical'];

export const fatigueTone = (fatigue: number) => (fatigue >= EXHAUSTED ? 'red' : fatigue >= TIRED ? 'amber' : 'green');
export const healthTone = (h: HealthState) =>
  WOUNDED.includes(h) ? 'wounded' : h === 'recovering' ? 'recovering' : h === 'dead' || h === 'missing' ? 'lost' : 'ok';

export const memberSummary = (p: Staff) => `${p.name} — ${HEALTH_LOG[p.health]}, усталость ${p.fatigue}%`;

/** Лицо бойца в карточке отряда: портрет, значок ранения и полоса усталости под ним. */
export function SquadMember({ p, testPrefix = 'squad-member' }: { p: Staff; testPrefix?: string }) {
  const tone = healthTone(p.health);
  const f = Math.max(0, Math.min(100, p.fatigue));
  return (
    <span className={`sq-member hp-${tone}`} data-testid={`${testPrefix}-${p.id}`} data-health={p.health} title={memberSummary(p)}>
      <Portrait id={p.id} name={p.name} health={p.health} size="xs" />
      {tone !== 'ok' && <span className="sq-badge" aria-hidden="true">{tone === 'lost' ? '✕' : '✚'}</span>}
      <span className={`sq-fatigue tone-${fatigueTone(f)}`} aria-hidden="true"><i style={{ width: `${f}%` }} /></span>
    </span>
  );
}

export function SquadStrip({ game, selectedId, onSelect }: { game: GameState; selectedId: string | null; onSelect: (id: string) => void }) {
  const ready = game.squads.filter((q) => q.status === 'ready').length;
  return (
    <section className="panel squads" aria-label="Оперативные группы" data-testid="squads">
      <div className="panel-header">
        <h2>Оперативные группы</h2>
        <small className="ready-count">{ready} готово</small>
      </div>
      <ul className="squad-list">
        {game.squads.map((q) => {
          const st = SQUAD_STATUS[q.status];
          const members = q.memberIds.map((id) => game.staff.find((p) => p.id === id)!).filter(Boolean);
          const wounded = members.filter((p) => WOUNDED.includes(p.health)).length;
          return (
            <li key={q.id} className="squad-item">
              <button className={`squad tone-${st.tone}${selectedId === q.id ? ' selected' : ''}`} data-testid={`squad-${q.id}`} onClick={() => onSelect(q.id)} aria-pressed={selectedId === q.id}>
              <span className={`monogram banner-${q.id}`} aria-hidden="true">{members[0] ? initials(members[0].name) : '—'}</span>
              <span className="squad-text">
                <b>«{q.name}»</b>
                <small className="squad-meta">
                  <span className="cnt">{members.length}/{SLOTS} · </span><span className="status">{st.label}</span>
                  {wounded > 0 && <span className="sq-wounded"> · ранен{wounded > 1 ? 'о' : ''}: {wounded}</span>}
                </small>
                <span className="visually-hidden">. Состав: {members.length ? members.map(memberSummary).join('; ') : 'нет бойцов'}.</span>
              </span>
              <span className="squad-members" data-testid={`squad-members-${q.id}`}>
                {members.map((p) => <SquadMember key={p.id} p={p} />)}
              </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
