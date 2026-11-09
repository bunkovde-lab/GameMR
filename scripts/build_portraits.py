"""ART-005 и ART-009: уменьшенные копии утверждённых портретов для интерфейса.

Оригиналы assets/characters/portrait_pNN_*.png не меняются. Копии 256×320 WebP
(2× для рамки 128×160) кладутся в assets/characters/web/portrait_pNN.webp,
квадратная обрезка лица 128×128 — в assets/characters/web/face_pNN.webp (для списков).
ART-009: candidate_cNN_*.png → portrait_cNN.webp и face_cNN.webp (та же обрезка лица).
ART-011: npc_cN_MM.png (фигуранты дел) → portrait_npc_cN_MM.webp и face_npc_cN_MM.webp.
Запуск: python3 scripts/build_portraits.py
"""
import glob, os, re
from PIL import Image

SRC = 'assets/characters'
OUT = os.path.join(SRC, 'web')
os.makedirs(OUT, exist_ok=True)
for f in sorted(glob.glob(os.path.join(SRC, 'portrait_p*.png')) + glob.glob(os.path.join(SRC, 'candidate_c*.png'))):
    kind, num = re.match(r'(?:portrait|candidate)_([pc])(\d\d)_', os.path.basename(f)).groups()
    n = f'{kind}{num}'
    im = Image.open(f).convert('RGB').resize((256, 320), Image.LANCZOS)
    dst = os.path.join(OUT, f'portrait_{n}.webp')
    im.save(dst, 'WEBP', quality=84, method=6)
    print(dst, os.path.getsize(dst))
    face = Image.open(f).convert('RGB').crop((96, 16, 416, 336)).resize((128, 128), Image.LANCZOS)
    fdst = os.path.join(OUT, f'face_{n}.webp')
    face.save(fdst, 'WEBP', quality=84, method=6)
    print(fdst, os.path.getsize(fdst))

# ART-011: лица фигурантов дел. Пакет на приёмке вырезан из концепт-листа: сверху и снизу у кадра
# однотонные поля (≈ 55 и 140 px). Для игровых копий берём кадр 4:5 по высоте содержимого,
# по центру; оригиналы PNG не меняются. Когда придут индивидуальные генерации без полей, обрезка станет пустой.
import numpy as np

def content_box(im):
    a = np.asarray(im).astype(int)
    rows = np.where(a.std(axis=1).mean(axis=1) > 2)[0]
    y0, y1 = int(rows[0]), int(rows[-1]) + 1
    h = y1 - y0
    w = min(im.width, round(h * 0.8))
    x0 = (im.width - w) // 2
    return (x0, y0, x0 + w, y0 + round(w / 0.8))

for f in sorted(glob.glob(os.path.join(SRC, 'npc_c*.png'))):
    n = os.path.splitext(os.path.basename(f))[0]
    src = Image.open(f).convert('RGB')
    im = src.crop(content_box(src)).resize((512, 640), Image.LANCZOS)
    im.resize((256, 320), Image.LANCZOS).save(os.path.join(OUT, f'portrait_{n}.webp'), 'WEBP', quality=84, method=6)
    # Лицо в этих кадрах крупнее, чем в ART-005/009: квадрат шире, чтобы не срезать макушку и подбородок.
    im.crop((56, 0, 456, 400)).resize((128, 128), Image.LANCZOS).save(os.path.join(OUT, f'face_{n}.webp'), 'WEBP', quality=84, method=6)
    print(n, content_box(src))
