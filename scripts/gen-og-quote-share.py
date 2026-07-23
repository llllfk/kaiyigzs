"""Generate a compact WeChat OG share cover PNG with Chinese text."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "og-quote-share.png"
W = H = 600

FONT_CANDIDATES = [
    Path(r"C:\Windows\Fonts\msyhbd.ttc"),
    Path(r"C:\Windows\Fonts\msyh.ttc"),
    Path(r"C:\Windows\Fonts\simhei.ttf"),
    Path(r"C:\Windows\Fonts\simsun.ttc"),
]


def load_font(size: int) -> ImageFont.ImageFont:
    for path in FONT_CANDIDATES:
        if path.exists():
            try:
                return ImageFont.truetype(str(path), size=size, index=0)
            except OSError:
                continue
    return ImageFont.load_default()


def main() -> None:
    im = Image.new("RGB", (W, H))
    px = im.load()
    for y in range(H):
        t = y / (H - 1)
        r = int(15 + (42 - 15) * t)
        g = int(39 + (80 - 39) * t)
        b = int(68 + (128 - 68) * t)
        for x in range(W):
            px[x, y] = (r, g, b)

    draw = ImageDraw.Draw(im)
    f_brand = load_font(28)
    f_title = load_font(64)
    f_sub = load_font(28)
    f_foot = load_font(22)

    draw.ellipse((48, 48, 62, 62), fill=(125, 211, 252))
    draw.text((74, 42), "凯艺", font=f_brand, fill=(255, 255, 255))
    draw.text((48, 180), "报价确认", font=f_title, fill=(255, 255, 255))
    draw.text((48, 270), "点击查看并确认报价", font=f_sub, fill=(230, 240, 255))
    draw.line((48, H - 90, W - 48, H - 90), fill=(180, 200, 220), width=1)
    draw.text((48, H - 70), "凯艺销售CRM", font=f_foot, fill=(220, 230, 245))
    draw.text((W - 48, H - 70), "点击打开", font=f_foot, fill=(200, 210, 230), anchor="rt")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    im.save(OUT, format="PNG", optimize=True)
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
