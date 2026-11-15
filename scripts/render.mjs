/**
 * 版式渲染 + 构建护栏（fail-closed：任一断言不过就不出图）
 *
 * 用法：node scripts/render.mjs [--only 01] [--variant A|B|C]
 * 产出：output/01.png … 03.png + poster.png，3508×4961（A3 300dpi）
 *
 * 这里的断言不是走形式：
 *  - 字体没真加载 → 静默回落系统字体，字全变而图照样出（踩过两次）
 *  - 皮尺刻度与米数不成比例 → 「零到八百」就是假话，但画面照样好看
 *  - 文字溢出安全区 → 打印裁切吃掉半行字，屏幕上看不出来
 */
import { chromium } from "playwright";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const W = 3508;
const H = 4961;
const M = 220; // 安全边距
const CW = W - M * 2; // 内容宽 3068

const D = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "plates.json"), "utf8"));
const arg = (k) => {
  const i = process.argv.indexOf(k);
  return i > -1 ? process.argv[i + 1] : null;
};
const only = arg("--only");
const variant = arg("--variant");

const INK = "#14181A";
const PAPER = "#F4F1E8";
const RED = "#C8322A";
const PURPLE = "#6E2740";
const GREEN = "#DDE6D5";

const svgLayer = (inner) =>
  inner ? `<svg width="${W}" height="${H}" style="position:absolute;left:0;top:0;pointer-events:none">${inner}</svg>` : "";

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* 确定性伪随机：同一份数据每次构建出同一张图（clone 复验才有意义） */
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* 米字格：方框 + 米 的两笔做成尺 + 格沿的尺；右下角打一个 800 的孔 */
function mark(x, y, s, { color = INK, tick = true } = {}) {
  const h = s / 2;
  const t = Math.max(3, s * 0.009);
  const d = Math.max(2, s * 0.0035);
  const bar = Math.max(4, s * 0.0115);
  const th = s * 0.052; // 刻度高
  let g = `<g transform="translate(${x},${y})">`;
  // 格（米字格的外框）
  g += `<rect x="0" y="0" width="${s}" height="${s}" fill="none" stroke="${color}" stroke-width="${t * 1.4}"/>`;
  // 两条虚线对角（米字格的辅助线）
  g += `<line x1="0" y1="0" x2="${s}" y2="${s}" stroke="${color}" stroke-width="${d}" stroke-dasharray="${s * 0.026} ${s * 0.02}" opacity="0.72"/>`;
  g += `<line x1="0" y1="${s}" x2="${s}" y2="0" stroke="${color}" stroke-width="${d}" stroke-dasharray="${s * 0.026} ${s * 0.02}" opacity="0.72"/>`;
  // 格里写一个"米"：字形与格线咬合，这才是米字格
  g += `<text x="${h}" y="${s * 0.815}" text-anchor="middle" font-family="Noto Serif SC" font-weight="600" font-size="${s * 0.78}" fill="${color}">米</text>`;
  // 格沿的尺：0..800，八个一百
  if (tick) {
    const ty = s + t * 1.6;
    const tt = s * 0.075;
    g += `<rect x="0" y="${ty}" width="${s}" height="${tt}" fill="${PAPER}" stroke="${color}" stroke-width="${t * 0.6}"/>`;
    for (let i = 0; i <= 40; i++) {
      const px = (s * i) / 40;
      const major = i % 5 === 0;
      g += `<line x1="${px}" y1="${ty}" x2="${px}" y2="${ty + (major ? tt : tt * 0.45)}" stroke="${color}" stroke-width="${major ? t * 0.55 : d}"/>`;
      if (i % 10 === 0) {
        const anchor = i === 40 ? "end" : "start";
        const dx = i === 40 ? -6 : 6;
        g += `<text x="${px + dx}" y="${ty + tt - tt * 0.14}" text-anchor="${anchor}" font-family="Noto Sans SC" font-weight="300" font-size="${tt * 0.42}" fill="${color}">${i * 20}</text>`;
      }
    }
  }
  g += `</g>`;
  return g;
}

/* 皮尺：0..800 米映射到 w 像素 */
function tape({ x, y, w, h, total = 800, hole = [], labels = true, color = INK, red = RED, bg = true, minor = 5, major = 100 }) {
  let g = `<g>`;
  if (bg) g += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${PAPER}" stroke="${color}" stroke-width="2.5"/>`;
  else g += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${color}" stroke-width="2"/>`;
  for (let m = 0; m <= total; m += minor) {
    const px = x + (w * m) / total;
    const isMajor = m % major === 0;
    const mid = m % (major / 2) === 0;
    const th = isMajor ? h : mid ? h * 0.62 : h * 0.3;
    g += `<line x1="${px}" y1="${y}" x2="${px}" y2="${y + th}" stroke="${isMajor ? color : red}" stroke-width="${isMajor ? 2.6 : 1.6}" opacity="${isMajor ? 1 : 0.85}"/>`;
    if (isMajor && labels) {
      g += `<text x="${px}" y="${y + h + h * 0.40}" text-anchor="middle" font-family="Noto Sans SC" font-weight="300" font-size="${h * 0.34}" fill="${color}">${m}</text>`;
    }
  }
  for (const hp of hole) {
    const px = x + (w * hp.m) / total;
    g += `<circle cx="${px}" cy="${y + h * 0.5}" r="${h * 0.26}" fill="${PAPER}" stroke="${red}" stroke-width="4"/>`;
    g += `<circle cx="${px}" cy="${y + h * 0.5}" r="${h * 0.1}" fill="${color}"/>`;
  }
  g += `</g>`;
  return g;
}

function header(num, kicker, en, right) {
  return `<div class="hd">
    <div class="hd-l"><span class="num">${num}</span><span class="kick">${esc(kicker)}</span><span class="en">${esc(en)}</span></div>
    <div class="hd-r">${esc(right)}</div>
  </div>`;
}

