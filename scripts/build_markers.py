"""ART-003/004: уменьшенные копии щитов карты для интерфейса.

Оригиналы assets/ui/markers/*.png (256×320, альфа) не меняются. Копии 128×160 WebP с альфой
(2× для щита ~56 px в высоту) кладутся в assets/ui/markers/web/<имя>.webp.
Запуск: python3 scripts/build_markers.py
"""
import glob, json, os
from PIL import Image

SRC = 'assets/ui/markers'
OUT = os.path.join(SRC, 'web')
os.makedirs(OUT, exist_ok=True)
copies = {}
for f in sorted(glob.glob(os.path.join(SRC, '*.png'))):
    name = os.path.splitext(os.path.basename(f))[0]
    dst = os.path.join(OUT, f'{name}.webp')
    Image.open(f).convert('RGBA').resize((128, 160), Image.LANCZOS).save(dst, 'WEBP', quality=88, method=6)
    copies[f.replace(os.sep, '/')] = dst.replace(os.sep, '/')
    print(dst, os.path.getsize(dst))

m = json.load(open('assets/manifest.json', encoding='utf-8'))
for a in m['assets']:
    if a['file'] in copies:
        a['webCopies'] = [copies[a['file']]]
json.dump(m, open('assets/manifest.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
open('assets/manifest.json', 'a').write('\n')
