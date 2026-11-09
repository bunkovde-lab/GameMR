# ART-007 — 35 SVG иконок интерфейса / review

Передано арт-директором по брифу Claude 9 ноября 2026.

- 35 оригинальных vector-outline SVG в `assets/ui/icons/ico-*.svg`.
- Каждая иконка `viewBox="0 0 24 24"`, без внутренних цвета, заливки, style, transform.
- Применять родительский стиль `fill: none; stroke: currentColor; stroke-width: 1.9; stroke-linecap: round; stroke-linejoin: round`.
- В `assets/manifest_art007_entries.json` — 35 отдельных записей `review`, SHA-256, размеры 24×24. Добавлять в действующий manifest, не заменять его целиком.
- Существующий `src/ui/icons.svg` здесь не меняется: Claude собирает из файлов общий SVG-спрайт.
- Художественная приёмка у владельца после просмотра на мобильном экране и сравнения с ART-008/ART-010.

Проверка: превью 13, 19, 24 px, имена согласованы с `src/ui/Icon.tsx`.
