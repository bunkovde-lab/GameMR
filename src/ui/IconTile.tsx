import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';

/**
 * Значок-плитка навыка или органа: действие — нажатием на сам значок, описание и цена — во всплывающей подсказке.
 * Мышь и клавиатура: подсказка при наведении/фокусе, нажатие сразу выполняет действие.
 * Сенсорный экран: первое касание показывает подсказку, второе — выполняет.
 * Опасное действие (например, извлечь орган) всегда требует второго нажатия.
 */
export type TileState = 'learned' | 'studying' | 'open' | 'locked' | 'innate';
export interface TipLine { text: string; tone?: 'ok' | 'no' | 'cost' | 'hint' }
export interface TileProps {
  id: string; state: TileState; label: string; desc: string; lines: TipLine[];
  art: ReactNode; tier?: string; caption?: boolean;
  /** Что сделать по нажатию; null — нажатие ничего не делает (только подсказка). */
  action: null | { run: () => void; hint: string; confirm?: boolean };
  testId: string;
}

let armedGlobal: ((id: string | null) => void)[] = [];

export function IconTile(t: TileProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const pointer = useRef('');
  const [hover, setHover] = useState(false);
  const [armed, setArmed] = useState(false);
  // Одновременно «взведён» только один значок на экране.
  useLayoutEffect(() => {
    const fn = (id: string | null) => { if (id !== t.id) setArmed(false); };
    armedGlobal.push(fn);
    return () => { armedGlobal = armedGlobal.filter((f) => f !== fn); };
  }, [t.id]);
  const arm = () => { armedGlobal.forEach((f) => f(t.id)); setArmed(true); };
  const onClick = () => {
    const touch = pointer.current === 'touch' || pointer.current === 'pen';
    pointer.current = '';
    if (!t.action) { if (touch) arm(); return; }
    if ((touch || t.action.confirm) && !armed) { arm(); return; }
    setArmed(false);
    t.action.run();
  };
  const show = hover || armed;
  const hint = !t.action ? null
    : armed ? `Нажмите ещё раз: ${t.action.hint.toLowerCase()}`
      : t.action.confirm ? `Нажмите дважды: ${t.action.hint.toLowerCase()}`
        : `Нажмите на значок: ${t.action.hint.toLowerCase()}`;
  return (
    <li className={`tile-step st-${t.state}`}>
      <button
        ref={ref}
        className={`skill-node st-${t.state}${armed ? ' armed' : ''}`}
        aria-disabled={!t.action || undefined}
        aria-label={`${t.label}. ${t.desc} ${t.lines.map((l) => l.text).join('. ')}`}
        onPointerDown={(e) => { pointer.current = e.pointerType; }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onFocus={() => setHover(true)}
        onBlur={() => { setHover(false); setArmed(false); }}
        onClick={onClick}
        data-testid={t.testId}
      >
        {t.art}
        {t.tier && <span className="skill-tier">{t.tier}</span>}
        {t.state === 'learned' && <span className="skill-badge good" aria-hidden="true">✓</span>}
        {t.state === 'locked' && <span className="skill-badge" aria-hidden="true"><Icon name="lock" /></span>}
        {t.state === 'studying' && <span className="skill-badge warn" aria-hidden="true"><Icon name="clock" /></span>}
      </button>
      {t.caption !== false && <span className="skill-caption">{t.label}</span>}
      {show && <FloatingTip anchor={ref.current} id={t.id} title={t.label} desc={t.desc} lines={hint ? [...t.lines, { text: hint, tone: 'hint' }] : t.lines} />}
    </li>
  );
}

/** Подсказка поверх всего экрана (непрозрачная), прижатая к значку и не выходящая за края окна. */
function FloatingTip({ anchor, id, title, desc, lines }: { anchor: HTMLElement | null; id: string; title: string; desc: string; lines: TipLine[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    if (!anchor || !ref.current) return;
    const a = anchor.getBoundingClientRect();
    const t = ref.current.getBoundingClientRect();
    const left = Math.min(window.innerWidth - t.width - 8, Math.max(8, a.left + a.width / 2 - t.width / 2));
    const above = a.top - t.height - 8;
    const top = above >= 8 ? above : Math.min(window.innerHeight - t.height - 8, a.bottom + 8);
    setPos({ left, top });
  }, [anchor, title, lines.length]);
  // Подсказка выносится в корень документа: так её не обрезает и не перекрывает рамка панели.
  return createPortal(
    <div ref={ref} className="tile-tip" role="tooltip" id={`tip-${id}`} style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: 0 }}>
      <b>{title}</b>
      <span>{desc}</span>
      {lines.map((l) => <small key={l.text} className={l.tone ? `tl-${l.tone}` : undefined}>{l.tone === 'ok' ? '✓ ' : l.tone === 'no' ? '✗ ' : ''}{l.text}</small>)}
    </div>,
    document.body,
  );
}
