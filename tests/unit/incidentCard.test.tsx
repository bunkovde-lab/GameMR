import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { createInitialState } from '../../src/core/state';
import type { Incident } from '../../src/core/types';
import { artUrl } from '../../src/ui/art';
import { ContextPanel } from '../../src/ui/shell/ContextPanel';
import { incidentArtKeys } from '../../src/ui/shell/IncidentArt';

afterEach(cleanup);

const noop = () => {};
function renderCard(patch: Partial<Incident> & { id: string }) {
  const game = createInitialState();
  const base = game.incidents.find((i) => i.id === patch.id) ?? { ...game.incidents[0]!, templateId: patch.id };
  game.incidents = [{ ...base, ...patch }, ...game.incidents.filter((i) => i.id !== patch.id)];
  render(<ContextPanel game={game} selection={{ kind: 'incident', id: patch.id }} onClose={noop} onSelect={noop} onPreview={noop} onOpenDispatch={noop} />);
}

describe('ART-023: карточка происшествия', () => {
  it('порядок поиска иллюстрации: свой арт → сцена ART-015 → тип угрозы', () => {
    expect(incidentArtKeys('bioleak')).toEqual(['inc_bioleak', 'scene_sci_breakin', 'inc_type_bio']);
    expect(incidentArtKeys('foreign_memory')).toEqual(['inc_foreign_memory', 'inc_type_illegal_mod']);
    expect(incidentArtKeys('strike')).toEqual(['inc_strike', 'inc_type_riot']);
  });

  it('все 22 события части Б получают собственный подключённый арт', () => {
    const ids = [
      'cold_seal', 'triage', 'graft', 'stairs_blood', 'spectrometer', 'courier_box',
      'incubator', 'foreign_memory', 'missing', 'court_seal', 'two_protocols',
      'foreign_badge', 'floor_hum', 'strike', 'collector', 'garden_turn', 'spores',
      'green_water', 'false_call', 'illegal', 'empty_flat', 'no_guardian',
    ];
    for (const id of ids) {
      const key = `inc_${id}`;
      expect(incidentArtKeys(id)[0]).toBe(key);
      expect(artUrl(key), key).toBeTruthy();
    }
  });

  it('вызов со сценой показывает готовый арт, без сцены — собственную иллюстрацию', () => {
    renderCard({ id: 'bioleak' });
    expect(screen.getByTestId('inc-hero').getAttribute('data-art')).toBe('scene_sci_breakin');
    expect(screen.getByTestId('inc-hero').className).toContain('has-art');
    cleanup();
    renderCard({ id: 'missing' });
    expect(screen.getByTestId('inc-hero').getAttribute('data-art')).toBe('inc_missing');
    expect(screen.getByTestId('inc-hero').className).toContain('has-art');
  });

  it('штамп только у итоговых состояний', () => {
    renderCard({ id: 'missing', state: 'new' });
    expect(screen.queryByTestId('inc-stamp')).toBeNull();
    cleanup();
    renderCard({ id: 'missing', state: 'resolved_success' });
    expect(screen.getByTestId('inc-stamp').getAttribute('data-stamp')).toBe('closed');
    // Штамп ART-023 (часть Г) — маска-картинка с подписью для читателя экрана.
    expect(screen.getByTestId('inc-stamp').className).toContain('has-art');
    expect(screen.getByTestId('inc-stamp').getAttribute('aria-label')).toBe('Штамп: Закрыт');
    cleanup();
    renderCard({ id: 'missing', state: 'failed' });
    expect(screen.getByTestId('inc-stamp').getAttribute('data-stamp')).toBe('failed');
  });

  it('строки «что на кону» получают значок категории', () => {
    renderCard({ id: 'foreign_memory', title: 'Свидетель с чужой памятью', state: 'resolved_success' });
    const cats = [...screen.getByTestId('aftermath-list').querySelectorAll('li')].map((li) => li.getAttribute('data-cat'));
    expect(cats).toEqual(['people', 'law', 'science']);
    // Значки ART-023 (часть В) — маска из SVG, а не временная иконка.
    expect(screen.getByTestId('aftermath-list').querySelectorAll('.aft-ico.mk-icon')).toHaveLength(3);
  });
});
