import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createInitialState } from '../../core/state';
import { saveToSlot } from '../../persistence/saveStore';
import { bootResult, getGame, notify, replaceGame } from '../../store';
import { Modal } from '../Modal';
import { SavesPanel } from '../SettingsDialog';
import { MusicSettings } from '../audio/MusicSettings';
import { MenuAtmosphere } from './atmosphere';
import { MENU_ASSETS, missingMenuArt } from './menuAssets';
import { SCENE, SCENE_H, SCENE_W, loadFxPrefs, saveFxPrefs, type FxPrefs } from './menuScene';
import './MainMenu.css';

export type MenuItemId = 'continue' | 'new' | 'settings' | 'credits' | 'exit';

interface Props {
  /** Кампания уже идёт в этой вкладке (вернулись из игры, загрузили слот, восстановили автосохранение) */
  sessionLive: boolean;
  /** Перейти в игру с текущим состоянием */
  onEnterGame: () => void;
}

type Dialog = null | 'settings' | 'credits' | 'confirm-new' | 'exit';

/** Пункт «Продолжить»: активен только при восстановленной кампании, иначе — понятная причина. */
export function continueState(sessionLive: boolean, boot = bootResult()): { enabled: boolean; note: string } {
  if (sessionLive || boot.restored) return { enabled: true, note: `Смена ${getGame().shift}` };
  if (boot.empty) return { enabled: false, note: 'Сохранённой игры нет' };
  if (/недоступно/.test(boot.reason)) return { enabled: false, note: 'Хранилище браузера недоступно' };
  return { enabled: false, note: 'Автосохранение повреждено' };
}

