import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createInitialState } from '../../src/core/state';
import { SquadCard } from '../../src/ui/shell/SquadCard';
import { ok } from './helpers';

describe('Карточка «Отряд»: лечение прямо из состава', () => {
  it('у раненого есть «Лечить» с планами и прогнозом; у здорового кнопки нет', () => {
    const s = ok(createInitialState(), { type: 'START_SHIFT' });
    s.staff.find((p) => p.id === 'p2')!.health = 'serious_injury';
    render(<SquadCard game={s} id="axon" onSelect={() => {}} />);
    expect(screen.queryByTestId('sq-treat-p1')).toBeNull();
    fireEvent.click(screen.getByTestId('sq-treat-p2'));
    expect(screen.getByTestId('sq-plans-p2').textContent).toMatch(/Стандартное · 2 РЕ/);
    expect(screen.getByTestId('squad-warnings').textContent).toMatch(/лечении: 1/);
    expect(screen.getByTestId('squad-fit').textContent).toBe('1/2');
  });
});