/* ---------------- 01 品牌核心 ---------------- */
function plate01() {
  const B = D.brand;
  const bagW = 940;
  const bagH = 1310;
  const bagGap = (CW - bagW * 3) / 2;
  const tapeY = 1620;
  const tapeH = 140;
  const bagTop = 2180;

  let s = "";
  let bg = "";
  let fgSvg = "";

  // 米字格 + 字标
  bg += mark(M, 330, 660);
  s += `<div class="wordmark" style="left:1030px;top:330px">${esc(D.work)}</div>`;
  s += `<div class="wm-en" style="left:1042px;top:790px">${esc(B.en)}<span class="wm-dot">·</span>${esc(D.subtitle)}</div>`;
  s += `<div class="wm-line" style="left:1038px;top:890px">${esc(B.line)}</div>`;

  // 三条说明
  const colW = (CW - 80) / 3;
  B.notes.forEach((n, i) => {
    s += `<div class="note" style="left:${M + i * (colW + 40)}px;top:1140px;width:${colW}px">
      <div class="note-n">${esc(n.n)}</div>
      <div class="note-h">${esc(n.head)}</div>
      <div class="note-b">${esc(n.body)}</div>
    </div>`;
  });

  // 大皮尺：三档
  s += `<div class="cap" style="left:${M}px;top:${tapeY - 72}px">米数标 · 一袋一孔</div>`;
  s += `<div class="cap-r" style="left:${M + CW - 700}px;top:${tapeY - 72}px;width:700px">0 — 800 m</div>`;
  bg += tape({ x: M, y: tapeY, w: CW, h: tapeH, hole: B.bags.map((b) => ({ m: +b.dist })) });
  // 孔上方的小标（A 148 / B 312 / C 684）
  B.bags.forEach((b) => {
    const px = M + (CW * +b.dist) / 800;
    s += `<div class="hole-tag" style="left:${px - 90}px;top:${tapeY - 128}px;width:180px">${esc(b.no)} · ${esc(b.dist)} m</div>`;
  });

  // 三档刻度括号
  const zones = [
    { a: 0, b: 200, t: B.tiers[0], fill: RED },
    { a: 200, b: 500, t: B.tiers[1], fill: PURPLE },
    { a: 500, b: 800, t: B.tiers[2], fill: INK },
  ];
  zones.forEach((z) => {
    const x1 = M + (CW * z.a) / 800;
    const x2 = M + (CW * z.b) / 800;
    const yy = tapeY + tapeH + 118;
    s += `<div class="brk" style="left:${x1 + 6}px;top:${yy}px;width:${x2 - x1 - 12}px;border-color:${z.fill}"></div>`;
    s += `<div class="tier" style="left:${x1 + 6}px;top:${yy + 24}px;width:${x2 - x1 - 12}px">
      <span class="tier-l" style="color:${z.fill}">${esc(z.t.label)}</span>
      <span class="tier-r">${esc(z.t.range)}</span>
      <span class="tier-n">${esc(z.t.note)}</span>
    </div>`;
  });

  // 三款米袋
  B.bags.forEach((b, i) => {
    const x = M + i * (bagW + bagGap);
    const bgc = b.tone === "purple" ? PURPLE : b.tone === "ink" ? INK : PAPER;
    const fg = b.tone === "paper" ? INK : PAPER;
    const line = b.tone === "paper" ? INK : PAPER;
    const stamp = b.tone === "paper" ? RED : PAPER;
    s += `<div class="bag" style="left:${x}px;top:${bagTop}px;width:${bagW}px;height:${bagH}px;background:${bgc};border-color:${line}">
      <div class="bag-seal" style="border-color:${line}"></div>
      <div class="bag-no" style="color:${line}">${esc(b.no)}</div>
      <div class="bag-name" style="color:${fg}">${esc(b.name)}</div>
      <div class="bag-dist" style="color:${fg}">${esc(b.dist)}<span class="bag-m">m</span></div>
      <div class="bag-when" style="color:${stamp}">${esc(b.when)}</div>
      <div class="bag-rule" style="background:${line}"></div>
      <div class="bag-meta" style="color:${fg}">
        <div class="bm-1">${esc(b.crop)}</div>
        <div class="bm-2">${esc(b.group)} · ${esc(b.time)}</div>
      </div>
      <div class="bag-foot" style="color:${line}">一袋一孔 · 孔即证据</div>
      <div class="bag-code" style="color:${line}">米账 · ${esc(b.no)}-${esc(b.group)}-${esc(b.dist)}</div>
    </div>`;
    fgSvg += tape({
      x: x + 80,
      y: bagTop + 800,
      w: bagW - 160,
      h: 62,
      total: 800,
      hole: [{ m: +b.dist }],
      labels: false,
      color: line,
      red: b.tone === "paper" ? RED : PAPER,
      bg: false,
      minor: 20,
      major: 200,
    });
  });

  // 底部：材料与工艺 + 成本 + 认养牌
  const bTop = 3760;
  const bCol = (CW - 80) / 3;
  const bottom = [
    {
      h: "材料与工艺",
      b: ["米袋 120 g 牛皮纸，单色墨＋一色红。", "米数标用打孔机在实测位置冲孔，孔径 8 mm——不是印刷，是打出来的。", "编号串代替二维码：村里打印店就能补印。"],
    },
    {
      h: "成本",
      b: ["米袋 0.62 元／个（5000 个起印）。", "认养牌 3.4 元／块（竹纤维板，丝印）。", "一米地认养 499 元／季，成本 382 元，毛利 117 元。"],
    },
    {
      h: "一畦米地",
      b: ["1 m × 10 m，保底 40 kg，6 次配送，2 次村游。", "牌上写组号与米数：认养的人知道自己的菜长在哪一米。", "首季试 60 畦，够一个小区跑通。"],
    },
  ];
  bottom.forEach((c, i) => {
    s += `<div class="bcol" style="left:${M + i * (bCol + 40)}px;top:${bTop}px;width:${bCol}px">
      <div class="bc-h">${esc(c.h)}</div>
      ${c.b.map((x2) => `<div class="bc-b">${esc(x2)}</div>`).join("")}
    </div>`;
  });

  // 色卡
  const swW = 250;
  B.colors.forEach((c, i) => {
    const x = M + i * (swW + 22);
    s += `<div class="sw" style="left:${x}px;top:4440px;width:${swW}px">
      <div class="sw-c" style="background:${c.hex};border-color:${INK}"></div>
      <div class="sw-t">${esc(c.name)}<span class="sw-h">${esc(c.hex)}</span></div>
    </div>`;
  });
  s += `<div class="type-note" style="left:${M + 5 * (swW + 22)}px;top:4452px;width:${CW - 5 * (swW + 22)}px">${esc(B.type_note)}</div>`;

  return {
    html: `<div class="page">${header("01", B.kicker, B.en_kicker, D.work + " · " + D.subtitle)}${svgLayer(bg)}${s}${svgLayer(fgSvg)}</div>`,
    checks: [
      { sel: ".wordmark", maxRight: W - M + 2, name: "字标不出右边界" },
      { sel: ".note", maxBottom: 1560, name: "说明不挤进皮尺" },
      { sel: ".bag", maxBottom: 3660, name: "米袋不压底栏" },
    ],
  };
}

