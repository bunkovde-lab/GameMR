"""ART-023, часть Г: штампы итога рисуются программно (надпись в рамке, как канцелярский штамп).

Белые «чернила» на чёрном фоне, 1024×512 → assets/ui/stamps/stamp_<итог>.png.
Затем scripts/build_incident_art.py делает из них маски с альфой (цвет и наклон даёт код).
Шрифт — заголовочный шрифт игры (Old Standard TT 700). Потёртость оттиска — детерминированный шум (seed).
Запуск: python3 scripts/make_stamps.py && python3 scripts/build_incident_art.py
"""
import os, random
from PIL import Image, ImageDraw, ImageFilter, ImageFont

FONT = 'node_modules/@fontsource/old-standard-tt/files/old-standard-tt-cyrillic-700-normal.woff'
W, H = 1024, 512
STAMPS = {
    'closed': ['ЗАКРЫТО'],
    'partial': ['ЗАКРЫТО', 'ЧАСТИЧНО'],
    'failed': ['ПРОВАЛЕНО'],
    'expired': ['ИСТЁК СРОК'],
}


def shield(d, cx, cy, s, w):
    """Щит Дирекции: контур щита с ромбом-печатью внутри и короной-зубцами сверху."""
    pts = [(cx - s, cy - s), (cx + s, cy - s), (cx + s, cy + 0.15 * s), (cx, cy + 1.25 * s), (cx - s, cy + 0.15 * s)]
    d.line(pts + [pts[0]], fill=255, width=w, joint='curve')
    r = 0.42 * s
    d.polygon([(cx, cy - r), (cx + r, cy + 0.1 * s), (cx, cy + 0.1 * s + r), (cx - r, cy + 0.1 * s)], fill=255)
    for i in (-1, 0, 1):
        x = cx + i * 0.6 * s
        d.polygon([(x - 0.22 * s, cy - 1.15 * s), (x + 0.22 * s, cy - 1.15 * s), (x, cy - 1.55 * s)], fill=255)


def make(key, lines, seed):
    rnd = random.Random(seed)
    im = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(im)
    m = 22
    d.rounded_rectangle([m, m, W - m, H - m], radius=46, outline=255, width=16)
    d.rounded_rectangle([m + 30, m + 30, W - m - 30, H - m - 30], radius=26, outline=255, width=6)
    # Герб слева и разделитель.
    shield(d, 172, H // 2 - 6, 62, 12)
    d.line([(276, 92), (276, H - 92)], fill=255, width=6)
    # Надпись: подбираем кегль под свободное поле справа от герба.
    box_l, box_r, box_t, box_b = 300, W - 80, 86, H - 86
    size = 150
    while True:
        f = ImageFont.truetype(FONT, size)
        widths = [d.textbbox((0, 0), t, font=f, stroke_width=3)[2] for t in lines]
        lh = f.getbbox('ЁЙ')[3]
        total = lh * len(lines) + 18 * (len(lines) - 1)
        if max(widths) <= box_r - box_l and total <= box_b - box_t:
            break
        size -= 4
    y = (box_t + box_b - total) // 2
    for t, w in zip(lines, widths):
        d.text(((box_l + box_r - w) // 2, y - f.getbbox(t)[1] + 6), t, fill=255, font=f, stroke_width=3, stroke_fill=255)
        y += lh + 18
    # Оттиск: неровный нажим (крупные пятна) и мелкие выщерблины.
    press = Image.new('L', (W // 16, H // 16))
    press.putdata([rnd.randint(150, 255) for _ in range(press.width * press.height)])
    press = press.resize((W, H), Image.BICUBIC).filter(ImageFilter.GaussianBlur(10))
    grain = Image.new('L', (W, H))
    grain.putdata([255 if rnd.random() > 0.07 else rnd.randint(0, 90) for _ in range(W * H)])
    grain = grain.filter(ImageFilter.GaussianBlur(1.2))
    im = Image.composite(im, Image.new('L', (W, H), 0), Image.eval(press, lambda v: v))
    im = Image.composite(im, Image.new('L', (W, H), 0), grain)
    im = im.filter(ImageFilter.GaussianBlur(0.8))
    os.makedirs('assets/ui/stamps', exist_ok=True)
    out = f'assets/ui/stamps/stamp_{key}.png'
    im.convert('RGB').save(out)
    print(out, size)


for i, (k, v) in enumerate(STAMPS.items()):
    make(k, v, 2300 + i)
