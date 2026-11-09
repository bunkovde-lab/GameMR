"""ART-017: уменьшенные копии гербов Домов для интерфейса.

Оригиналы assets/houses/crest_hN_<имя>.png (1024×1024, альфа) не меняются.
Копии WebP с альфой: 256 px (карточка Дома, 2× для ~96–128 px) и 64 px (значок 32 px у сделок и допусков)
кладутся в assets/houses/web/crest_hN_256.webp и crest_hN_64.webp.
Запуск: python3 scripts/build_crests.py
"""
import glob, json, os, re
from PIL import Image

SRC = 'assets/houses'
OUT = os.path.join(SRC, 'web')
os.makedirs(OUT, exist_ok=True)
copies = {}
for f in sorted(glob.glob(os.path.join(SRC, 'crest_h*.png'))):
    hid = re.match(r'crest_(h\d)_', os.path.basename(f)).group(1)
    im = Image.open(f).convert('RGBA')
    out = []
    for size in (256, 64):
        dst = os.path.join(OUT, f'crest_{hid}_{size}.webp')
        im.resize((size, size), Image.LANCZOS).save(dst, 'WEBP', quality=90, method=6)
        out.append(dst.replace(os.sep, '/'))
        print(dst, os.path.getsize(dst))
    copies[f.replace(os.sep, '/')] = out

m = json.load(open('assets/manifest.json', encoding='utf-8'))
for a in m['assets']:
    if a['file'] in copies:
        a['webCopies'] = copies[a['file']]
json.dump(m, open('assets/manifest.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
open('assets/manifest.json', 'a').write('\n')