/* ---------------- 02 系统 ---------------- */
function plate02() {
  const S = D.system;
  const mapX = M;
  const mapY = 760;
  const mapW = CW;
  const mapH = 2320;
  const mx = mapX + 40;
  const my = mapY + 40;
  const mw = mapW - 80;
  const mh = mapH - 80;
  const PXPM = 0.86; // 1 像素 = 0.86 米

  const riverL = mx;
  const riverR = mx + 250;
  const vilL = riverR + 130;
  const vilR = mx + mw - 400;
  const vilT = my + 420;
  const vilB = my + mh - 260;
  const railX = mx + mw - 250;
  const stX = (vilL + vilR) / 2 + 60;
  const stY = my + 250;
  const stRX = 290;
  const stRY = 100;

  let g = `<g>`;
  g += `<rect x="${mapX}" y="${mapY}" width="${mapW}" height="${mapH}" fill="${PAPER}" stroke="${INK}" stroke-width="3"/>`;

  // 湘江
  g += `<path d="M ${riverL + 40} ${my} C ${riverL - 20} ${my + 520}, ${riverL + 60} ${my + 980}, ${riverL + 10} ${my + 1500}
    S ${riverL + 70} ${my + mh - 60}, ${riverL + 30} ${my + mh}
    L ${riverR - 10} ${my + mh} C ${riverR + 30} ${my + mh - 120}, ${riverR - 30} ${my + 1200}, ${riverR + 10} ${my + 700}
    S ${riverR - 20} ${my + 300}, ${riverR - 30} ${my} Z"
    fill="#CBD8D4" stroke="${INK}" stroke-width="2.4"/>`;
  const rx0 = (riverL + riverR) / 2;
  const ry0 = my + mh / 2;
  g += `<text x="${rx0}" y="${ry0}" text-anchor="middle" font-family="Noto Serif SC" font-weight="600" font-size="88" fill="${INK}" opacity="0.5" transform="rotate(-90 ${rx0} ${ry0})">湘江</text>`;

  // 京广铁路
  g += `<line x1="${railX}" y1="${my}" x2="${railX}" y2="${my + mh}" stroke="${INK}" stroke-width="6"/>`;
  g += `<line x1="${railX + 32}" y1="${my}" x2="${railX + 32}" y2="${my + mh}" stroke="${INK}" stroke-width="6"/>`;
  for (let yy = my + 8; yy < my + mh; yy += 30) {
    g += `<line x1="${railX - 12}" y1="${yy}" x2="${railX + 44}" y2="${yy}" stroke="${INK}" stroke-width="2.2" opacity="0.45"/>`;
  }
  const rlx = railX + 14;
  const rly = my + 860;
  g += `<text x="${rlx}" y="${rly}" font-family="Noto Sans SC" font-weight="300" font-size="40" fill="${INK}" letter-spacing="10" transform="rotate(90 ${rlx} ${rly})">京广铁路</text>`;

  // 村域
  g += `<defs><pattern id="furrow" width="24" height="24" patternUnits="userSpaceOnUse" patternTransform="rotate(26)">
    <line x1="0" y1="0" x2="0" y2="24" stroke="${INK}" stroke-width="1.4" opacity="0.32"/></pattern></defs>`;
  g += `<path d="M ${vilL} ${vilT} L ${vilR} ${vilT + 34} L ${vilR - 26} ${vilB} L ${vilL + 44} ${vilB - 52} Z"
    fill="url(#furrow)" stroke="${INK}" stroke-width="3"/>`;
  g += `<text x="${vilL + 50}" y="${vilB - 120}" font-family="Noto Serif SC" font-weight="600" font-size="92" fill="${INK}">三兴片</text>`;
  g += `<text x="${vilL + 54}" y="${vilB - 66}" font-family="Noto Sans SC" font-weight="300" font-size="38" fill="${INK}" letter-spacing="2">${esc(S.map.village_note)}</text>`;

  // 闲置菜地（存量）——反向斜线斑块：说明可转一畦米地的存量
  g += `<defs><pattern id="idle" width="15" height="15" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
    <line x1="0" y1="0" x2="0" y2="15" stroke="${INK}" stroke-width="1.5" opacity="0.5"/></pattern></defs>`;
  const idle = [[0.16, 0.26], [0.5, 0.2], [0.74, 0.54], [0.28, 0.7], [0.58, 0.84]];
  idle.forEach(([u, v]) => {
    const x = vilL + (vilR - vilL) * u;
    const y = vilT + (vilB - vilT) * v;
    g += `<rect x="${x}" y="${y}" width="150" height="96" fill="#E7E1D2" stroke="${INK}" stroke-width="2.4" stroke-dasharray="10 8"/>`;
  });
  g += `<text x="${vilL + (vilR - vilL) * 0.16}" y="${vilT + (vilB - vilT) * 0.26 - 14}" font-family="Noto Sans SC" font-weight="300" font-size="26" fill="${INK}" opacity="0.65">闲置菜地（存量）</text>`;

  // 圭白路
  const roadY1 = vilT + (vilB - vilT) * 0.58;
  const roadD = `M ${riverR + 20} ${roadY1 - 40} C ${vilL + 300} ${roadY1 - 90}, ${vilL + 900} ${roadY1 + 60}, ${railX} ${roadY1}`;
  g += `<path d="${roadD}" fill="none" stroke="${INK}" stroke-width="20" opacity="0.16"/>`;
  g += `<path d="${roadD}" fill="none" stroke="${INK}" stroke-width="3" stroke-dasharray="24 15"/>`;
  g += `<text x="${vilL + 360}" y="${roadY1 - 70}" font-family="Noto Sans SC" font-weight="500" font-size="40" fill="${INK}" letter-spacing="8">圭白路</text>`;

  // 17 个村民组
  const rnd = mulberry32(20261116);
  for (let i = 0; i < 17; i++) {
    const gx = vilL + 130 + rnd() * (vilR - vilL - 300);
    const gy = vilT + 230 + rnd() * (vilB - vilT - 340);
    g += `<rect x="${gx - 10}" y="${gy - 10}" width="20" height="20" fill="${INK}"/>`;
    g += `<text x="${gx + 16}" y="${gy + 11}" font-family="Noto Sans SC" font-weight="300" font-size="28" fill="${INK}" opacity="0.72">${i + 1}</text>`;
  }

  // 奥体中心
  g += `<ellipse cx="${stX}" cy="${stY}" rx="${stRX}" ry="${stRY}" fill="none" stroke="${INK}" stroke-width="7"/>`;
  g += `<ellipse cx="${stX}" cy="${stY}" rx="${stRX - 76}" ry="${stRY - 34}" fill="none" stroke="${INK}" stroke-width="3"/>`;
  g += `<ellipse cx="${stX}" cy="${stY}" rx="${stRX - 170}" ry="${stRY - 64}" fill="${INK}" opacity="0.1"/>`;
  g += `<text x="${stX}" y="${stY - stRY - 92}" text-anchor="middle" font-family="Noto Serif SC" font-weight="600" font-size="72" fill="${INK}">奥体中心</text>`;
  g += `<text x="${stX}" y="${stY - stRY - 30}" text-anchor="middle" font-family="Noto Sans SC" font-weight="300" font-size="34" fill="${INK}" letter-spacing="2">主场馆 6.5 万座 · 2028 年底竣工</text>`;

  // 奥体大道
  const adD = `M ${stX - 120} ${stY + stRY} C ${stX - 190} ${stY + stRY + 120}, ${stX - 300} ${vilT - 120}, ${stX - 330} ${vilT}`;
  g += `<path d="${adD}" fill="none" stroke="${INK}" stroke-width="22" opacity="0.16"/>`;
  g += `<path d="${adD}" fill="none" stroke="${INK}" stroke-width="4" stroke-dasharray="28 16"/>`;
  g += `<text x="${stX - 330}" y="${vilT + 66}" font-family="Noto Sans SC" font-weight="500" font-size="36" fill="${INK}" letter-spacing="6">奥体大道 ↘</text>`;

  // 800 米测线（严格按比例）
  const ang = Math.atan2(vilT + 10 - (stY + stRY), vilL + 240 - (stX - 120));
  const lineLen = 800 * PXPM;
  const mFromX = stX - 120;
  const mFromY = stY + stRY;
  const mToX = mFromX + Math.cos(ang) * lineLen;
  const mToY = mFromY + Math.sin(ang) * lineLen;
  const realPx = Math.hypot(mToX - mFromX, mToY - mFromY);
  g += `<line x1="${mFromX}" y1="${mFromY}" x2="${mToX}" y2="${mToY}" stroke="${RED}" stroke-width="7"/>`;
  g += `<circle cx="${mFromX}" cy="${mFromY}" r="12" fill="${RED}"/><circle cx="${mToX}" cy="${mToY}" r="12" fill="${RED}"/>`;
  const labX = mFromX + (mToX - mFromX) * 0.54;
  const labY = mFromY + (mToY - mFromY) * 0.54;
  let deg = (ang * 180) / Math.PI;
  if (deg > 90) deg -= 180;
  if (deg < -90) deg += 180;
  g += `<g transform="translate(${labX},${labY}) rotate(${deg})">
    <rect x="-128" y="-80" width="256" height="72" fill="${PAPER}"/>
    <text x="0" y="-22" text-anchor="middle" font-family="Noto Sans SC" font-weight="500" font-size="56" fill="${RED}" letter-spacing="2">800 m</text>
  </g>`;
  g += `<text x="${mToX - 240}" y="${mToY - 34}" font-family="Noto Sans SC" font-weight="300" font-size="32" fill="${RED}">最近的一块菜地</text>`;

  // 九峰苑（结对社区）方向
  const ny = my + 190;
  g += `<path d="M ${vilL + 30} ${ny + 120} C ${riverL + 120} ${ny + 160}, ${riverL - 10} ${ny + 60}, ${mx - 6} ${ny}" fill="none" stroke="${INK}" stroke-width="3" stroke-dasharray="14 12" opacity="0.75"/>`;
  g += `<text x="${riverR + 6}" y="${my + 62}" font-family="Noto Sans SC" font-weight="500" font-size="36" fill="${INK}" letter-spacing="4">九峰苑社区</text>`;
  g += `<text x="${riverR + 6}" y="${my + 106}" font-family="Noto Sans SC" font-weight="300" font-size="27" fill="${INK}" opacity="0.78">结对社区 · 15 个小区团购群</text>`;

  // 比例尺 + 指北针
  const sbW = 400 * PXPM;
  g += `<g transform="translate(${mx + 470},${my + mh - 50})">
    <rect x="0" y="0" width="${sbW}" height="14" fill="${INK}"/>
    <rect x="0" y="0" width="${sbW / 2}" height="14" fill="${RED}"/>
    <text x="0" y="-14" font-family="Noto Sans SC" font-weight="300" font-size="30" fill="${INK}">0</text>
    <text x="${sbW}" y="-14" text-anchor="end" font-family="Noto Sans SC" font-weight="300" font-size="30" fill="${INK}">400 m</text>
  </g>`;
  g += `<g transform="translate(${mx + mw - 330},${my + mh - 96})">
    <line x1="0" y1="0" x2="0" y2="-78" stroke="${INK}" stroke-width="4"/>
    <path d="M 0 -92 L -13 -66 L 13 -66 Z" fill="${INK}"/>
    <text x="0" y="28" text-anchor="middle" font-family="Noto Sans SC" font-weight="300" font-size="30" fill="${INK}">北</text>
  </g>`;
  g += `</g>`;

  let s = header("02", S.kicker, S.en_kicker, D.work + " · " + D.subtitle);
  s += `<div class="h1" style="left:${M}px;top:290px">${esc(S.title)}</div>`;
  s += `<div class="lead" style="left:${M}px;top:520px;width:2100px">${esc(S.lead)}</div>`;
  s += `<div class="facts" style="left:${M + 2260}px;top:290px;width:${CW - 2260}px">${S.facts
    .map((f) => `<div class="fact">${esc(f)}</div>`)
    .join("")}</div>`;
  s += svgLayer(g);

  // 三条产品线
  const lTop = 3180;
  const lW = (CW - 120) / 3;
  S.lines.forEach((l, i) => {
    const x = M + i * (lW + 60);
    s += `<div class="linecard" style="left:${x}px;top:${lTop}px;width:${lW}px">
      <div class="lc-year">${esc(l.year)}</div>
      <div class="lc-name">${esc(l.name)}</div>
      <div class="lc-body">${esc(l.body)}</div>
      <div class="lc-acts">${(l.acts || []).map((a) => `<div class="lc-act">${esc(a)}</div>`).join("")}</div>
      <div class="lc-unit">${esc(l.unit)}</div>
    </div>`;
  });

  // 前提与风险
  const rTop = 3900;
  const rW = (CW - 80) / 3;
  (S.risks || []).forEach((r, i) => {
    s += `<div class="risk" style="left:${M + i * (rW + 40)}px;top:${rTop}px;width:${rW}px">
      <div class="rk-k">${esc(r.k)}</div><div class="rk-v">${esc(r.v)}</div></div>`;
  });

  // 应用件 + 分成
  const aTop = 4430;
  S.applications.forEach((a, i) => {
    const x = M + i * 600;
    s += `<div class="app" style="left:${x}px;top:${aTop}px;width:520px">
      <div class="app-n">${esc(a.name)}</div><div class="app-t">${esc(a.note)}</div></div>`;
  });
  s += `<div class="split" style="left:${M + 1900}px;top:${aTop - 30}px;width:${CW - 1900}px">
    ${S.split.map((p) => `<div class="sp"><div class="sp-v">${esc(p.pct)}</div><div class="sp-k">${esc(p.who)}</div></div>`).join("")}
  </div>`;
  s += `<div class="cap" style="left:${M + 1900}px;top:${aTop + 190}px">分成 · 按交易额</div>`;
  s += `<div class="src" style="left:${M}px;top:4780px;width:${CW}px">${esc(S.map_note)}</div>`;

  return {
    html: `<div class="page">${s}</div>`,
    checks: [
      { sel: ".h1", maxRight: W - M + 2, name: "标题不出右边界" },
      { sel: ".linecard", maxBottom: 4230, name: "三张卡片不压应用件" },
    ],
    tapeCheck: { realPx, expected: 800, tolerance: 0.02, note: "800 m 测线在图上应有 800×0.86 像素" },
  };
}

