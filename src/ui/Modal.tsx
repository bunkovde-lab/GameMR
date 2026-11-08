import { useEffect, useRef, type ReactNode } from 'react';

interface Props {
  title: string;
  subtitle?: string;
  onClose?: () => void;
  children: ReactNode;
  testId?: string;
  /** Дополнительный класс окна, например «wide» */
  className?: string;
  /** Закреплённая нижняя полоса с действиями (не прокручивается вместе с содержимым) */
  footer?: ReactNode;
}

/** Модальное окно: фокус внутрь при открытии, Tab не уходит наружу, Esc закрывает (если окно закрываемое). */
export function Modal({ title, subtitle, onClose, children, testId, className, footer }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  // Ссылка на актуальный onClose: окно не перехватывает фокус заново при каждом тике игры.
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const prev = document.activeElement as HTMLElement | null;
    (el.querySelector<HTMLElement>('.btn.primary:not(:disabled)') ?? el.querySelector<HTMLElement>('button:not(:disabled), input'))?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && closeRef.current) {
        e.stopPropagation();
        closeRef.current();
      }
      if (e.key === 'Tab') {
        const f = [...el.querySelectorAll<HTMLElement>('button:not(:disabled), input')];
        if (!f.length) return;
        const first = f[0]!, last = f[f.length - 1]!;
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    el.addEventListener('keydown', onKey);
    return () => {
      el.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, []);
  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal panel${className ? ` ${className}` : ''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title" ref={ref} data-testid={testId}>
        <div className="panel-header">
          <h2 id="modal-title">{title}{subtitle && <small className="modal-sub">{subtitle}</small>}</h2>
          {onClose && (
            <button className="btn icon-only" onClick={onClose} aria-label="Закрыть">✕</button>
          )}
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
