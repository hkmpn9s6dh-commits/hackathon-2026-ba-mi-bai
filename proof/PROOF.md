# 复验记录

## 本机（Windows / Git Bash）

```
$ bash scripts/build.sh
设计说明.pdf  549 KB
✓ 全部 54 项通过
```

## 构建护栏（render.mjs，fail-closed）

| 断言 | 判据 |
| --- | --- |
| 字体真加载 | `document.fonts.check` + 已加载 face 数 ≥2 |
| 不出右边界 / 不压下一栏 | 每个关键块 `getBoundingClientRect()` 与阈值比对 |
| 800 米测线与比例一致 | 图上测线长度 ÷ 0.86 px/m 与 800 的偏差 ≤2%（实测 688px / 期望 688px） |
| 不溢出画布 | `scrollWidth/Height` ≤ 3508×4961 |
| 出图 | 3508×4961 PNG |

## 交付物复验（verify.py，54 项）

尺寸 / JFIF 300dpi / RGB 无 alpha / 单张 ≤10MB / 四张互不相同 / PDF 是真 PDF 且 >50KB /
说明 ≤5000 字（实测 2970）/ AI 标注在位 / 无作者信息 / 海报产地逐字 / 四大要素齐 /
色卡五色像素抽样（误差 ≤6）/ 三档覆盖 0–800 且首尾相接 / 三袋米数递增 /
成本四项之和=382、499−382=117、117−15=102 / 分成 70+3+27=100 / 每张墨量在合理区间。

## 全新 clone

见下方「clone」小节（脚本 `bash scripts/build.sh` 在 `_clone-bmb` 里从零重建）。

## 全新 clone（`_clone-bmb`）

```
$ git clone bamibai _clone-bmb && cd _clone-bmb && bash scripts/build.sh
设计说明.pdf  549 KB
✓ 全部 54 项通过
```

- 从零重建：字体子集（干净环境只核对不生成）→ 出图 → JPG → PDF → 复验，全绿。
- 与本机产物逐像素比对：01 / 02 / 03 **完全一致**；海报 17403188 像素中 36 个像素差 ≤2（JPEG 取整），可判为一致。
