import { useEffect, useRef, useState } from 'react';
import { createInitialState } from '../core/state';
import { parseSave } from '../persistence/saveFormat';
import { SLOTS, exportJson, listSlots, loadFromSlot, saveToSlot, type SlotId } from '../persistence/saveStore';
import { getGame, notify, replaceGame } from '../store';
import { Modal } from './Modal';
import { loadEffectsLevel, saveEffectsLevel, type EffectsLevel } from './map/cityLife';

const EFFECTS: { id: EffectsLevel; label: string }[] = [
  { id: 'full', label: 'Полные' },
  { id: 'lite', label: 'Упрощённые' },
  { id: 'off', label: 'Выключены' },
];

type SlotInfo = Awaited<ReturnType<typeof listSlots>>;

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const [slots, setSlots] = useState<SlotInfo | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [effects, setEffects] = useState<EffectsLevel>(loadEffectsLevel);
  const refresh = () => listSlots().then(setSlots);
  useEffect(() => { refresh(); }, []);

  const save = async (id: SlotId) => {
    try {
      await saveToSlot(id, getGame());
      notify('good', 'Игра сохранена.');
      refresh();
    } catch (e) {
      notify('bad', `Не удалось сохранить: ${(e as Error).message}`);
    }
  };
  const load = async (id: SlotId) => {
    const r = await loadFromSlot(id);
    if (r.ok) { replaceGame(r.state); notify('good', 'Сохранение загружено.'); onClose(); }
    else notify('bad', r.reason);
  };
  const doExport = () => {
    const blob = new Blob([exportJson(getGame())], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `gamemr-smena-${getGame().shift}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const doImport = async (file: File) => {
    const r = parseSave(await file.text());
    if (r.ok) { replaceGame(r.state); notify('good', 'Сохранение импортировано.'); onClose(); }
    else notify('bad', r.reason);
  };

  return (
    <Modal title="Сохранения" onClose={onClose} testId="settings">
      <ul className="slot-list">
        {SLOTS.map((s) => {
          const info = slots?.[s.id];
          return (
            <li key={s.id} data-testid={`slot-${s.id}`}>
              <span>
                <b>{s.label}</b>
                <small>{info ? `Смена ${info.shift} · ${new Date(info.savedAt).toLocaleString('ru-RU')}` : 'пусто'}</small>
              </span>
              {s.id !== 'auto' && <button className="btn" onClick={() => save(s.id)}>Сохранить</button>}
              <button className="btn" disabled={!info} onClick={() => load(s.id)}>Загрузить</button>
            </li>
          );
        })}
      </ul>
      <h3 className="section-title">Эффекты карты</h3>
      <p className="muted">Машины, погода, дым и огонь на карте. На слабом телефоне выберите «Упрощённые».</p>
      <div className="modal-actions wrap" role="group" aria-label="Эффекты карты">
        {EFFECTS.map((e) => (
          <button key={e.id} className="btn" aria-pressed={effects === e.id} data-testid={`effects-${e.id}`} onClick={() => { setEffects(e.id); saveEffectsLevel(e.id); }}>
            {e.label}
          </button>
        ))}
      </div>
      <div className="modal-actions wrap">
        <button className="btn" onClick={doExport}>Экспорт в файл</button>
        <button className="btn" onClick={() => fileRef.current?.click()}>Импорт из файла</button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && doImport(e.target.files[0])} />
        <button className="btn danger" onClick={() => { if (confirm('Начать новую игру? Несохранённый прогресс будет потерян.')) { replaceGame(createInitialState()); onClose(); } }}>
          Новая игра
        </button>
      </div>
    </Modal>
  );
}
