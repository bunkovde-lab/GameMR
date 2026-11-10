import type { FocusEventHandler, PointerEventHandler } from 'react';
import type { GameState, Squad } from '../../core/types';
import { SquadSummary } from './SquadCard';
import { SquadMember, memberSummary } from './SquadStrip';

/**
 * Строка готового отряда (карточка происшествия, окно отправки): вымпел, название, подпись и лица бойцов —
 * как на главном экране, плюс кнопка «▾», раскрывающая сводку отряда (годны к выезду, усталость, характеристики…).
 * Две отдельные кнопки, а не вложенные: выбор отряда и раскрытие статуса работают и касанием.
 */
export function ReadySquad({
  game, squad, subtitle, testId, disabled, pressed, expanded, onPick, onToggle, onPointerEnter, onFocus,
}: {
  game: GameState; squad: Squad; subtitle: string; testId: string; disabled?: boolean; pressed?: boolean; expanded: boolean;
  onPick: () => void; onToggle: () => void; onPointerEnter?: PointerEventHandler; onFocus?: FocusEventHandler;
}) {
  const members = squad.memberIds.map((id) => game.staff.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => !!p);
  return (
    <>
      <div className="rs-row">
        <button
          className="btn pick squad-pick" aria-pressed={pressed} disabled={disabled} onClick={onPick}
          onPointerEnter={onPointerEnter} onFocus={onFocus} data-testid={testId}
        >
          <span className={`monogram banner-${squad.id}`} aria-hidden="true" />
          <span className="squad-pick-text">
            <b>«{squad.name}»</b>
            <small>{subtitle}</small>
          </span>
          <span className="squad-members" data-testid={`${testId}-members`}>
            {members.map((p) => <SquadMember key={p.id} p={p} testPrefix={`${testId}-member`} />)}
          </span>
          <span className="visually-hidden">. Состав: {members.length ? members.map(memberSummary).join('; ') : 'нет бойцов'}.</span>
        </button>
        <button
          className="btn rs-toggle" aria-expanded={expanded} onClick={onToggle} data-testid={`${testId}-status`}
          aria-label={`${expanded ? 'Скрыть' : 'Показать'} статус отряда «${squad.name}»`} title="Статус отряда"
        >
          <span aria-hidden="true">{expanded ? '▴' : '▾'}</span>
        </button>
      </div>
      {expanded && <SquadSummary game={game} squad={squad} testId={`${testId}-summary`} />}
    </>
  );
}