export function MainMenu({ sessionLive, onEnterGame }: Props) {
  const box = useCoverBox();
  const L = menuLayout(box);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [prefs, setPrefs] = useState<FxPrefs>(() => loadFxPrefs());
  const [busy, setBusy] = useState(false);
  const cont = continueState(sessionLive);
  const missing = missingMenuArt();

  const startNew = async () => {
    setBusy(true);
    const fresh = createInitialState();
    replaceGame(fresh);
    // Перезаписываем автосохранение сразу: перезагрузка страницы не должна вернуть прежнюю кампанию.
    // Ручные слоты 1–3 не трогаем.
    try { await saveToSlot('auto', fresh); } catch (e) { notify('bad', `Автосохранение не удалось: ${(e as Error).message}`); }
    setBusy(false);
    setDialog(null);
    onEnterGame();
  };

  const exit = async () => {
    // Прогресс текущей смены (время, которое не вызывало автосохранение) сохраняем перед прощанием.
    if (sessionLive) {
      try { await saveToSlot('auto', getGame()); } catch { /* сообщим ниже, что сохранить не вышло */ }
    }
    setDialog('exit');
  };

  const items: { id: MenuItemId; label: string; disabled?: boolean; note?: string; run: () => void }[] = [
    { id: 'continue', label: 'Продолжить', disabled: !cont.enabled, note: cont.note, run: onEnterGame },
    { id: 'new', label: 'Новая игра', run: () => (cont.enabled ? setDialog('confirm-new') : void startNew()) },
    { id: 'settings', label: 'Настройки', run: () => setDialog('settings') },
    { id: 'credits', label: 'Авторы', run: () => setDialog('credits') },
    { id: 'exit', label: 'Выход', run: () => void exit() },
  ];

  const updatePrefs = (p: FxPrefs) => { setPrefs(p); saveFxPrefs(p); };

  return (
    <div className={`m00b${prefs.reduceMotion ? ' reduce-motion' : ''}`} data-testid="main-menu">
      <MenuScene prefs={prefs} box={box} />
      <div
        className="m00b-ui"
        style={{
          '--logo-x': `${L.logoX}px`, '--logo-y': `${L.logoY}px`, '--logo-w': `${L.logoW}px`,
          '--menu-y': `${L.menuY}px`, '--plate-x': `${L.plateX}px`, '--plate-w': `${L.plateW}px`,
          '--row': `${L.row}px`, '--menu-font': `${L.font}px`,
        } as CSSProperties}
      >
        <h1 className="m00b-logo" data-testid="menu-logo">
          {MENU_ASSETS.logo ? (
            <img src={MENU_ASSETS.logo} alt="Мир Раскола — Право на порядок" draggable={false} />
          ) : (
            <span className="m00b-logo-text" aria-label="Мир Раскола — Право на порядок">
              <b>МИР РАСКОЛА</b>
              <i aria-hidden="true" />
              <small>ПРАВО НА ПОРЯДОК</small>
            </span>
          )}
        </h1>
        <MenuButtons items={items} disabled={busy} />
      </div>
      {missing.length > 0 && (
        <p className="m00b-missing" data-testid="menu-art-missing" role="note">
          Художественный пакет M00-B ещё не импортирован (не хватает: {missing.join(', ')}). Показана временная схема сцены.
        </p>
      )}

      {dialog === 'settings' && (
        <MenuSettings prefs={prefs} onPrefs={updatePrefs} sessionLive={sessionLive} onClose={() => setDialog(null)} onLoaded={onEnterGame} />
      )}
      {dialog === 'credits' && <Credits onClose={() => setDialog(null)} />}
      {dialog === 'confirm-new' && (
        <Modal title="Новая игра" onClose={() => setDialog(null)} testId="menu-confirm-new" className="m00b-modal">
          <p>
            Начнётся новая кампания с первой смены. <b>Автосохранение будет перезаписано</b> — текущая кампания
            (смена {getGame().shift}) не вернётся после перезагрузки страницы.
          </p>
          <p className="m00b-muted">Ручные слоты 1–3 останутся без изменений: их можно загрузить в «Настройках».</p>
          <div className="modal-actions">
            <button className="btn" onClick={() => setDialog(null)}>Отмена</button>
            <button className="btn danger" onClick={() => void startNew()} disabled={busy} data-testid="confirm-new-game">Начать заново</button>
          </div>
        </Modal>
      )}
      {dialog === 'exit' && (
        <div className="m00b-farewell" role="dialog" aria-modal="true" aria-labelledby="farewell-title" data-testid="menu-farewell">
          <div>
            <h2 id="farewell-title">Сеанс завершён</h2>
            <p>{sessionLive ? 'Прогресс сохранён в автосохранении.' : 'Кампания не начата — сохранять нечего.'} Можете закрыть вкладку браузера.</p>
            <button className="btn" autoFocus onClick={() => setDialog(null)} data-testid="farewell-back">Вернуться в меню</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ——— раскладка по кадру ———

export interface CoverBox { w: number; h: number; x: number; y: number; vw: number; vh: number }

/** Фон кадрируется как cover по кадру 1672×941: эффекты и интерфейс считаются в тех же координатах, что и картинка. */
function useCoverBox(): CoverBox {
  const measure = (): CoverBox => {
    const vw = window.innerWidth, vh = window.innerHeight;
    const k = Math.max(vw / SCENE_W, vh / SCENE_H) * 1.012; // запас под параллакс
    const w = SCENE_W * k, h = SCENE_H * k;
    return { w, h, x: (vw - w) / 2, y: (vh - h) / 2, vw, vh };
  };
  const [box, setBox] = useState(measure);
  useLayoutEffect(() => {
    const fit = () => setBox(measure());
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  return box;
}

/**
 * Логотип и меню стоят там же, где в утверждённом референсе (доли кадра), но не уходят за край экрана
 * и не становятся мельче читаемого: строка меню не ниже 44 px (зона касания), логотип не уже 220 px.
 */
export function menuLayout(b: CoverBox) {
  const u = SCENE.ui;
  const logoW = Math.min(Math.max(220, u.logoW * b.w), b.vw * 0.6);
  const logoX = Math.max(16, b.x + u.logoX * b.w);
  const logoY = Math.max(12, b.y + u.logoY * b.h);
  const row = Math.max(44, u.rowH * b.h);
  const menuRef = b.y + u.menuY * b.h;
  const menuY = Math.max(12, Math.min(Math.max(logoY + logoW / 3 + 8, menuRef), b.vh - row * 5 - 12));
  const plateW = Math.min(Math.max(250, u.plateW * b.w), b.vw - logoX - 16);
  return { logoW, logoX, logoY, row, menuY, plateX: logoX - 5 * (b.w / SCENE_W), plateW, font: Math.max(15, row * 0.35) };
}

// ——— пять кнопок ———

function MenuButtons({ items, disabled }: { items: { id: MenuItemId; label: string; disabled?: boolean; note?: string; run: () => void }[]; disabled: boolean }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const first = Math.max(0, items.findIndex((i) => !i.disabled));
  const [current, setCurrent] = useState(first);

  // Фокус на первом доступном пункте: Enter сразу работает, стрелки двигают выбор.
  useEffect(() => { refs.current[first]?.focus({ preventScroll: true }); }, [first]);

  const move = (e: ReactKeyboardEvent, from: number) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const enabled = items.map((it, i) => (it.disabled ? -1 : i)).filter((i) => i >= 0);
    let to: number;
    if (e.key === 'Home') to = enabled[0]!;
    else if (e.key === 'End') to = enabled[enabled.length - 1]!;
    else {
      const k = enabled.indexOf(from);
      const step = e.key === 'ArrowDown' ? 1 : -1;
      to = enabled[(k + step + enabled.length) % enabled.length]!;
    }
    refs.current[to]?.focus();
  };

  const skin = (k: keyof typeof MENU_ASSETS.button) => (MENU_ASSETS.button[k] ? `url("${MENU_ASSETS.button[k]}")` : 'none');
  const style = {
    '--skin-normal': skin('normal'),
    '--skin-hover': skin('hover'),
    '--skin-selected': skin('selected'),
    '--skin-disabled': skin('disabled'),
  } as CSSProperties;

  return (
    <nav className={`m00b-menu${MENU_ASSETS.rasterButtons ? ' raster' : ''}`} aria-label="Главное меню" style={style}>
      <ul>
        {items.map((it, i) => (
          <li key={it.id}>
            <button
              ref={(el) => { refs.current[i] = el; }}
              type="button"
              className={`m00b-btn${i === current ? ' is-current' : ''}`}
              disabled={it.disabled || disabled}
              aria-describedby={it.note ? `menu-note-${it.id}` : undefined}
              onFocus={() => setCurrent(i)}
              onPointerEnter={(e) => { if (!it.disabled && e.pointerType === 'mouse') refs.current[i]?.focus({ preventScroll: true }); }}
              onKeyDown={(e) => move(e, i)}
              onClick={it.run}
              data-testid={`menu-${it.id}`}
            >
              <span className="m00b-diamond" aria-hidden="true" />
              <span className="m00b-label">{it.label}</span>
              {it.note && <small id={`menu-note-${it.id}`} className="m00b-note">{it.note}</small>}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

// ——— сцена: фон (cover) + слои художника + холст эффектов ———

const pct = (pts: readonly (readonly [number, number])[]) => pts.map(([x, y]) => `${(x * 100).toFixed(2)}% ${(y * 100).toFixed(2)}%`);
/** Маска стекла для CSS: контур окна минус импост (правило evenodd, импост — «дырка»). */
const GLASS_CLIP = (() => {
  const outer = pct(SCENE.window);
  const holes = SCENE.mullions.map((m) => [...pct(m), pct(m)[0]!, outer[0]!]);
  return `polygon(evenodd, ${[...outer, outer[0]!, ...holes.flat()].join(', ')})`;
})();

function MenuScene({ prefs, box }: { prefs: FxPrefs; box: CoverBox }) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boltRef = useRef<HTMLImageElement>(null);
  const fxRef = useRef<MenuAtmosphere | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const fx = new MenuAtmosphere(canvas, prefs, { lightning: boltRef.current, root: canvas.closest<HTMLElement>('.m00b') });
    fxRef.current = fx;
    (window as unknown as { __gamemrMenuFx?: MenuAtmosphere }).__gamemrMenuFx = fx;
    fx.start();
    return () => {
      fx.stop();
      fxRef.current = null;
      const w = window as unknown as { __gamemrMenuFx?: MenuAtmosphere };
      if (w.__gamemrMenuFx === fx) delete w.__gamemrMenuFx;
    };
    // Эффекты создаются один раз; настройки передаются ниже без пересоздания.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { fxRef.current?.setPrefs(prefs); }, [prefs]);
  useEffect(() => { fxRef.current?.resize(box.w, box.h); }, [box.w, box.h]);

  // Лёгкий параллакс (несколько пикселей) от мыши; на сенсорных экранах и при «Снизить движение» — нет.
  useEffect(() => {
    const el = sceneRef.current;
    if (!el || prefs.reduceMotion || !window.matchMedia?.('(pointer: fine)').matches) {
      if (el) el.style.transform = '';
      return;
    }
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const dx = (e.clientX / window.innerWidth - 0.5) * -6;
        const dy = (e.clientY / window.innerHeight - 0.5) * -4;
        el.style.transform = `translate3d(${dx.toFixed(1)}px, ${dy.toFixed(1)}px, 0)`;
      });
    };
    window.addEventListener('pointermove', onMove);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('pointermove', onMove); };
  }, [prefs.reduceMotion]);

  return (
    <div className="m00b-stage" aria-hidden="true">
      <div className="m00b-scene" ref={sceneRef} style={{ width: box.w, height: box.h, left: box.x, top: box.y }} data-testid="menu-scene">
        {MENU_ASSETS.background ? (
          <img className="m00b-bg" src={MENU_ASSETS.background} alt="" draggable={false} />
        ) : (
          <div className="m00b-bg m00b-bg-schematic" />
        )}
        {/* Слои художника за стеклом: два прохода дождевого стекла и разряд молнии (виден только во вспышке) */}
        <div className="m00b-glass" style={{ clipPath: GLASS_CLIP }}>
          {MENU_ASSETS.fx.rain && (
            <>
              <div className="m00b-rain-tex slow"><img src={MENU_ASSETS.fx.rain} alt="" /><img src={MENU_ASSETS.fx.rain} alt="" /></div>
              <div className="m00b-rain-tex fast"><img src={MENU_ASSETS.fx.rain} alt="" /><img src={MENU_ASSETS.fx.rain} alt="" /></div>
            </>
          )}
          {MENU_ASSETS.fx.lightning && <img className="m00b-bolt" ref={boltRef} src={MENU_ASSETS.fx.lightning} alt="" style={{ opacity: 0 }} />}
        </div>
        {MENU_ASSETS.fx.dust && <img className="m00b-dust-tex" src={MENU_ASSETS.fx.dust} alt="" />}
        <canvas className="m00b-fx" ref={canvasRef} data-testid="menu-fx" />
      </div>
      <div className="m00b-vignette" />
    </div>
  );
}

// ——— окна ———

type SettingsTab = 'sound' | 'video' | 'saves';

function MenuSettings({ prefs, onPrefs, sessionLive, onClose, onLoaded }: {
  prefs: FxPrefs;
  onPrefs: (p: FxPrefs) => void;
  sessionLive: boolean;
  onClose: () => void;
  onLoaded: () => void;
}) {
  const [tab, setTab] = useState<SettingsTab>('sound');
  const tabs: { id: SettingsTab; label: string }[] = [
    { id: 'sound', label: 'Звук' },
    { id: 'video', label: 'Изображение' },
    { id: 'saves', label: 'Сохранения' },
  ];
  return (
    <Modal title="Настройки" onClose={onClose} testId="menu-settings-dialog" className="m00b-modal">
      <div className="m00b-tabs" role="tablist" aria-label="Разделы настроек">
        {tabs.map((t) => (
          <button key={t.id} role="tab" className="btn" aria-selected={tab === t.id} onClick={() => setTab(t.id)} data-testid={`menu-tab-${t.id}`}>
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="m00b-tabpanel">
        {tab === 'sound' && (
          <>
            <MusicSettings />
            <p className="m00b-muted">
              Звуки дождя, грома и помещения ещё не поставлены художником — когда файлы появятся, их громкость будет настраиваться здесь же.
            </p>
          </>
        )}
        {tab === 'video' && (
          <div className="m00b-checks">
            <label>
              <input type="checkbox" checked={prefs.noFlashes} onChange={(e) => onPrefs({ ...prefs, noFlashes: e.target.checked })} data-testid="fx-no-flashes" />
              <span><b>Отключить вспышки</b><small>Молнии за окном не вспыхивают (для светочувствительных игроков).</small></span>
            </label>
            <label>
              <input type="checkbox" checked={prefs.reduceMotion} onChange={(e) => onPrefs({ ...prefs, reduceMotion: e.target.checked })} data-testid="fx-reduce-motion" />
              <span><b>Снизить движение</b><small>Меньше дождя, без пыли, мерцания лампы и сдвига картинки.</small></span>
            </label>
          </div>
        )}
        {tab === 'saves' && <SavesPanel onLoaded={onLoaded} canSave={sessionLive} />}
      </div>
    </Modal>
  );
}

function Credits({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Авторы" subtitle="GameMR" onClose={onClose} testId="menu-credits-dialog" className="m00b-modal">
      <div className="m00b-credits">
        <p><b>Мир Раскола: Право на порядок</b> — одиночная браузерная стратегия о руководителе городской безопасности Багряных домов.</p>
        <dl>
          <dt>Руководитель проекта</dt><dd>владелец репозитория bunkovde-lab — замысел, приёмка арта и этапов</dd>
          <dt>Художественная концепция, арт, механики</dt><dd>ChatGPT по заданию руководителя проекта</dd>
          <dt>Программирование, тесты, сборки</dt><dd>Claude Code</dd>
          <dt>Музыка</dt><dd>треки руководителя проекта «Меню» и «Фон к игре» (веб-копии)</dd>
          <dt>Шрифты</dt><dd>Golos Text и Old Standard TT — SIL Open Font License</dd>
        </dl>
        <p className="m00b-muted">
          Исходный код и документация: <a href="https://github.com/bunkovde-lab/GameMR" target="_blank" rel="noreferrer">github.com/bunkovde-lab/GameMR</a>.
          Лицензия проекта пока не указана.
        </p>
      </div>
    </Modal>
  );
}