/* ---------------- 03 在地 ---------------- */
function plate03() {
  const L = D.land;
  let s = header("03", L.kicker, L.en_kicker, D.work + " · " + D.subtitle);
  s += `<div class="h1" style="left:${M}px;top:290px">${esc(L.title)}</div>`;
  s += `<div class="lead" style="left:${M}px;top:520px;width:2600px">${esc(L.lead)}</div>`;

  // 数据条
  const nTop = 730;
  const nW = CW / 5;
  L.numbers.forEach((n, i) => {
    const x = M + i * nW;
    s += `<div class="numcell" style="left:${x}px;top:${nTop}px;width:${nW - 40}px">
      <div class="nc-v">${esc(n.v)}<span class="nc-u">${esc(n.u)}</span></div>
      <div class="nc-k">${esc(n.k)}</div></div>`;
    if (i) s += `<div class="vline" style="left:${x - 20}px;top:${nTop + 8}px;height:150px"></div>`;
  });

  // 农户一天
  const dTop = 1030;
  s += `<div class="cap" style="left:${M}px;top:${dTop - 56}px">农户一天 · 从摘到账</div>`;
  const dLeft = M + 10;
  const dRight = M + CW - 10;
  s += `<div class="hair" style="left:${dLeft}px;top:${dTop + 172}px;width:${dRight - dLeft}px"></div>`;
  const dw = 300;
  L.day.forEach((d, i) => {
    const x = dLeft + ((dRight - dLeft) * i) / (L.day.length - 1);
    const left = i === 0 ? x : i === L.day.length - 1 ? x - dw : x - dw / 2;
    const align = i === 0 ? "left" : i === L.day.length - 1 ? "right" : "center";
    s += `<div class="tick" style="left:${x}px;top:${dTop + 160}px"></div>`;
    s += `<div class="dayt" style="left:${left}px;top:${dTop}px;width:${dw}px;text-align:${align}">
      <div class="dt-t">${esc(d.t)}</div>
      <div class="dt-w">${esc(d.what)}</div>
      <div class="dt-n">${esc(d.note)}</div>
    </div>`;
  });
  s += `<div class="src" style="left:${M}px;top:${dTop + 300}px;width:${CW - 200}px">${esc(L.day_source)}</div>`;

  // 东窑港
  const kTop = 1560;
  s += `<div class="kiln-text" style="left:${M}px;top:${kTop}px;width:1360px">
    <div class="k-head">${esc(L.kiln.head)}</div>
    <div class="k-body">${esc(L.kiln.body)}</div>
    <div class="k-quote">${esc(L.kiln.quote)}</div>
    <div class="k-src">${esc(L.kiln.source)}</div>
  </div>`;

  // 菜畦：一畦 1 m × 10 m，竖条
  const fx = M + 1500;
  const fW = CW - 1500;
  const rows = 2;
  const cols = 13;
  const gapX = 12;
  const gapY = 34;
  const cellW = (fW - (cols - 1) * gapX) / cols;
  const cellH = 420;
  const crops = ["齐心白", "红菜薹", "萝卜", "白菜薹"];
  const rnd = mulberry32(800);
  let fgSvg = "";
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = fx + c * (cellW + gapX);
      const y = kTop + 150 + r * (cellH + gapY);
      const p = rnd();
      const fill = p < 0.3 ? "#FFFFFF" : p < 0.62 ? GREEN : "#EADCDF";
      fgSvg += `<rect x="${x}" y="${y}" width="${cellW}" height="${cellH}" fill="${fill}" stroke="${INK}" stroke-width="2"/>`;
      // 垄沟：横向细线，一畦约十道
      for (let k = 1; k < 10; k++) {
        fgSvg += `<line x1="${x + 5}" y1="${y + (cellH * k) / 10}" x2="${x + cellW - 5}" y2="${y + (cellH * k) / 10}" stroke="${INK}" stroke-width="1.2" opacity="0.3"/>`;
      }
      if (rnd() < 0.16) {
        fgSvg += `<rect x="${x + cellW - 20}" y="${y + 16}" width="10" height="52" fill="${RED}"/>`;
      }
    }
  }
  // 尺寸线（1 m）
  const dimY = kTop + 96;
  fgSvg += `<line x1="${fx}" y1="${dimY}" x2="${fx + cellW}" y2="${dimY}" stroke="${INK}" stroke-width="2"/>`;
  fgSvg += `<line x1="${fx}" y1="${dimY - 10}" x2="${fx}" y2="${dimY + 10}" stroke="${INK}" stroke-width="2"/>`;
  fgSvg += `<line x1="${fx + cellW}" y1="${dimY - 10}" x2="${fx + cellW}" y2="${dimY + 10}" stroke="${INK}" stroke-width="2"/>`;
  fgSvg += `<text x="${fx + cellW + 14}" y="${dimY + 10}" font-family="Noto Sans SC" font-weight="300" font-size="28" fill="${INK}">1 m</text>`;
  // 尺寸线（10 m）
  const dimX = fx + fW - 4;
  fgSvg += `<line x1="${dimX}" y1="${kTop + 150}" x2="${dimX}" y2="${kTop + 150 + cellH}" stroke="${INK}" stroke-width="2"/>`;
  fgSvg += `<line x1="${dimX - 10}" y1="${kTop + 150}" x2="${dimX + 10}" y2="${kTop + 150}" stroke="${INK}" stroke-width="2"/>`;
  fgSvg += `<line x1="${dimX - 10}" y1="${kTop + 150 + cellH}" x2="${dimX + 10}" y2="${kTop + 150 + cellH}" stroke="${INK}" stroke-width="2"/>`;
  fgSvg += `<text x="${dimX + 16}" y="${kTop + 150 + cellH / 2}" font-family="Noto Sans SC" font-weight="300" font-size="28" fill="${INK}" transform="rotate(90 ${dimX + 16} ${kTop + 150 + cellH / 2})">10 m</text>`;
  s += svgLayer(fgSvg);
  s += `<div class="cap" style="left:${fx}px;top:${kTop + 40}px">一畦 = 1 m × 10 m · 图中 26 畦</div>`;
  s += `<div class="cap" style="left:${fx}px;top:${kTop + 150 + rows * (cellH + gapY) - 6}px">${esc(crops.join(" / "))} · 冬春主栽 · 红桩为米数标</div>`;

  // 成本表
  const cTop = 2740;
  s += `<div class="cap" style="left:${M}px;top:${cTop - 56}px">${esc(L.cost.head)}</div>`;
  s += `<div class="table" style="left:${M}px;top:${cTop}px;width:1400px">`;
  L.cost.rows.forEach((r, i) => {
    const bold = i >= 4;
    s += `<div class="tr${bold ? " tr-b" : ""}"><span>${esc(r[0])}</span><span class="tr-v">${esc(r[1])}</span></div>`;
  });
  s += `</div>`;
  s += `<div class="cost-note" style="left:${M}px;top:${cTop + L.cost.rows.length * 74 + 24}px;width:1400px">${esc(L.cost.note)}</div>`;

  // 米账
  s += `<div class="ledger" style="left:${M + 1500}px;top:${cTop - 56}px;width:${CW - 1500}px">
    <div class="lg-t">米账 · 一袋</div>
    ${D.brand.ledger.rows.map((r) => `<div class="lg-r"><span>${esc(r[0])}</span><span>${esc(r[1])}</span></div>`).join("")}
    <div class="lg-n">${esc(D.brand.ledger.note)}</div>
  </div>`;

  // 收束
  const qTop = 4020;
  s += `<div class="hair" style="left:${M}px;top:${qTop}px;width:${CW}px"></div>`;
  s += `<div class="pull" style="left:${M}px;top:${qTop + 60}px;width:${CW}px">把产地写进包装，把距离写进价格。</div>`;
  s += `<div class="pull-n" style="left:${M}px;top:${qTop + 230}px;width:1500px">八百米不是修辞。它是三兴片到看台的距离，是一袋菜的到柜时间，是农户能拿到的那七成。</div>`;
  s += `<div class="pull-n" style="left:${M + 1600}px;top:${qTop + 230}px;width:1400px">这套东西不新增设备：纸袋、冲孔机、一块认养牌。村集体有地，平台有单，社区有人——缺的只是一条能报出来的数。</div>`;

  s += `<div class="src" style="left:${M}px;top:4620px;width:${CW}px">${esc(L.ledger_note)}</div>`;
  return {
    html: `<div class="page">${s}</div>`,
    checks: [
      { sel: ".h1", maxRight: W - M + 2, name: "标题不出右边界" },
      { sel: ".dayt", maxRight: W - M + 4, name: "时间轴标签不出右边界" },
      { sel: ".table", maxBottom: 4000, name: "成本表不压收束句" },
    ],
  };
}

