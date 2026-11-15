"""把渲染出的 PNG 转成投稿要的 JPG：RGB / 300dpi / 单张 ≤10MB。

简章原文：「单幅作品须 A3 幅面、纵向构图排版、JPG、RGB 或 CMYK，不超过 3 张，分辨率不低于 300dpi，单张图片不超过 10M」。
三件事都不能靠猜：dpi 写进 JFIF 头、subsampling=0 保住细线与刻度边缘、超了就降质量重来。

用法：py -3 scripts/to_jpg.py
产出：submission/01-米字格.jpg … 03-地志.jpg、海报-八百米.jpg
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "submission"
OUT.mkdir(parents=True, exist_ok=True)
LIMIT = 10 * 1024 * 1024

PLATES = [
    ("01", "米字格"),
    ("02", "三种走法"),
    ("03", "地志"),
    ("poster", "海报"),
]

rows = []
for pid, name in PLATES:
    src = ROOT / "output" / f"{pid}.png"
    im = Image.open(src).convert("RGB")
    assert im.size == (3508, 4961), f"{src} 尺寸不对：{im.size}"
    q = 95
    while q >= 70:
        dst = OUT / f"{pid}-{name}.jpg"
        im.save(dst, "JPEG", quality=q, subsampling=0, optimize=True, dpi=(300, 300), progressive=False)
        size = dst.stat().st_size
        if size <= LIMIT:
            break
        q -= 3
    dpi = Image.open(dst).info.get("dpi")
    rows.append((dst.name, f"{im.size[0]}×{im.size[1]}", f"{dpi[0]:.0f}dpi", f"q{q}", f"{size / 1024 / 1024:.2f} MB"))

# 说明 PDF 的缩略图必须在这里生成——干净 clone 里没有 .tmp 时，
# 手工塞进去的缩略图会静默丢失，PDF 看着正常但少四张图（踩过）。
thumb_dir = ROOT / ".tmp" / "thumbs"
thumb_dir.mkdir(parents=True, exist_ok=True)
for pid, name in PLATES:
    src = Image.open(OUT / f"{pid}-{name}.jpg")
    w = 620
    src.resize((w, int(src.height * w / src.width)), Image.LANCZOS).save(thumb_dir / f"{pid}.jpg", "JPEG", quality=88)

for r in rows:
    print("  ".join(r))
print(f"共 {len(rows)} 张，上限 10 MB")
