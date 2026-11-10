"""ART-021: веб-копии значков разделов (assets/ui/nav/nav_*.png → assets/ui/nav/web/nav_*.webp, 128×128).

Кнопка показывает значок 28–30 px, 128 px хватает для экранов с плотностью ×3-×4.
Запуск: python3 scripts/build_nav_web.py
"""
from pathlib import Path
from PIL import Image

src = Path('assets/ui/nav')
out = src / 'web'
out.mkdir(exist_ok=True)
for p in sorted(src.glob('nav_*.png')):
    im = Image.open(p).convert('RGBA').resize((128, 128), Image.LANCZOS)
    im.save(out / (p.stem + '.webp'), 'WEBP', quality=90, method=6)
    print(p.name, '->', (out / (p.stem + '.webp')).stat().st_size, 'bytes')
