import { getMusic } from './music';
import { useMusicState } from './useMusic';

/** Блок «Музыка» в окне сохранений и настроек: включение и громкость (сохраняются в браузере). */
export function MusicSettings() {
  const { settings, waitingForGesture } = useMusicState();
  const music = getMusic();
  const pct = Math.round(settings.volume * 100);
  return (
    <section className="music-settings" data-testid="music-settings" aria-label="Музыка">
      <h5 className="section-title">Музыка</h5>
      <div className="music-row">
        <button
          className="btn"
          aria-pressed={!settings.muted}
          onClick={() => music.setMuted(!settings.muted)}
          data-testid="music-toggle"
        >
          {settings.muted ? 'Выключена' : 'Включена'}
        </button>
        <label className="music-volume">
          <span>Громкость {pct}%</span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={pct}
            disabled={settings.muted}
            onChange={(e) => music.setVolume(Number(e.target.value) / 100)}
            data-testid="music-volume"
          />
        </label>
      </div>
      {waitingForGesture && !settings.muted && <small className="music-hint">Музыка начнётся после первого нажатия в игре.</small>}
    </section>
  );
}