/* ---------------- 海报 ---------------- */
function poster() {
  const P = D.poster;
  const tX = M;
  const tW = 320;
  const tY = 420;
  const tH = 3720;
  let g = `<g>`;
  g += `<rect x="${tX}" y="${tY}" width="${tW}" height="${tH}" fill="${PAPER}" stroke="${INK}" stroke-width="6"/>`;
  for (let m = 0; m <= 800; m += 10) {
    const py = tY + (tH * m) / 800;
    const isMajor = m % 100 === 0;
    const mid = m % 50 === 0;
    const tw = isMajor ? tW : mid ? tW * 0.56 : tW * 0.26;
    g += `<line x1="${tX}" y1="${py}" x2="${tX + tw}" y2="${py}" stroke="${isMajor ? INK : RED}" stroke-width="${isMajor ? 7 : mid ? 4 : 2.6}"/>`;
    if (isMajor) {
      g += `<text x="${tX + tW + 24}" y="${py + 18}" font-family="Noto Sans SC" font-weight="500" font-size="48" fill="${INK}">${m}</text>`;
    }
  }
  const holeY = tY + tH;
  g += `<circle cx="${tX + tW / 2}" cy="${holeY}" r="52" fill="${PAPER}" stroke="${RED}" stroke-width="10"/>`;
  g += `<circle cx="${tX + tW / 2}" cy="${holeY}" r="20" fill="${INK}"/>`;
  g += `</g>`;
  let s = svgLayer(g);

  s += header("", "", "", "海报 · POSTER");
  s += `<div class="p-0" style="left:${tX}px;top:${tY - 180}px">0</div>`;
  s += `<div class="p-l" style="left:${tX + tW + 96}px;top:${tY - 158}px">看台</div>`;
  s += `<div class="p-l2" style="left:${tX + tW + 100}px;top:${tY - 70}px">6.5 万座 · 2028 年底竣工</div>`;

  s += `<div class="p-800" style="left:${tX}px;top:${holeY + 44}px">800</div>`;
  s += `<div class="p-l" style="left:${tX + 456}px;top:${holeY + 88}px">菜地</div>`;
  s += `<div class="p-l2" style="left:${tX + 460}px;top:${holeY + 196}px;font-size:32px;opacity:.85">17 个村民组 · 2850 人</div>`;

  const cx = tX + tW + 420;
  const cw = W - M - cx;
  s += `<div class="p-title" style="left:${cx}px;top:330px">${esc(P.title)}</div>`;
  s += `<div class="p-line" style="left:${cx + 6}px;top:820px;width:1500px">${esc(P.line)}</div>`;
  s += `<div class="p-hair" style="left:${cx}px;top:1010px;width:${cw}px"></div>`;

  // 四条要素：标签小、数值大，消费增收一项加重
  P.four.forEach((f, i) => {
    const y = 1070 + i * 250;
    const strong = f.k === "消费增收";
    s += `<div class="p-four" style="left:${cx}px;top:${y}px;width:${cw}px;border-top-color:${strong ? RED : INK}">
      <div class="pf-k" style="${strong ? "color:" + RED : ""}">${esc(f.k)}</div>
      <div class="pf-v" style="${strong ? "font-weight:500" : "font-weight:300"}">${esc(f.v)}</div></div>`;
  });

  // 产地实景（通栏，双色调）
  s += `<img class="p-photo" src="${pathToFileURL(path.join(ROOT, "assets", "hands-duo.jpg")).href}" style="left:${cx}px;top:2120px;width:${cw}px;height:900px">`;
  s += `<div class="p-cap" style="left:${cx}px;top:3046px;width:${cw}px">刚摘的一篮 · 示意：齐心白、红菜薹、白萝卜，带泥。三兴片 7 组清晨五点。底图为 AI 生成，非实地照片。</div>`;

  s += `<div class="p-claim" style="left:${cx}px;top:3140px;width:${cw}px">一袋一孔，孔即证据。</div>`;
  s += svgLayer(tape({ x: cx, y: 3300, w: cw, h: 100, hole: [148, 312, 684].map((m) => ({ m })), labels: true }));
  s += `<div class="p-cap" style="left:${cx}px;top:3240px;width:${cw}px">米数标 · 0 — 800 m</div>`;

  s += `<div class="p-years" style="left:${cx}px;top:3560px;width:${cw}px">
    <div class="py"><span>2027</span>工地团餐</div>
    <div class="py"><span>2028</span>社区订阅</div>
    <div class="py"><span>2029</span>看台篮</div>
  </div>`;

  s += `<div class="p-place" style="left:${cx}px;top:4000px;width:${cw}px">${esc(D.place)}</div>`;
  s += `<div class="p-place-en" style="left:${cx}px;top:4200px;width:${cw}px">SANXING · BINZHOU · TIANXIN · CHANGSHA</div>`;

  s += `<div class="p-foot" style="left:${M}px;top:${holeY + 400}px;width:${W - M * 2}px">设计提案 · 未与村集体签署协议 · 米数为实测方式示意</div>`;
  return {
    html: `<div class="page">${s}</div>`,
    checks: [
      { sel: ".p-title", maxRight: W - M + 2, name: "海报标题不出右边界" },
      { sel: ".p-foot", maxBottom: H - 60, name: "海报脚注在版内" },
      { sel: ".p-place", maxRight: W - M + 2, name: "产地行不出右边界" },
    ],
  };
}

