import sprite from './icons.svg?raw';

export type IconName =
  | 'radio' | 'shield' | 'clock' | 'users' | 'pause' | 'play' | 'mail' | 'cog' | 'map' | 'pin'
  | 'warning' | 'beaker' | 'medical' | 'folder' | 'scales' | 'wrench' | 'eye' | 'plus' | 'minus'
  | 'search' | 'check' | 'heart' | 'crosshair' | 'truck' | 'lock' | 'book' | 'person' | 'close'
  | 'save' | 'briefcase' | 'list' | 'layers' | 'upload' | 'chart' | 'arrow';

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
