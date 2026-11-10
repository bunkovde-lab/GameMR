import { RANK_NAMES } from '../core/career';
import { HEALTH_LOG } from '../core/healthText';
import type { Staff } from '../core/types';
import { Portrait } from './Portrait';
import { fatigueTone, healthTone } from './shell/SquadStrip';

/**
 * Портрет сотрудника со статусами прямо на изображении: ранг (угол слева сверху),
 * значок ранения (справа сверху) и полоса усталости по нижнему краю — как в карточках отрядов.
 * Текст статуса дублируется для чтения с экрана и во всплывающей подсказке.
 */
export function StatusFace({ p, size = 'sm' }: { p: Staff; size?: 'sm' | 'lg' }) {
  const tone = healthTone(p.health);
  const f = Math.max(0, Math.min(100, p.fatigue));
  const rank = RANK_NAMES[p.rank - 1];
  const text = `${HEALTH_LOG[p.health]}, усталость ${f}%, ранг ${rank}`;
  return (
    <span className={`status-face ${size} hp-${tone}`} title={`${p.name}: ${text}`} data-testid={`face-${p.id}`}>
      <Portrait id={p.id} name={p.name} health={p.health} size={size} />
      <span className="sf-rank" aria-hidden="true">{rank}</span>
      {tone !== 'ok' && <span className="sq-badge sf-hp" aria-hidden="true">{tone === 'lost' ? '✕' : '✚'}</span>}
      {tone !== 'lost' && <span className={`sq-fatigue sf-fatigue tone-${fatigueTone(f)}`} aria-hidden="true"><i style={{ width: `${f}%` }} /></span>}
      <span className="sr-only">{text}</span>
    </span>
  );
}
