import { useEffect, useSyncExternalStore } from 'react';
import { getMusic, type MusicScene, type MusicSnapshot } from './music';

/** Включает музыку нужной сцены (меню или игра); переход между ними — плавный. */
export function useMusicScene(scene: MusicScene) {
  useEffect(() => { getMusic().setScene(scene); }, [scene]);
}

/** Текущие настройки и состояние музыки для панели настроек. */
export function useMusicState(): MusicSnapshot {
  const m = getMusic();
  return useSyncExternalStore(m.subscribe, m.getSnapshot, m.getSnapshot);
}
