/**
 * Ассеты главного меню M00-B «Наблюдательный рубеж».
 *
 * Схема путей (одна): исходники художника лежат в `assets/menu/m00b/` (их кладёт `scripts/import_m00b_assets.py`
 * из пакета GameMR_M00B_Claude_Handoff_v1.zip), веб-копии — в `assets/menu/m00b/web/` (`scripts/build_m00b_web.py`).
 * Vite подключает их импортом и сам добавляет base `/GameMR/` для GitHub Pages.
 * Поиск через import.meta.glob: если файла нет, сборка не падает, а меню честно показывает, чего не хватает,
 * — никаких подменных «похожих» изображений. В сборку попадают только веб-копии, не тяжёлые исходники.
 */
const files = {
  ...import.meta.glob('../../../assets/menu/m00b/web/*.webp', { eager: true, query: '?url', import: 'default' }),
  ...import.meta.glob('../../../assets/menu/m00b/background/m00b_clean_1920x1080.webp', { eager: true, query: '?url', import: 'default' }),
  ...import.meta.glob('../../../assets/menu/m00b/ui/*.svg', { eager: true, query: '?url', import: 'default' }),
} as Record<string, string>;

const pick = (...names: string[]): string | null => {
  for (const n of names) {
    const hit = files[`../../../assets/menu/m00b/${n}`];
    if (hit) return hit;
  }
  return null;
};

export const MENU_ASSETS = {
  /** Чистая сцена без интерфейса (WebP 1920×1080 из пакета художника) */
  background: pick('background/m00b_clean_1920x1080.webp'),
  logo: pick('web/logo.webp'),
  fx: {
    rain: pick('web/fx_rain_glass.webp'),
    dust: pick('web/fx_dust_warm.webp'),
    lightning: pick('web/fx_lightning.webp'),
  },
  /** Плашки кнопок: растровые из пакета (обрезаны по альфе), иначе редактируемые SVG из PR №48. */
  button: {
    normal: pick('web/button_normal.webp', 'ui/button_normal.svg'),
    hover: pick('web/button_hover.webp', 'ui/button_hover.svg'),
    selected: pick('web/button_selected.webp', 'ui/button_selected.svg'),
    disabled: pick('web/button_disabled.webp', 'ui/button_disabled.svg'),
  },
  /** Растровые плашки содержат свой ромб — тогда CSS-ромб не рисуется */
  rasterButtons: !!pick('web/button_selected.webp'),
} as const;

/** Каких обязательных изображений сцены не хватает (для честной пометки на экране и в тестах). */
export function missingMenuArt(a: { background: string | null; logo: string | null } = MENU_ASSETS): string[] {
  const miss: string[] = [];
  if (!a.background) miss.push('фон сцены');
  if (!a.logo) miss.push('логотип');
  return miss;
}
