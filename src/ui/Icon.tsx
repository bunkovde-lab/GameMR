import legacySprite from './icons.svg?raw';

export type IconName =
  | 'radio' | 'shield' | 'clock' | 'users' | 'pause' | 'play' | 'mail' | 'cog' | 'map' | 'pin'
  | 'warning' | 'beaker' | 'medical' | 'folder' | 'scales' | 'wrench' | 'eye' | 'plus' | 'minus'
  | 'search' | 'check' | 'heart' | 'crosshair' | 'truck' | 'lock' | 'book' | 'person' | 'close'
  | 'save' | 'briefcase' | 'list' | 'layers' | 'upload' | 'chart' | 'arrow';

/**
 * ART-007: единый набор иконок арт-директора (assets/ui/icons/ico-<имя>.svg, 24×24, только контуры).
 * Из файлов собирается спрайт; если файла для имени нет, остаётся символ из старого спрайта прототипа.
 */
const files = import.meta.glob('../../assets/ui/icons/ico-*.svg', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>;
const ART_ICONS: Record<string, string> = {};
for (const [path, svg] of Object.entries(files)) {
  const name = /ico-([a-z]+)\.svg$/.exec(path)?.[1];
  const inner = /<svg[^>]*>([\s\S]*)<\/svg>/.exec(svg)?.[1];
  if (name && inner) ART_ICONS[name] = inner.trim();
}
export const artIconNames = (): string[] => Object.keys(ART_ICONS);

function buildSprite(): string {
  const legacy = [...legacySprite.matchAll(/<symbol id="ico-([a-z]+)"[\s\S]*?<\/symbol>/g)]
    .filter((m) => !ART_ICONS[m[1]!])
    .map((m) => m[0]);
  const art = Object.entries(ART_ICONS).map(([n, inner]) => `<symbol id="ico-${n}" viewBox="0 0 24 24" data-src="art007">${inner}</symbol>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" class="svg-defs">${[...art, ...legacy].join('')}</svg>`;
}
const sprite = buildSprite();

/** Встраивает спрайт один раз в начало документа. */
export function IconSprite() {
  return <div aria-hidden="true" dangerouslySetInnerHTML={{ __html: sprite }} />;
}

export function Icon({ name }: { name: IconName }) {
  return (
    <svg className="icon" aria-hidden="true" focusable="false">
      <use href={`#ico-${name}`} />
    </svg>
  );
}
