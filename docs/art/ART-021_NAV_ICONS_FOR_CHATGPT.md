# ART-021 — рисованные значки нижней панели и кнопки «Сохранения»

## Зачем
На основном экране кнопки «Карта», «Кадры», «Расследования», «Дирекция», «Завершить смену» и кнопка «Сохранения» в правом верхнем углу сейчас показывают тонкие контурные иконки ART-007. Рядом стоят рисованные гербы отрядов и щиты вызовов на карте — контур на их фоне выглядит чужим. Нужны 6 рисованных значков в том же стиле.

Рисованных значков для этих кнопок в репозитории нет. Пока их нет, «Дирекция» уже показывает утверждённый герб Дирекции (`assets/ui/kit_v2/crest_directorate.png`), остальные — контур ART-007. Как только файл появится в `assets/ui/nav/`, игра подхватит его сама.

## Общий стиль (повторять в каждом промпте)
> Painted game UI emblem icon for a dark gothic-biopunk city-security strategy game. Small heraldic badge: aged gold metal rim, deep crimson enamel field, warm gold symbol in the centre, subtle bevel and soft rim light. Same style as the game's squad banners and incident shields: dark, rich, slightly worn, no glow spam. Front view, centred, symmetrical, one object only. Must stay readable at 28 px: one bold simple symbol, thick shapes, no thin lines, no small details. No text, no letters, no numbers, no frame around the canvas. Plain flat solid #202020 background (it will be cut out). Square 512×512.

Форма-основа у всех шести одна: **круглый медальон** с золотым ободом (не щит — щиты уже заняты вызовами на карте, и не флаг — флаги у отрядов). Символ внутри — только золото, без красных деталей, чтобы не путать с маркерами угроз.

## Значки
| Файл | Кнопка | Символ в медальоне |
|---|---|---|
| `nav_map.png` | Карта | сложенная карта города в три полосы с одной точкой-булавкой |
| `nav_staff.png` | Кадры | три силуэта голов и плеч, центральный чуть выше |
| `nav_investigations.png` | Расследования | лупа поверх листа дела |
| `nav_directorate.png` | Дирекция | маска-герб Дирекции (как на `crest_directorate.png`), упрощённая под 28 px — по желанию; можно оставить утверждённый герб |
| `nav_end_shift.png` | Завершить смену | песочные часы с половиной песка и стрелкой вправо под ними |
| `nav_saves.png` | Сохранения | закрытая папка-архив с печатью Дирекции |

## Промпт (подставить символ)
> [Общий стиль]. Symbol in the centre: <символ на английском>. Round medallion badge.

Пример для «Кадры»: `… Symbol in the centre: three simple head-and-shoulders silhouettes, the middle one slightly taller. Round medallion badge.`

## Что прислать
- 6 PNG, 512×512, фон ровный #202020 (вырежу сам) или настоящая прозрачность.
- По одному значку на картинку.
- Имена как в таблице. Положить в `assets/ui/nav/` или прислать в чат проекта.

## Проверка
- Читается при 28 px на тёмной кнопке (ПК, планшет, телефон).
- Шесть значков похожи друг на друга по форме и цвету и не похожи на щиты вызовов и флаги отрядов.
