/**
 * 设计说明 → PDF（简章要求：word 或 pdf，≤5000 字，作品类型选「论文」）
 *
 * 用同一套字体、同一条 chromium 打印，避免「图是这套字，说明是另一套字」。
 * 缩略图由 to_jpg.py 先压好放 .tmp/thumbs/，这里 base64 内联。
 *
 * 用法：node scripts/statement.mjs
 * 产出：submission/设计说明.pdf
 */
import { chromium } from "playwright";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const md = fs.readFileSync(path.join(ROOT, "docs", "设计说明.md"), "utf8");

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

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const inline = (s) =>
  esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/`(.+?)`/g, "<code>$1</code>");

// 极简 md → html：标题、表格、列表、空行分段、加粗
const lines = md.split(/\r?\n/);
let body = "";
let title = "";
let inTable = false;
for (const raw of lines) {
  const line = raw.trim();
  if (!line) {
    if (inTable) {
      body += "</tbody></table>";
      inTable = false;
    }
    continue;
  }
  if (line.startsWith("# ")) {
    title = esc(line.slice(2));
  } else if (line.startsWith("### ")) {
    body += `<h3>${inline(line.slice(4))}</h3>`;
  } else if (line.startsWith("## ")) {
    body += `<h2>${inline(line.slice(3))}</h2>`;
  } else if (line.startsWith("|")) {
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (/^[-: ]+$/.test(cells.join(""))) continue;
    if (!inTable) {
      body += `<table><thead><tr>${cells.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>`;
      inTable = true;
    } else {
      body += `<tr>${cells.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`;
    }
  } else if (line.startsWith("- ")) {
    body += `<li>${inline(line.slice(2))}</li>`;
  } else if (line.startsWith("> ")) {
    body += `<blockquote>${inline(line.slice(2))}</blockquote>`;
  } else if (/^\d+\.\s/.test(line)) {
    body += `<li>${inline(line.replace(/^\d+\.\s/, ""))}</li>`;
  } else if (line === "---") {
    body += `<hr>`;
  } else {
    body += `<p>${inline(line)}</p>`;
  }
}
if (inTable) body += "</tbody></table>";

const thumbs = ["01", "02", "03", "poster"]
  .map((n) => {
    const f = path.join(ROOT, ".tmp", "thumbs", `${n}.jpg`);
    if (!fs.existsSync(f)) throw new Error(`缺缩略图 ${f}（先跑 to_jpg.py）`);
    return `<figure><img src="data:image/jpeg;base64,${fs.readFileSync(f).toString("base64")}"><figcaption>${n === "poster" ? "展示海报" : "图 " + n}</figcaption></figure>`;
  })
  .join("");

const fontCss = pathToFileURL(path.join(ROOT, "assets", "fonts", "fonts.css")).href;
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<link rel="stylesheet" href="${fontCss}">
<style>
  @page{size:A4;margin:20mm 19mm 18mm}
  *{box-sizing:border-box}
  body{font-family:"Noto Sans SC",sans-serif;font-weight:300;color:#14181A;font-size:10pt;line-height:1.85;margin:0}
  h1{font-family:"Noto Serif SC",serif;font-weight:600;font-size:24pt;letter-spacing:.1em;margin:0 0 3mm}
  h2{font-family:"Noto Serif SC",serif;font-weight:600;font-size:12.5pt;letter-spacing:.06em;margin:8mm 0 2.5mm;
     padding-bottom:1.5mm;border-bottom:.6pt solid #C8322A}
  h3{font-size:10.5pt;font-weight:500;margin:5mm 0 1.5mm}
  p{margin:0 0 1.6mm;text-align:justify}
  b{font-weight:500}
  code{font-family:"Noto Sans SC",sans-serif;font-size:9pt;background:#F4F1E8;padding:0 1mm}
  li{margin:0 0 1.2mm 0;margin-left:5mm}
  table{width:100%;border-collapse:collapse;margin:3mm 0 4mm;font-size:9pt}
  th,td{border-bottom:.5pt solid #cfc6b2;padding:1.6mm 2mm;text-align:left;vertical-align:top}
  th{font-weight:500;background:#F4F1E8}
  blockquote{margin:3mm 0;padding:2mm 0 2mm 4mm;border-left:1.4pt solid #C8322A;font-size:9pt;color:#444}
  hr{border:0;border-top:.5pt solid #cfc6b2;margin:6mm 0}
  .row{display:flex;gap:4mm;margin-top:5mm;flex-wrap:wrap}
  figure{margin:0;flex:1 1 22%;min-width:0}
  figure img{width:100%;display:block;border:.4pt solid #cfc6b2}
  figcaption{font-size:7.5pt;color:#666;margin-top:1.2mm;letter-spacing:.08em}
  .head{border-bottom:1.2pt solid #14181A;padding-bottom:3mm;margin-bottom:6mm}
  .place{font-size:9pt;color:#666;letter-spacing:.06em}
</style></head><body>
<div class="head"><h1>${title}</h1>
<div class="place">参赛类别：天心区滨洲新村乡村创新设计类（定向命题）｜产地：湖南省长沙市天心区南托街道滨洲新村三兴片</div></div>
${body}
<div class="row">${thumbs}</div>
</body></html>`;

fs.mkdirSync(path.join(ROOT, ".tmp"), { recursive: true });
fs.writeFileSync(path.join(ROOT, ".tmp", "statement.html"), html, "utf8");

const browser = await chromium.launch({ executablePath: findChrome() });
const page = await browser.newPage();
await page.goto(pathToFileURL(path.join(ROOT, ".tmp", "statement.html")).href, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);
const out = path.join(ROOT, "submission", "设计说明.pdf");
await page.pdf({ path: out, format: "A4", printBackground: true, margin: { top: "20mm", bottom: "18mm", left: "19mm", right: "19mm" } });
await browser.close();

const size = fs.statSync(out).size;
console.log(`设计说明.pdf  ${(size / 1024).toFixed(0)} KB`);
