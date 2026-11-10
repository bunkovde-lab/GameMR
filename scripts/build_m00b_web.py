#!/usr/bin/env python3
"""Веб-копии ассетов главного меню M00-B для сборки (исходники в assets/menu/m00b/ не меняются).

Usage: python scripts/build_m00b_web.py
Пишет assets/menu/m00b/web/*.webp: эффекты (дождь, пыль, молния), логотип, обрезанные по альфе кнопки.
Кнопки обрезаются по непрозрачной области, чтобы растягиваться через border-image (9-slice) без искажений.
"""
from pathlib import Path
from PIL import Image

SRC = Path("assets/menu/m00b")
OUT = SRC / "web"


def save(im: Image.Image, name: str, quality: int = 82) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / name
    im.save(path, "WEBP", quality=quality, method=6)
    print(f"OK {path} {im.size} {path.stat().st_size} bytes")


def as_light(im: Image.Image, subtract_floor: bool) -> Image.Image:
    """Слой света для обычного наложения: прозрачность = яркость пикселя (как «экран» без режима смешивания).
    Обычное наложение браузер рисует дешевле, чем mix-blend-mode, особенно на слабых устройствах.
    У дождевого стекла вычитается общий серый «пол», чтобы осталась только вода, а не сплошная дымка."""
    r, g, b, a = im.split()
    lum = Image.merge("RGB", (r, g, b)).convert("L")
    lum = Image.composite(lum, Image.new("L", im.size, 0), a)
    if subtract_floor:
        hist, total, acc, floor = lum.histogram(), im.size[0] * im.size[1], 0, 0
        while acc + hist[floor] < total // 2:
            acc += hist[floor]
            floor += 1
        lum = lum.point(lambda v: max(0, v - floor) * 255 // max(1, 255 - floor))
    out = Image.merge("RGBA", (r, g, b, lum))
    return out


def main() -> None:
    for n in ("rain_glass", "dust_warm", "lightning"):
        save(as_light(Image.open(SRC / f"fx/{n}_original_rgba.png").convert("RGBA"), n == "rain_glass"), f"fx_{n}.webp", 72)
    save(Image.open(SRC / "logo/m00b_logo_source.png").convert("RGBA").resize((1086, 362), Image.LANCZOS), "logo.webp", 90)
    for n in ("normal", "hover", "selected", "disabled"):
        im = Image.open(SRC / f"ui/buttons/m00b_{n}.png").convert("RGBA")
        a = im.getchannel("A").point(lambda v: 255 if v > 40 else 0)
        save(im.crop(a.getbbox()), f"button_{n}.webp", 85)


if __name__ == "__main__":
    main()
