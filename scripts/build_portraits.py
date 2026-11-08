"""ART-005: уменьшенные копии утверждённых портретов для интерфейса.

Оригиналы assets/characters/portrait_pNN_*.png не меняются. Копии 256×320 WebP
(2× для рамки 128×160) кладутся в assets/characters/web/portrait_pNN.webp,
квадратная обрезка лица 128×128 — в assets/characters/web/face_pNN.webp (для списков).
Запуск: python3 scripts/build_portraits.py
"""
import glob, os, re
from PIL import Image

SRC = 'assets/characters'
OUT = os.path.join(SRC, 'web')
os.makedirs(OUT, exist_ok=True)
for f in sorted(glob.glob(os.path.join(SRC, 'portrait_p*.png'))):
    n = re.match(r'portrait_p(\d\d)_', os.path.basename(f)).group(1)
    im = Image.open(f).convert('RGB').resize((256, 320), Image.LANCZOS)
    dst = os.path.join(OUT, f'portrait_p{n}.webp')
    im.save(dst, 'WEBP', quality=84, method=6)
    print(dst, os.path.getsize(dst))
    face = Image.open(f).convert('RGB').crop((96, 16, 416, 336)).resize((128, 128), Image.LANCZOS)
    fdst = os.path.join(OUT, f'face_p{n}.webp')
    face.save(fdst, 'WEBP', quality=84, method=6)
    print(fdst, os.path.getsize(fdst))
