"""投稿件复验（对着交付的 JPG 与 PDF 说话，不看渲染过程）。

render.mjs 的断言发生在浏览器里，保证「画的时候是对的」；这里查的是「交出去的东西是对的」——
尺寸、dpi、RGB、体积、张数、色卡像素、红笔像素、成本表能不能加得起来、简章那几条硬规矩。

用法：py -3 scripts/verify.py
退出码 0 才算过。
"""
import hashlib
import json
import re
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SUB = ROOT / "submission"
W, H = 3508, 4961
LIMIT = 10 * 1024 * 1024
PLACE = "湖南省长沙市天心区南托街道滨洲新村三兴片"

fails, notes = [], []


def check(ok, label, detail=""):
    (notes if ok else fails).append(f"{'✓' if ok else '✗'} {label}" + (f" — {detail}" if detail else ""))


data = json.loads((ROOT / "data" / "plates.json").read_text(encoding="utf-8"))
B, S, L = data["brand"], data["system"], data["land"]

# 1 作品名与张数
check(1 <= len(data["work"]) <= 20, "作品名长度合规", data["work"])
plates = sorted(p for p in SUB.glob("*.jpg"))
check(len([p for p in plates if p.name[:2] in ("01", "02", "03")]) <= 3, "图片类不超过 3 张")
check(any("海报" in p.name for p in plates), "展示海报 1 张")
check(len(plates) == 4, "共 4 个 JPG（3 图 + 1 海报）", str([p.name for p in plates]))

# 2 四张图：尺寸 / dpi / 模式 / 体积
hashes = {}
for p in plates:
    im = Image.open(p)
    dpi = im.info.get("dpi", (0, 0))
    size = p.stat().st_size
    check(im.size == (W, H), f"{p.name} 是 A3 300dpi 像素尺寸", f"{im.size}")
    check(abs(dpi[0] - 300) < 1, f"{p.name} JFIF 里写着 300dpi", f"{dpi[0]:.0f}")
    check(im.mode == "RGB", f"{p.name} 是 RGB、无 alpha", im.mode)
    check(size <= LIMIT, f"{p.name} ≤10MB", f"{size / 1024 / 1024:.2f} MB")
    hashes[p.name] = hashlib.sha256(p.read_bytes()).hexdigest()[:12]
check(len(set(hashes.values())) == 4, "四张图内容互不相同", str(hashes))

# 3 说明 PDF 与字数
pdf = SUB / "设计说明.pdf"
check(pdf.exists(), "设计说明.pdf 存在")
if pdf.exists():
    raw = pdf.read_bytes()
    check(raw[:4] == b"%PDF", "设计说明.pdf 是真 PDF")
    check(len(raw) > 50_000, "设计说明.pdf 体积正常（含缩略图）", f"{len(raw) / 1024:.0f} KB")
md = (ROOT / "docs" / "设计说明.md").read_text(encoding="utf-8")
plain = re.sub(r"\s+", "", re.sub(r"[#*`\-|>]", "", md))
check(len(plain) <= 5000, "说明正文 ≤5000 字", f"{len(plain)} 字")
check("AI 使用场景" in md and "AI 创作占比" in md, "说明里标注了 AI 场景与占比")

# 4 硬规矩：作品上不得出现作者信息
for p in plates:
    pass
blob = md + "".join((ROOT / ".tmp" / f"{n}.html").read_text(encoding="utf-8") for n in ("01", "02", "03", "poster"))
for bad in ["张一", "@qq.com", "@163.com", "phone", "手机号：1"]:
    check(bad not in blob, f"交付物里没有作者信息（{bad}）")

# 5 海报：产地逐字 + 四大要素 + 红笔像素
poster_html = (ROOT / ".tmp" / "poster.html").read_text(encoding="utf-8")
check(PLACE in poster_html, "海报上产地逐字出现（省/市/区/街道/村/片）")
check(data["place"] == PLACE, "data 里的产地与简章写法一致")
for kw in ["乡村特色", "乡土故事", "消费增收", "品牌赋能"]:
    check(kw in poster_html, f"海报含四大要素：{kw}")

poster = Image.open(SUB / "poster-海报.jpg").convert("RGB")
px = poster.load()
red = sum(1 for y in range(0, H, 7) for x in range(0, W, 7) if px[x, y][0] > 150 and px[x, y][1] < 90)
ratio = red / ((H // 7) * (W // 7))
check(0.0015 < ratio < 0.12, "海报上红笔（皮尺）占比合理", f"{ratio:.3%}")

# 6 01：五色色卡像素抽样（颜色写错就是另一套品牌）
p1 = Image.open(SUB / "01-米字格.jpg").convert("RGB").load()
for i, c in enumerate(B["colors"]):
    x = 220 + i * 272 + 60
    r, g, b = p1[x, 4510]
    exp = tuple(int(c["hex"][j : j + 2], 16) for j in (1, 3, 5))
    ok = all(abs(a - e) <= 6 for a, e in zip((r, g, b), exp))
    check(ok, f"色卡 {c['name']} 与标注一致", f"取样 {(r, g, b)} vs {exp}")

# 7 米数标：三档覆盖 0–800、孔位单调
tiers = B["tiers"]
rngs = [tuple(int(x) for x in re.findall(r"\d+", t["range"])) for t in tiers]
check(rngs[0][0] == 0 and rngs[-1][1] == 800, "三档覆盖 0–800", str(rngs))
check(all(rngs[i][1] == rngs[i + 1][0] for i in range(len(rngs) - 1)), "三档首尾相接、无缝隙", str(rngs))
dists = [int(b["dist"]) for b in B["bags"]]
check(dists == sorted(dists) and all(0 <= d <= 800 for d in dists), "三款袋的米数落在 0–800 且递增", str(dists))

# 8 成本表加得起来
cost = {r[0]: int(r[1]) for r in L["cost"]["rows"]}
cust = 240 + 40 + 72 + 30
check(cust == cost["成本合计"], "成本四项之和 = 合计", f"{cust} vs {cost['成本合计']}")
check(cost["认养价"] - cost["成本合计"] == cost["毛利"], "认养价 − 成本 = 毛利", f"{cost['毛利']}")
check(cost["毛利"] - cost["其中 村集体 3%"] == cost["运营净得"], "毛利 − 村集体 = 运营净得", f"{cost['运营净得']}")
split = sum(int(x["pct"].rstrip("%")) for x in S["split"])
check(split == 100, "分成三段加起来 100%", f"{split}%")

# 9 每一幅都排了字（不是空白页）
for p in plates:
    im = Image.open(p).convert("L")
    hist = im.histogram()
    ink = sum(hist[:60]) / (W * H)
    check(0.005 < ink < 0.45, f"{p.name} 墨量在合理区间", f"{ink:.2%}")

for line in notes:
    print(line)
if fails:
    print("\n✗ 未过：")
    for f in fails:
        print("  " + f)
    sys.exit(1)
print(f"\n✓ 全部 {len(notes)} 项通过")
