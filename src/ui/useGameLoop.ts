import { useEffect } from 'react';
import { BALANCE } from '../core/content';
import { dispatch, getGame } from '../store';

/**
 * Единственный источник хода времени: requestAnimationFrame копит реальные миллисекунды
 * и отправляет в ядро целые игровые минуты командой TICK. При паузе ничего не копится.
 */
export function useGameLoop() {
  useEffect(() => {
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
          dispatch({ type: 'TICK', minutes });
        }
      } else {
        acc = 0;
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
  }, []);
}
