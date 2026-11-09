import type { ReactNode } from 'react';

/**
 * W9: точки подключения будущих артов ART-010…014 (docs ART-010 brief). Игровая логика знает только ключ
 * («op1_key», «ending_order», «case1_registry_office»…); как только файл появится в assets/, он подхватится
 * сборкой без изменений кода. Пока файла нет — нейтральная заглушка с подписью, интерактивные элементы всегда рисует код.
 */
const files = {
  ...import.meta.glob('../../assets/{backgrounds,events,locations}/*.{webp,png,jpg}', { eager: true, import: 'default' }),
  // ART-016: только игровые webp-копии Дирекции (оригиналы PNG в сборку не попадают).
  ...import.meta.glob('../../assets/{facilities,research}/web/*.webp', { eager: true, import: 'default' }),
} as Record<string, string>;
const ART: Record<string, string> = {};
for (const [path, url] of Object.entries(files)) {
  const m = /\/([^/]+)\.(webp|png|jpg)$/.exec(path);
  // webp-копия (из сборочного скрипта) приоритетнее исходного png.
  if (m && (!ART[m[1]!] || m[2] === 'webp')) ART[m[1]!] = url;
}
export const artUrl = (key: string): string | undefined => ART[key];

/** ART-010: одноцветные значки видов улик (assets/ui/evidence/<тип>.svg). */
const evFiles = import.meta.glob('../../assets/ui/evidence/*.svg', { eager: true, import: 'default' }) as Record<string, string>;
const EV_ICON: Record<string, string> = {};
for (const [path, url] of Object.entries(evFiles)) {
  const m = /\/([^/]+)\.svg$/.exec(path);
  if (m) EV_ICON[m[1]!] = url;
}
export const evidenceIconUrl = (type: string): string | undefined => EV_ICON[type];

/** ART-003/004: щиты карты (webp-копии 128×160) и одноцветные значки 24×24 для списка и легенды. */
const mkFiles = import.meta.glob('../../assets/ui/markers/web/*.webp', { eager: true, import: 'default' }) as Record<string, string>;
const mkIcons = import.meta.glob('../../assets/ui/markers/*.svg', { eager: true, import: 'default' }) as Record<string, string>;
const MARKER: Record<string, string> = {};
const MARKER_ICON: Record<string, string> = {};
for (const [path, url] of Object.entries(mkFiles)) { const m = /\/(marker_[^/]+)\.webp$/.exec(path); if (m) MARKER[m[1]!] = url; }
for (const [path, url] of Object.entries(mkIcons)) { const m = /\/(marker_[^/]+)\.svg$/.exec(path); if (m) MARKER_ICON[m[1]!] = url; }
export const markerArtUrl = (key: string): string | undefined => MARKER[key];
export const markerIconUrl = (key: string): string | undefined => MARKER_ICON[key];

/** Одноцветный значок 24×24 через маску: цвет берётся из currentColor, как у встроенных иконок. */
export function MarkerIcon({ markerKey, size = 18 }: { markerKey: string; size?: number }) {
  const url = markerIconUrl(markerKey);
  if (!url) return null;
  return <span className="mk-icon" aria-hidden="true" style={{ width: size, height: size, maskImage: `url("${url}")`, WebkitMaskImage: `url("${url}")` }} data-testid={`mk-icon-${markerKey}`} />;
}

/** Иллюстрация с заглушкой. `label` описывает, что здесь будет: для читателя экрана и пока арта нет. */
export function ArtSlot({ artKey, label, className = '', children }: { artKey: string; label: string; className?: string; children?: ReactNode }) {
  const url = artUrl(artKey);
  return (
    <div
      className={`art-slot${url ? ' has-art' : ' placeholder'} ${className}`}
      style={url ? { backgroundImage: `url(${url})` } : undefined}
      role="img"
      aria-label={label}
      data-art={artKey}
      data-testid={`art-${artKey}`}
    >
      {!url && <small className="art-missing">{label} · арт ожидается</small>}
      {children}
    </div>
  );
}