/* ---------------- 公共样式 ---------------- */
const CSS = `
  @page{size:297mm 420mm;margin:0}
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{width:${W}px;height:${H}px}
  body{background:${PAPER};color:${INK};font-family:"Noto Sans SC",sans-serif;font-weight:300;-webkit-font-smoothing:antialiased}
  .page{position:relative;width:${W}px;height:${H}px;overflow:hidden}
  .hd{position:absolute;left:${M}px;top:170px;width:${CW}px;display:flex;justify-content:space-between;align-items:baseline;
      border-bottom:2px solid ${INK};padding-bottom:14px;font-size:26px;letter-spacing:.22em}
  .hd-l{display:flex;align-items:baseline;gap:26px}
  .hd .num{color:${RED};font-weight:500;letter-spacing:.1em}
  .hd .kick{font-weight:500;letter-spacing:.3em}
  .hd .en{font-size:21px;letter-spacing:.28em;opacity:.6}
  .hd-r{font-size:23px;letter-spacing:.16em;opacity:.75}

  .wordmark{position:absolute;font-family:"Noto Serif SC",serif;font-weight:600;font-size:360px;letter-spacing:.06em;line-height:1}
  .wm-en{position:absolute;font-size:44px;letter-spacing:.3em;color:${RED}}
  .wm-line{position:absolute;font-family:"Noto Serif SC",serif;font-weight:600;font-size:62px;letter-spacing:.04em}

  .note{position:absolute}
  .note-n{font-family:"Noto Serif SC",serif;font-weight:600;font-size:38px;color:${RED};margin-bottom:10px}
  .note-h{font-weight:500;font-size:36px;letter-spacing:.06em;margin-bottom:12px}
  .note-b{font-size:31px;line-height:1.72;text-align:justify;opacity:.9}

  .cap{position:absolute;font-size:27px;letter-spacing:.24em;opacity:.72}
  .cap-r{position:absolute;text-align:right;font-size:27px;letter-spacing:.18em;opacity:.72}
  .tier{position:absolute}
  .tier-l{font-family:"Noto Serif SC",serif;font-weight:600;font-size:44px;margin-right:18px}
  .tier-r{font-size:30px;letter-spacing:.06em}
  .tier-n{display:block;font-size:27px;opacity:.66;margin-top:6px;letter-spacing:.04em}

  .bag{position:absolute;border:3px solid ${INK};border-radius:10px;overflow:hidden}
  .bag-seal{position:absolute;left:0;top:0;width:100%;height:88px;border-bottom:2px solid ${INK};
    background:repeating-linear-gradient(90deg,transparent 0 14px,currentColor 14px 16px);opacity:.35}
  .bag-no{position:absolute;left:36px;top:104px;font-size:34px;letter-spacing:.2em}
  .bag-name{position:absolute;left:36px;top:150px;font-size:40px;letter-spacing:.1em}
  .bag-dist{position:absolute;left:32px;top:300px;font-family:"Noto Serif SC",serif;font-weight:600;font-size:230px;line-height:1;letter-spacing:-.02em}
  .bag-m{font-size:64px;letter-spacing:.06em;margin-left:8px}
  .bag-tape{position:absolute;left:0;top:0;width:100%}
  .bag-meta{position:absolute;left:36px;top:900px;font-size:32px;line-height:1.5;letter-spacing:.04em}
  .bag-code{position:absolute;left:36px;top:1080px;font-size:24px;letter-spacing:.14em;opacity:.7}

  .sw{position:absolute}
  .sw-c{height:150px;border:2px solid ${INK}}
  .sw-t{font-size:30px;margin-top:12px;letter-spacing:.1em}
  .sw-h{font-size:24px;opacity:.62;letter-spacing:.1em;margin-top:2px}
  .type-note{position:absolute;font-size:27px;line-height:1.8;opacity:.8}
  .wm-dot{margin:0 .34em;opacity:.55}
  .hole-tag{position:absolute;text-align:center;font-size:25px;letter-spacing:.14em;color:${RED}}
  .brk{position:absolute;height:0;border-top:5px solid;border-left:5px solid;border-right:5px solid}
  .bag-when{position:absolute;left:36px;top:580px;font-size:30px;letter-spacing:.1em}
  .bag-rule{position:absolute;left:36px;top:660px;width:250px;height:3px;opacity:.55}
  .bag-foot{position:absolute;left:36px;top:1190px;font-size:23px;letter-spacing:.14em;opacity:.55}
  .bm-1{font-size:36px}
  .bm-2{font-size:28px;opacity:.85;margin-top:8px}
  .bcol{position:absolute;border-top:4px solid ${INK};padding-top:20px}
  .bc-h{font-family:"Noto Serif SC",serif;font-weight:600;font-size:40px;margin-bottom:18px}
  .bc-b{font-size:27px;line-height:1.72;opacity:.85;margin-bottom:10px}
  .sw-t{font-size:27px;margin-top:10px;letter-spacing:.08em}
  .sw-h{display:block;font-size:21px;opacity:.55;margin-top:2px}

  .h1{position:absolute;font-family:"Noto Serif SC",serif;font-weight:600;font-size:150px;letter-spacing:.02em}
  .lead{position:absolute;font-size:38px;line-height:1.62;letter-spacing:.02em;opacity:.9}
  .facts{position:absolute;font-size:27px;line-height:1.72;opacity:.82}
  .fact{padding-left:26px;position:relative;margin-bottom:10px}
  .fact:before{content:"";position:absolute;left:0;top:18px;width:12px;height:2px;background:${RED}}

  .linecard{position:absolute;border-top:5px solid ${INK};padding-top:26px}
  .lc-year{font-family:"Noto Serif SC",serif;font-weight:600;font-size:96px;line-height:1;color:${RED}}
  .lc-name{font-family:"Noto Serif SC",serif;font-weight:600;font-size:60px;margin:14px 0 20px}
  .lc-body{font-size:30px;line-height:1.72;text-align:justify;opacity:.92}
  .lc-unit{margin-top:22px;font-size:29px;letter-spacing:.14em;color:${RED}}
  .risk{position:absolute;border-left:5px solid ${RED};padding-left:22px}
  .rk-k{font-size:26px;letter-spacing:.26em;color:${RED};margin-bottom:10px}
  .rk-v{font-size:26px;line-height:1.7;opacity:.85}
  .lc-acts{margin-top:22px;border-top:2px solid rgba(20,24,26,.22);padding-top:14px}
  .lc-act{font-size:26px;line-height:1.6;opacity:.78;padding-left:20px;position:relative;margin-bottom:6px}
  .lc-act:before{content:"";position:absolute;left:0;top:15px;width:9px;height:9px;background:${RED}}

  .app{position:absolute;border-left:3px solid ${INK};padding-left:20px}
  .app-n{font-family:"Noto Serif SC",serif;font-weight:600;font-size:42px;margin-bottom:8px}
  .app-t{font-size:26px;line-height:1.6;opacity:.78}
  .split{position:absolute;display:flex;gap:56px}
  .sp-v{font-family:"Noto Serif SC",serif;font-weight:600;font-size:76px;line-height:1}
  .sp-k{font-size:26px;letter-spacing:.12em;opacity:.75;margin-top:6px}

  .numcell{position:absolute}
  .nc-v{font-family:"Noto Serif SC",serif;font-weight:600;font-size:120px;line-height:1}
  .nc-u{font-size:40px;font-weight:300;margin-left:8px;letter-spacing:.04em}
  .nc-k{font-size:27px;letter-spacing:.1em;opacity:.72;margin-top:16px}
  .vline{position:absolute;width:2px;background:${INK};opacity:.25}
  .hair{position:absolute;height:2px;background:${INK};opacity:.5}
  .tick{position:absolute;width:3px;height:26px;background:${INK};transform:translateX(-1.5px)}
  .dayt{position:absolute}
  .dt-t{font-family:"Noto Serif SC",serif;font-weight:600;font-size:44px;color:${RED}}
  .dt-w{font-size:30px;font-weight:500;margin-top:6px;letter-spacing:.04em}
  .dt-n{font-size:24px;opacity:.7;margin-top:6px;line-height:1.5}
  .src{position:absolute;font-size:23px;line-height:1.65;opacity:.6;letter-spacing:.02em}

  .kiln-text{position:absolute}
  .k-head{font-family:"Noto Serif SC",serif;font-weight:600;font-size:64px;line-height:1.2}
  .k-body{font-size:31px;line-height:1.78;text-align:justify;margin-top:26px;opacity:.92}
  .k-quote{font-family:"Noto Serif SC",serif;font-weight:600;font-size:32px;line-height:1.62;margin-top:30px;padding-left:24px;border-left:5px solid ${RED}}
  .k-src{font-size:23px;opacity:.6;margin-top:14px}

  .table{position:absolute}
  .tr{display:flex;justify-content:space-between;align-items:baseline;border-bottom:2px solid rgba(20,24,26,.18);padding:16px 4px;font-size:31px}
  .tr-b{border-bottom-color:${INK};font-weight:500}
  .tr-v{font-family:"Noto Serif SC",serif;font-weight:600;font-size:36px}
  .cost-note{position:absolute;font-size:24px;line-height:1.62;opacity:.66}
  .ledger{position:absolute;border:3px solid ${INK};padding:34px 36px;background:#fff}
  .lg-t{font-family:"Noto Serif SC",serif;font-weight:600;font-size:52px;margin-bottom:20px}
  .lg-r{display:flex;justify-content:space-between;font-size:28px;padding:11px 0;border-bottom:1px solid rgba(20,24,26,.16)}
  .lg-n{font-size:23px;line-height:1.6;opacity:.68;margin-top:20px}

  .pull{position:absolute;font-family:"Noto Serif SC",serif;font-weight:600;font-size:104px;letter-spacing:.03em;line-height:1.3}
  .pull-n{position:absolute;font-size:29px;line-height:1.78;opacity:.84;text-align:justify}
  .p-0{position:absolute;font-family:"Noto Serif SC",serif;font-weight:600;font-size:120px;line-height:1;color:${RED}}
  .p-800{position:absolute;font-family:"Noto Serif SC",serif;font-weight:600;font-size:236px;line-height:1;color:${RED}}
  .p-l{position:absolute;font-family:"Noto Serif SC",serif;font-weight:600;font-size:64px;letter-spacing:.22em}
  .p-l2{position:absolute;font-size:27px;letter-spacing:.1em;opacity:.7}
  .p-title{position:absolute;font-family:"Noto Serif SC",serif;font-weight:600;font-size:340px;letter-spacing:.08em;line-height:1}
  .p-line{position:absolute;font-family:"Noto Serif SC",serif;font-weight:600;font-size:86px;line-height:1.45;letter-spacing:.03em}
  .p-hair{position:absolute;height:4px;background:${INK}}
  .p-photo{position:absolute;object-fit:cover;object-position:50% 46%;filter:contrast(1.02)}
  .p-four{position:absolute;border-top:2px solid ${INK};padding-top:20px}
  .pf-k{font-size:28px;letter-spacing:.3em;color:${RED};font-weight:500}
  .pf-v{font-size:42px;margin-top:10px;letter-spacing:.02em;line-height:1.35}
  .p-claim{position:absolute;font-family:"Noto Serif SC",serif;font-weight:600;font-size:82px;letter-spacing:.04em}
  .p-cap{position:absolute;font-size:24px;letter-spacing:.24em;opacity:.65}
  .p-years{position:absolute;display:flex;gap:0}
  .p-years .py{flex:1 1 0;font-size:27px;letter-spacing:.08em;border-top:2px solid ${INK};padding-top:16px}
  .p-years .py span{display:block;font-family:"Noto Serif SC",serif;font-weight:600;font-size:56px;color:${RED};margin-bottom:8px}
  .p-place{position:absolute;font-family:"Noto Serif SC",serif;font-weight:600;font-size:76px;line-height:1.36;letter-spacing:.04em}
  .p-place-en{position:absolute;font-size:24px;letter-spacing:.34em;opacity:.55}
  .p-foot{position:absolute;text-align:center;font-size:30px;letter-spacing:.28em;opacity:.7}
`;

