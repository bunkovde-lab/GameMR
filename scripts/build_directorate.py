"""ART-016: игровые копии артов Дирекции. Оригиналы PNG не меняются.

assets/facilities/facility_<id>.png 960×540 → assets/facilities/web/facility_<id>.webp 640×360 (полоса карточки);
assets/research/research_<id>.png 512×512 → assets/research/web/research_<id>.webp 128×128 (миниатюра 56 px, 2×).
Запуск: python3 scripts/build_directorate.py
"""
import glob, json, os
from PIL import Image

copies = {}
for src, size in (('assets/facilities', (640, 360)), ('assets/research', (128, 128))):
    out = os.path.join(src, 'web')
    os.makedirs(out, exist_ok=True)
    for f in sorted(glob.glob(os.path.join(src, '*.png'))):
        dst = os.path.join(out, os.path.basename(f)[:-4] + '.webp')
        Image.open(f).convert('RGB').resize(size, Image.LANCZOS).save(dst, 'WEBP', quality=82, method=6)
        copies[f] = dst
        print(dst, os.path.getsize(dst))

m = json.load(open('assets/manifest.json', encoding='utf-8'))
for a in m['assets']:
    if a['file'] in copies:
        a['webCopies'] = [copies[a['file']]]
json.dump(m, open('assets/manifest.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
open('assets/manifest.json', 'a').write('\n')
