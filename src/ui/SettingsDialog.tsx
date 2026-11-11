import { useEffect, useRef, useState } from 'react';
import { createInitialState } from '../core/state';
import { createSandboxState } from '../core/sandbox';
import { parseSave } from '../persistence/saveFormat';
import { autoSlotFor, exportJson, listSlots, loadFromSlot, saveToSlot, slotsForMode, type SaveMode, type SlotId } from '../persistence/saveStore';
import { getGame, notify, replaceGame } from '../store';
import { Modal } from './Modal';
import { MusicSettings } from './audio/MusicSettings';
import { loadEffectsLevel, saveEffectsLevel, type EffectsLevel } from './map/cityLife';

const EFFECTS: { id: EffectsLevel; label: string }[] = [
  { id: 'full', label: 'Полные' },
  { id: 'lite', label: 'Упрощённые' },
  { id: 'off', label: 'Выключены' },
];

type SlotInfo = Awaited<ReturnType<typeof listSlots>>;

interface SavesProps {
  /** Вызывается после успешной загрузки или импорта */
  onLoaded: () => void;
  /** Можно ли сохранять текущую игру (в главном меню без начатой кампании — нельзя) */
  canSave?: boolean;
  /** Показывать кнопку «Новая игра» (в главном меню для этого есть отдельный пункт) */
  showNewGame?: boolean;
  onNewGame?: () => void;
}

/** Слоты, экспорт и импорт. Общий для игрового окна «Сохранения» и вкладки настроек главного меню. */
export function SavesPanel({ onLoaded, canSave = true, showNewGame = false, onNewGame }: SavesProps) {
  const [slots, setSlots] = useState<SlotInfo | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
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
    if (r.ok) { replaceGame(r.state); notify('good', 'Сохранение загружено.'); onLoaded(); }
    else notify('bad', r.reason);
  };
  const doExport = () => {
    const blob = new Blob([exportJson(getGame())], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = getGame().mode === 'sandbox' ? `gamemr-sandbox-${getGame().minute}.json` : `gamemr-smena-${getGame().shift}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const doImport = async (file: File) => {
    const r = parseSave(await file.text());
    if (r.ok) { replaceGame(r.state); notify('good', 'Сохранение импортировано.'); onLoaded(); }
    else notify('bad', r.reason);
  };

  const currentMode: SaveMode = getGame().mode === 'sandbox' ? 'sandbox' : 'campaign';
  const groups: { mode: SaveMode; title: string }[] = [{ mode: 'campaign', title: 'Кампания' }, { mode: 'sandbox', title: 'Песочница' }];
  return (
    <>
      {groups.map((group) => (
        <section key={group.mode} className="save-mode-group" data-testid={`saves-${group.mode}`}>
          <h3 className="section-title">{group.title}</h3>
          <ul className="slot-list">
            {slotsForMode(group.mode).map((s) => {
              const info = slots?.[s.id];
              const compatible = !!info && info.mode === group.mode;
              const isAuto = s.id === 'auto' || s.id === 'sandbox-auto';
              return (
                <li key={s.id} data-testid={`slot-${s.id}`}>
                  <span>
                    <b>{s.label}</b>
                    <small>{info ? `${group.mode === 'sandbox' ? `Минута ${info.minute}` : `Смена ${info.shift}`} · ${new Date(info.savedAt).toLocaleString('ru-RU')}` : 'пусто'}</small>
                  </span>
                  {!isAuto && canSave && currentMode === group.mode && <button className="btn" onClick={() => save(s.id)}>Сохранить</button>}
                  <button className="btn" disabled={!compatible} onClick={() => load(s.id)}>Загрузить</button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <div className="modal-actions wrap">
        {canSave && <button className="btn" onClick={doExport}>Экспорт в файл</button>}
        <button className="btn" onClick={() => fileRef.current?.click()}>Импорт из файла</button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && doImport(e.target.files[0])} />
        {showNewGame && (
          <>
            <button className="btn danger" onClick={() => { if (confirm('Начать новую кампанию? Несохранённый прогресс будет потерян.')) { replaceGame(createInitialState()); onNewGame?.(); } }}>
              Новая кампания
            </button>
            <button className="btn danger" onClick={() => { if (confirm('Начать новую песочницу? Текущий незавершённый сценарий будет заменён.')) { const fresh = createSandboxState(); replaceGame(fresh); saveToSlot(autoSlotFor(fresh), fresh).catch((e: Error) => notify('bad', `Автосохранение не удалось: ${e.message}`)); onNewGame?.(); } }} data-testid="new-sandbox">
              Новая песочница
            </button>
          </>
        )}
      </div>
    </>
  );
}

export function SettingsDialog({ onClose, onMainMenu }: { onClose: () => void; onMainMenu?: () => void }) {
  const [effects, setEffects] = useState<EffectsLevel>(loadEffectsLevel);
  return (
    <Modal title="Сохранения" onClose={onClose} testId="settings">
      <SavesPanel onLoaded={onClose} showNewGame onNewGame={onClose} />
      <MusicSettings />
      <h3 className="section-title">Эффекты карты</h3>
      <p className="muted">Машины, погода, дым и огонь на карте. На слабом телефоне выберите «Упрощённые».</p>
      <div className="modal-actions wrap" role="group" aria-label="Эффекты карты">
        {EFFECTS.map((e) => (
          <button key={e.id} className="btn" aria-pressed={effects === e.id} data-testid={`effects-${e.id}`} onClick={() => { setEffects(e.id); saveEffectsLevel(e.id); }}>
            {e.label}
          </button>
        ))}
      </div>
      {onMainMenu && (
        <div className="modal-actions">
          <button className="btn" onClick={onMainMenu} data-testid="to-main-menu">Главное меню</button>
        </div>
      )}
    </Modal>
  );
}