function page(body) {
  const fontCss = pathToFileURL(path.join(ROOT, "assets", "fonts", "fonts.css")).href;
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
  <link rel="stylesheet" href="${fontCss}">
  <style>${CSS}</style></head><body>${body}</body></html>`;
}

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const base = path.join(process.env.LOCALAPPDATA || "", "ms-playwright");
  if (!fs.existsSync(base)) return undefined;
  for (const dir of fs.readdirSync(base)) {
    if (!dir.startsWith("chromium-")) continue;
    for (const rel of ["chrome-win64/chrome.exe", "chrome-win/chrome.exe"]) {
      const p = path.join(base, dir, rel);
      if (fs.existsSync(p)) return p;
    }
  }
  return undefined;
}

async function main() {
  const plates = variant
    ? [{ id: `poster-${variant}`, fn: variant === "B" ? posterB : posterC }]
    : [
        { id: "01", fn: plate01 },
        { id: "02", fn: plate02 },
        { id: "03", fn: plate03 },
        { id: "poster", fn: poster },
      ].filter((p) => !only || p.id === only);

  const browser = await chromium.launch({ executablePath: findChrome(), args: ["--force-color-profile=srgb", "--font-render-hinting=none"] });
  const pageObj = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  fs.mkdirSync(path.join(ROOT, "output"), { recursive: true });
  const fails = [];

  for (const p of plates) {
    const built = p.fn();
    const htmlPath = path.join(ROOT, ".tmp", `${p.id}.html`);
    fs.mkdirSync(path.dirname(htmlPath), { recursive: true });
    fs.writeFileSync(htmlPath, page(built.html), "utf8");
    await pageObj.goto(pathToFileURL(htmlPath).href, { waitUntil: "load" });
    await pageObj.evaluate(() => document.fonts.ready);
    await pageObj.waitForTimeout(400);

    // 字体真的加载了吗（没加载就静默回落，字全变而图照出）
    const fontOk = await pageObj.evaluate(() => {
      const faces = [...document.fonts].filter((f) => f.status === "loaded");
      const hasSerif = document.fonts.check('600 40px "Noto Serif SC"', "八百米三兴片");
      const hasSans = document.fonts.check('300 40px "Noto Sans SC"', "八百米三兴片0123456789");
      return { n: faces.length, hasSerif, hasSans };
    });
    if (!fontOk.hasSerif || !fontOk.hasSans || fontOk.n < 2) {
      fails.push(`${p.id}: 字体没加载（loaded=${fontOk.n} serif=${fontOk.hasSerif} sans=${fontOk.hasSans}）`);
    }

    // 版面断言
    for (const c of built.checks || []) {
      const box = await pageObj.evaluate((sel) => {
        const els = [...document.querySelectorAll(sel)];
        if (!els.length) return null;
        let right = 0;
        let bottom = 0;
        for (const el of els) {
          const r = el.getBoundingClientRect();
          right = Math.max(right, r.right);
          bottom = Math.max(bottom, r.bottom);
        }
        return { right, bottom };
      }, c.sel);
      if (!box) fails.push(`${p.id}: 找不到 ${c.sel}`);
      else {
        if (c.maxRight && box.right > c.maxRight) fails.push(`${p.id}/${c.name}: right=${box.right.toFixed(0)} > ${c.maxRight}`);
        if (c.maxBottom && box.bottom > c.maxBottom) fails.push(`${p.id}/${c.name}: bottom=${box.bottom.toFixed(0)} > ${c.maxBottom}`);
      }
    }

    // 皮尺与米数成比例
    if (built.tapeCheck) {
      const t = built.tapeCheck;
      const expect = t.expected * 0.86;
      const diff = Math.abs(t.realPx - expect) / expect;
      console.log(`  ${p.id} ${t.note}: ${t.realPx.toFixed(0)}px (期望 ${expect.toFixed(0)})`);
      if (diff > t.tolerance) fails.push(`${p.id}: ${t.note} 偏差 ${(diff * 100).toFixed(1)}% > ${t.tolerance * 100}%`);
    }

    // 内容不得溢出画布（滚动高度即判据）
    const size = await pageObj.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      sh: document.documentElement.scrollHeight,
    }));
    if (size.sw > W + 1 || size.sh > H + 1) fails.push(`${p.id}: 溢出画布 ${size.sw}×${size.sh}`);

    const dst = path.join(ROOT, "output", `${p.id}.png`);
    await pageObj.screenshot({ path: dst, clip: { x: 0, y: 0, width: W, height: H } });
    console.log(`  ${p.id} 出图 ${dst}`);
  }

  await browser.close();
  if (fails.length) {
    console.error("\n✗ 构建护栏未过：");
    for (const f of fails) console.error("  - " + f);
    process.exit(1);
  }
  console.log("\n✓ 全部护栏通过");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/* ---------------- 闸 D：海报的两个对照版 ---------------- */
function posterB() {
  // 版 B：标志主导——大号米字格在上，标题与四条要素依次向下，底部一条长皮尺压住
  const P = D.poster;
  let s = "";
  s += svgLayer(mark(M, 250, 1800, { tick: true }));
  s += header("", "", "", "海报 · POSTER");
  s += `<div class="p-title" style="left:${M}px;top:2320px;font-size:250px">${esc(P.title)}</div>`;
  s += `<div class="p-line" style="left:${M + 10}px;top:2690px;width:1500px;font-size:48px">${esc(P.line)}</div>`;
  P.four.forEach((f, i) => {
    const y = 2830 + i * 300;
    s += `<div class="p-four" style="left:${M}px;top:${y}px;width:${CW}px">
      <div class="pf-k">${esc(f.k)}</div><div class="pf-v" style="font-size:32px">${esc(f.v)}</div></div>`;
  });
  s += svgLayer(tape({ x: M, y: 4090, w: CW, h: 100, hole: [148, 312, 684].map((m) => ({ m })), labels: true }));
  s += `<div class="p-cap" style="left:${M}px;top:4030px">米数标 · 0 — 800 m · 一袋一孔</div>`;
  s += `<div class="p-place" style="left:${M}px;top:4290px;width:${CW}px;font-size:56px">${esc(D.place)}</div>`;
  s += `<div class="p-foot" style="left:${M}px;top:4520px;width:${CW}px">${esc(P.foot)}</div>`;
  return { html: `<div class="page">${s}</div>`, checks: [] };
}

function posterC() {
  // 版 C：产品主导——三款米袋并置，米数标横贯其下
  const P = D.poster;
  const bw = 880;
  const bh = 1560;
  const gap = (CW - bw * 3) / 2;
  let s = header("", "", "", "海报 · POSTER");
  s += `<div class="p-title" style="left:${M}px;top:250px;font-size:200px">${esc(P.title)}</div>`;
  s += `<div class="p-line" style="left:${M + 10}px;top:530px;width:1600px;font-size:42px">${esc(P.line)}</div>`;
  let fg = "";
  D.brand.bags.forEach((b, i) => {
    const x = M + i * (bw + gap);
    const y = 760;
    const bgc = b.tone === "purple" ? PURPLE : b.tone === "ink" ? INK : PAPER;
    const fg2 = b.tone === "paper" ? INK : PAPER;
    s += `<div class="bag" style="left:${x}px;top:${y}px;width:${bw}px;height:${bh}px;background:${bgc};border-color:${fg2}">
      <div class="bag-seal" style="border-color:${fg2}"></div>
      <div class="bag-no" style="color:${fg2}">${esc(b.no)}</div>
      <div class="bag-name" style="color:${fg2}">${esc(b.name)}</div>
      <div class="bag-dist" style="color:${fg2};font-size:210px">${esc(b.dist)}<span class="bag-m">m</span></div>
      <div class="bag-when" style="color:${b.tone === "paper" ? RED : PAPER};top:560px">${esc(b.when)}</div>
      <div class="bag-meta" style="color:${fg2};top:900px">
        <div class="bm-1">${esc(b.crop)}</div><div class="bm-2">${esc(b.group)} · ${esc(b.time)}</div></div>
      <div class="bag-code" style="color:${fg2};top:1420px">米账 · ${esc(b.no)}-${esc(b.group)}-${esc(b.dist)}</div>
    </div>`;
    fg += tape({ x: x + 70, y: y + 1130, w: bw - 140, h: 62, hole: [{ m: +b.dist }], labels: false, color: fg2, red: b.tone === "paper" ? RED : PAPER, bg: false, minor: 20 });
  });
  const fy = 2520;
  P.four.forEach((f, i) => {
    const x = M + (i % 2) * ((CW - 60) / 2 + 60);
    const y = fy + Math.floor(i / 2) * 290;
    s += `<div class="p-four" style="left:${x}px;top:${y}px;width:${(CW - 60) / 2}px">
      <div class="pf-k">${esc(f.k)}</div><div class="pf-v">${esc(f.v)}</div></div>`;
  });
  s += `<div class="p-claim" style="left:${M}px;top:3280px;font-size:60px">一袋一孔，孔即证据。</div>`;
  s += svgLayer(tape({ x: M, y: 3390, w: CW, h: 92, hole: [148, 312, 684].map((m) => ({ m })), labels: true }));
  s += `<div class="p-place" style="left:${M}px;top:3660px;width:${CW}px;font-size:56px">${esc(D.place)}</div>`;
  s += `<div class="p-years" style="left:${M}px;top:3900px;width:${CW}px">
    <div class="py"><span>2027</span>工地团餐</div>
    <div class="py"><span>2028</span>社区订阅</div>
    <div class="py"><span>2029</span>看台篮</div>
  </div>`;
  s += `<div class="p-foot" style="left:${M}px;top:4420px;width:${CW}px">${esc(P.foot)}</div>`;
  return { html: `<div class="page">${s}${svgLayer(fg)}</div>`, checks: [] };
}
