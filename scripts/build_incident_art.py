"""ART-023: игровые копии артов карточки происшествия.

1. assets/incidents/*.png (1600×900, без альфы) → WebP рядом (1280×720, качество 82).
   art.tsx берёт WebP вместо PNG автоматически.
2. assets/backgrounds/incident_card_bg.png → WebP рядом.
3. assets/ui/stamps/stamp_*.png (штамп одним цветом на однотонном фоне) → assets/ui/stamps/web/stamp_*.webp
   с альфой: непрозрачность = яркость «чернил». Фон определяется по краям, светлый или тёмный — неважно.
   Цвет штампа задаёт код (маска), поэтому цвет на исходнике не важен.
Запуск: python3 scripts/build_incident_art.py
"""
import glob, os
from PIL import Image, ImageOps, ImageStat


def to_webp(src, size=None, quality=82):
    dst = os.path.splitext(src)[0] + '.webp'
    im = Image.open(src).convert('RGB')
    if size:
        im = im.resize(size, Image.LANCZOS)
    im.save(dst, 'WEBP', quality=quality, method=6)
    print(dst, os.path.getsize(dst))


for f in sorted(glob.glob('assets/incidents/*.png')):
    to_webp(f, (1280, 720))
if os.path.exists('assets/backgrounds/incident_card_bg.png'):
    to_webp('assets/backgrounds/incident_card_bg.png')

os.makedirs('assets/ui/stamps/web', exist_ok=True)
for f in sorted(glob.glob('assets/ui/stamps/stamp_*.png')):
    g = Image.open(f).convert('L').resize((512, 256), Image.LANCZOS)
    w, h = g.size
    border = [g.getpixel((x, y)) for x in range(0, w, 8) for y in (0, h - 1)] + [g.getpixel((x, y)) for y in range(0, h, 8) for x in (0, w - 1)]
    if sum(border) / len(border) > 127:  # светлый фон, тёмные чернила
        g = ImageOps.invert(g)
    g = ImageOps.autocontrast(g, cutoff=1)
    out = Image.new('RGBA', g.size, (255, 255, 255, 0))
    out.putalpha(g)
    dst = os.path.join('assets/ui/stamps/web', os.path.basename(f)[:-4] + '.webp')
    out.save(dst, 'WEBP', quality=90, method=6)
    print(dst, os.path.getsize(dst))
