# 《八百米》— 第二届乡村新消费暨 OPC 创新实践大赛（滨洲新村三兴片定向命题）

从 6.5 万人的看台，到 2850 人的菜地，直线 800 米。把这段距离做成一个可以计量的品牌。

## 一条命令

```bash
bash scripts/build.sh
```

顺序：字体子集 → 版式出图（fail-closed 护栏）→ 转 JPG（RGB/300dpi/≤10MB）→ 说明 PDF → 复验。
任何一步失败即停，退出码即结论。

## 目录

| 路径 | 是什么 |
|---|---|
| `SPEC.md` | 规格与事实来源（对齐简章逐条） |
| `docs/01-SOURCES.md` | 一级信源逐字摘录 |
| `docs/设计说明.md` | 投稿用设计说明（2970 字，≤5000） |
| `data/plates.json` | 全部版面文字与数据（唯一事实源） |
| `scripts/render.mjs` | 四张版面 + 构建护栏（字体/溢出/比例/边距） |
| `scripts/subset_fonts.py` | 按源码与数据里出现的字挑字体分片 |
| `scripts/to_jpg.py` | 转 JPG，写 JFIF dpi |
| `scripts/statement.mjs` | 说明 → PDF（A4，含四张缩略图） |
| `scripts/verify.py` | 54 项复验（尺寸/dpi/色卡像素/成本对账/硬规矩） |
| `output/` | 3508×4961 PNG（中间产物） |
| `submission/` | 交件：3 图 + 1 海报 + 说明 PDF |
| `proof/` | 闸 A / 闸 D 记录与盲排图 |

## 闸 D 复现

```bash
node scripts/render.mjs --variant B   # 标志主导版
node scripts/render.mjs --variant C   # 产品主导版
```

三版导出到 `proof/gate-d-poster-{A,B,C}.jpg`（760×1075），用于盲排。
