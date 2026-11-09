/**
 * Ассеты главного меню M00-B «Наблюдательный рубеж».
 *
 * Схема путей (одна): исходники лежат в `assets/menu/m00b/` (их кладёт `scripts/import_m00b_assets.py`
 * из художественного пакета), Vite подключает их импортом и сам добавляет base `/GameMR/` для GitHub Pages.
 * Файлы ищутся через import.meta.glob: если какой-то картинки ещё нет в репозитории, сборка не падает,
 * а меню честно показывает, чего не хватает, — никаких подменных «похожих» изображений.
 */
const files = import.meta.glob('../../../assets/menu/m00b/**/*.{png,webp,svg}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

const pick = (...names: string[]): string | null => {
  for (const n of names) {
    const hit = files[`../../../assets/menu/m00b/${n}`];
    if (hit) return hit;
  }
  return null;
};

export const MENU_ASSETS = {
  /** Чистая сцена без интерфейса: оптимизированный WebP, при его отсутствии — мастер PNG. */
  background: pick('background/m00b_clean_1920x1080.webp', 'background/m00b_clean_master_1672x941.png'),
  logo: pick('logo/m00b_logo_900.png', 'logo/m00b_logo_source.png'),
  fx: {
    rain: pick('fx/rain_glass_original_rgba.png'),
    dust: pick('fx/dust_warm_original_rgba.png'),
    lightning: pick('fx/lightning_original_rgba.png'),
  },
  /** Скины кнопок: растровые из пакета, иначе редактируемые SVG из PR №48. */
  button: {
    normal: pick('ui/buttons/m00b_normal.png', 'ui/button_normal.svg'),
    hover: pick('ui/buttons/m00b_hover.png', 'ui/button_hover.svg'),
    selected: pick('ui/buttons/m00b_selected.png', 'ui/button_selected.svg'),
    disabled: pick('ui/buttons/m00b_disabled.png', 'ui/button_disabled.svg'),
  },
} as const;

/** Каких обязательных изображений сцены не хватает (для честной пометки на экране и в тестах). */
export function missingMenuArt(a = MENU_ASSETS): string[] {
  const miss: string[] = [];
  if (!a.background) miss.push('фон сцены');
  if (!a.logo) miss.push('логотип');
  return miss;
}
