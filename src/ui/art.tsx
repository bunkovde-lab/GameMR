import type { ReactNode } from 'react';

/**
 * W9: точки подключения будущих артов ART-010…014 (docs ART-010 brief). Игровая логика знает только ключ
 * («op1_key», «ending_order», «case1_registry_office»…); как только файл появится в assets/, он подхватится
 * сборкой без изменений кода. Пока файла нет — нейтральная заглушка с подписью, интерактивные элементы всегда рисует код.
 */
const files = import.meta.glob('../../assets/{backgrounds,events,locations}/*.{webp,png,jpg}', { eager: true, import: 'default' }) as Record<string, string>;
const ART: Record<string, string> = {};
for (const [path, url] of Object.entries(files)) {
  const m = /\/([^/]+)\.(webp|png|jpg)$/.exec(path);
  // webp-копия (из сборочного скрипта) приоритетнее исходного png.
  if (m && (!ART[m[1]!] || m[2] === 'webp')) ART[m[1]!] = url;
}
export const artUrl = (key: string): string | undefined => ART[key];

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
