import { useEffect } from 'react';
import { BALANCE } from '../core/content';
import { dispatch, getGame } from '../store';

/** Доля текущей игровой минуты (0..1) — только для плавной отрисовки движения и света, ядро её не видит. */
let subMinute = 0;
export const getSubMinute = () => subMinute;

/**
 * Единственный источник хода времени: requestAnimationFrame копит реальные миллисекунды
 * и отправляет в ядро целые игровые минуты командой TICK. При паузе и в главном меню ничего не копится.
 */
export function useGameLoop(enabled = true) {
  useEffect(() => {
    // Главное меню открыто: игровое время не идёт, накопитель обнуляется (новый эффект начнёт с нуля).
    if (!enabled) return;
    let acc = 0;
    let last = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const dt = Math.min(1000, now - last);
      last = now;
      const g = getGame();
      if (g.phase === 'ACTIVE' && !g.paused) {
        acc += dt * g.speed;
        const minutes = Math.floor(acc / BALANCE.realMsPerGameMinuteAtX1);
        if (minutes > 0) {
          acc -= minutes * BALANCE.realMsPerGameMinuteAtX1;
          // Время не пошло (ждём решения по операции) — не копим долю минуты, иначе отряды «дрожат».
          if (!dispatch({ type: 'TICK', minutes })) acc = 0;
        }
        subMinute = acc / BALANCE.realMsPerGameMinuteAtX1;
      } else if (g.phase !== 'ACTIVE') {
        // Пауза сохраняет накопленную долю минуты: отряд на карте не откатывается назад.
        acc = 0;
        subMinute = 0;
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    const onHide = () => {
      const g = getGame();
      if (document.hidden && g.phase === 'ACTIVE' && !g.paused) dispatch({ type: 'PAUSE' });
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [enabled]);
}
