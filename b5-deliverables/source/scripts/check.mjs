/* 更新前自检：npm run check [-- 数据集路径] */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { META, ABSTRACT, CHAIN, WORKOUT, FUEL, VOICES } from "../src/archive/content.js";
import { parseHistory } from "../src/archive/history.js";
import { dataStamp } from "../src/shared/stamp.js";
import { FIELDS, TEXT_FIELDS, isDate } from "../src/shared/schema.js";
import { validateDailyPayload } from "../src/shared/payload-validation.js";
import { validateDataset } from "../src/shared/validate-dataset.js";
import { RELEASE } from "../src/shared/release.js";
import { readDatasetFromHtml, datasetPayloadEqual } from "./dataset-from-html.mjs";
import { checkDownloadHtmlAt } from "./check-download.mjs";
import { RANGE } from "./ranges.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RELEASE_DIR = resolve(process.env.PHYSIO_RELEASE_DIR || resolve(ROOT, "release"));
const STAGING_RELEASE = Boolean(process.env.PHYSIO_RELEASE_DIR)
  && resolve(process.env.PHYSIO_RELEASE_DIR) !== resolve(ROOT, "release");
const args = process.argv.slice(2);
const CHECK_RELEASE = args.includes("--release");
const CHECK_PUBLISHED = args.includes("--published");
const DATA = resolve(ROOT, args.find((a) => !a.startsWith("--")) || "data/训练数据集.json");
const HISTORY = resolve(ROOT, "data/训练历史存档.md");
const MONITOR_HTML = resolve(RELEASE_DIR, RELEASE.monitor);
const ARCHIVE_HTML = resolve(RELEASE_DIR, RELEASE.archive);

const errors = [], warns = [];
const err = (layer, msg) => errors.push(`[${layer}] ${msg}`);
const warn = (layer, msg) => warns.push(`[${layer}] ${msg}`);
const list = (a, n = 6) => a.slice(0, n).join("、") + (a.length > n ? ` 等 ${a.length} 处` : "");

let ds;
try { ds = JSON.parse(readFileSync(DATA, "utf8")); }
catch (e) { console.error(`✗ 无法解析 ${DATA}\n  ${e.message}`); process.exit(1); }

if (!ds || typeof ds !== "object" || Array.isArray(ds)) { console.error("✗ 数据集根节点必须是对象"); process.exit(1); }
const structuralIssues = validateDataset(ds);
if (structuralIssues.length) {
  for (const issue of structuralIssues) console.error(`✗ [结构] ${issue}`);
  process.exit(1);
}
const data = Array.isArray(ds.data) ? ds.data : [];
if (!data.length) err("结构", "缺少 data 数组或为空");
if (JSON.stringify(ds._fields) !== JSON.stringify(FIELDS)) err("结构", `_fields 与 schema 不一致`);

const seen = new Set(), order = [], dup = [], badKeys = [], empties = [];
data.forEach((r, i) => {
  const at = r?.d || `第 ${i + 1} 行`;
  if (!isDate(r?.d)) { err("结构", `${at}：d 不是有效日期 YYYY-MM-DD`); return; }
  if (seen.has(r.d)) dup.push(r.d);
  seen.add(r.d); order.push(r.d);
  if (Object.keys(r).join() !== FIELDS.join()) badKeys.push(r.d);
  for (const k of FIELDS) if (r[k] === "" || r[k] === undefined) empties.push(`${r.d}.${k}`);
});
if (dup.length) err("结构", `日期重复：${list(dup)}`);
if (badKeys.length) err("结构", `字段名或顺序不一致：${list(badKeys)}`);
if (empties.length) err("结构", `空值必须写 null：${list(empties)}`);
if (order.some((d, i) => i && d < order[i - 1])) warn("结构", "data 未按日期升序排列");

for (const r of data) {
  if (!isDate(r?.d)) continue;
  for (const k of FIELDS.slice(1)) {
    const v = r[k];
    if (v === null || v === undefined || v === "") continue;
    if (k === "bed") { if (typeof v !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) err("格式", `${r.d}.bed 应为 HH:MM`); }
    else if (k === "pace") { if (typeof v !== "string" || !/^\d{1,2}:[0-5]\d$/.test(v)) err("格式", `${r.d}.pace 应为 m:ss`); }
    else if (k === "feel") { if (typeof v !== "number" && typeof v !== "string") err("格式", `${r.d}.feel 应为 1–5 或原话`); }
    else if (TEXT_FIELDS.has(k)) { if (typeof v !== "string") err("格式", `${r.d}.${k} 应为文本`); }
    else if (typeof v !== "number" || !Number.isFinite(v)) err("格式", `${r.d}.${k} 应为数字`);
  }
}

const RUN_ONLY = ["pace", "gct", "cad", "vo", "bal"];
const recent = new Set([...order].sort().slice(-14));
let olderHits = 0;
const flagIt = (d, layer, msg) => (recent.has(d) ? warn(layer, `${d} ${msg}`) : olderHits++);

for (const r of data) {
  if (!isDate(r?.d)) continue;
  for (const [k, [lo, hi]] of Object.entries(RANGE)) if (typeof r[k] === "number" && (r[k] < lo || r[k] > hi)) flagIt(r.d, "范围", `${k}=${r[k]} 超出 ${lo}–${hi}`);
  if (typeof r.feel === "number" && (r.feel < 1 || r.feel > 5)) flagIt(r.d, "范围", `feel=${r.feel}`);
  if (typeof r.hr === "number" && typeof r.hrmax === "number" && r.hrmax < r.hr) flagIt(r.d, "范围", "峰值心率低于均心率");
  if (typeof r.hrr0 === "number" && typeof r.hrr1 === "number" && r.hrr1 >= r.hrr0) flagIt(r.d, "范围", "HRR 一分钟末不低于起始");
  if (typeof r.deep === "number" && typeof r.rem === "number" && r.deep + r.rem > 100) flagIt(r.d, "范围", "deep+rem>100");
  const run = r.km != null;
  if (!run && RUN_ONLY.some((k) => r[k] != null)) flagIt(r.d, "归属", "非跑步日有跑姿字段");
  if (!run && r.shoe != null) flagIt(r.d, "归属", "非跑步日填了 shoe");
  if (run && r.vol != null && recent.has(r.d)) warn("归属", `${r.d} 同时有 km 与 vol（同日多课时请确认主课口径）`);
}
if (olderHits) warn("范围", `更早记录另有 ${olderHits} 处提醒，未逐条列出`);

const daily = ds._daily && typeof ds._daily === "object" && !Array.isArray(ds._daily) ? ds._daily : null;
if (ds._daily !== undefined && !daily) err("补充", "_daily 必须是对象");
for (const [d, v] of Object.entries(daily || {})) {
  if (!isDate(d)) err("补充", `_daily 键无效：${d}`);
  else if (!seen.has(d)) warn("补充", `_daily[${d}] 在 data 中无同日记录`);
  if (!v || typeof v !== "object" || Array.isArray(v)) err("补充", `_daily[${d}] 应为对象`);
}

if (daily) for (const issue of validateDailyPayload(daily)) err("补充", issue);

const last = order.length ? [...order].sort().at(-1) : null;
if (ds._meta?.data_through && ds._meta.data_through !== last) warn("元数据", `_meta.data_through=${ds._meta.data_through}，data 末行=${last}`);

const B = ds._baseline || {};
if (B.window_start !== "2026-08-08" || B.window_end !== "2026-08-23") warn("基线", `参考期已变更：${B.window_start}–${B.window_end}`);
{
  const ex = new Set(B.excluded || []);
  const ln = data.filter((r) => r && typeof r.el === "number" && r.d >= B.window_start && r.d <= B.window_end && !ex.has(r.d)).map((r) => Math.log(r.el));
  const mu = ln.reduce((a, b) => a + b, 0) / (ln.length || 1);
  const sd = ln.length > 1 ? Math.sqrt(ln.reduce((a, v) => a + (v - mu) ** 2, 0) / (ln.length - 1)) : NaN;
  const ok = ln.length === B.n && mu.toFixed(4) === Number(B.lnRMSSD_mean).toFixed(4) && sd.toFixed(4) === Number(B.lnRMSSD_sd).toFixed(4);
  if (!ok) err("基线", `复算 n=${ln.length} μ=${mu.toFixed(4)} σ=${sd.toFixed(4)} 与锁定值不一致`);
  else console.log(`✓ 参考期复算 n=${ln.length} μ=${mu.toFixed(4)} σ=${sd.toFixed(4)}`);
}

const byD = new Map(data.filter((r) => r && typeof r === "object").map((r) => [r.d, r]));
if (META.through !== last) warn("档案", `META.through=${META.through}，数据已到 ${last}`);
{
  const zhLast = last ? `${+last.slice(5, 7)}月${+last.slice(8, 10)}日` : "无有效日期";
  const m = ABSTRACT.latest.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (!m) warn("档案", "ABSTRACT.latest 未找到「M月D日」日期");
  else {
    const zhAbs = `${+m[1]}月${+m[2]}日`;
    if (zhAbs !== zhLast) warn("档案", `ABSTRACT.latest 写的是 ${zhAbs}，数据末行是 ${zhLast}`);
  }
}
const nutritionDays = Object.entries(daily || {}).filter(([,v]) => v?.nutrition).map(([d]) => d).sort();
if (nutritionDays.length && FUEL.meals.date !== nutritionDays.at(-1)) warn("档案", `FUEL.meals.date=${FUEL.meals.date}，最新营养记录=${nutritionDays.at(-1)}`);
const sleepDays = [...data].filter((r) => r?.dur != null).sort((a,b) => a.d.localeCompare(b.d)).slice(-3).map((r) => r.d);
if (JSON.stringify(FUEL.sleep.days) !== JSON.stringify(sleepDays)) warn("档案", "最新三夜日期未同步，请更新 FUEL.sleep.days 并运行 build");
const noChain = [...order].sort().slice(-14).filter((d) => !CHAIN.rows[d]);
if (noChain.length) warn("档案", `CHAIN.rows 缺：${list(noChain, 14)}`);
if (!daily?.[WORKOUT.date]?.sessions?.length) warn("档案", `WORKOUT.date=${WORKOUT.date} 无 sessions`);
if (!daily?.[FUEL.meals.date]?.nutrition) warn("档案", `FUEL.meals.date=${FUEL.meals.date} 无 nutrition`);
for (const v of VOICES.filter((v) => !v.snapshot && ((r) => { const s = r && (v.src === "feel" ? r.feel : r.flag); return typeof s !== "string" || !s.includes(v.q); })(byD.get(v.d)))) warn("引文", `${v.d}「${v.q.slice(0, 16)}…」已不是 ${v.src} 子串`);

if (CHECK_RELEASE && existsSync(MONITOR_HTML) && existsSync(ARCHIVE_HTML)) {
  try {
    const fromMonitor = readDatasetFromHtml(MONITOR_HTML);
    const fromArchive = readDatasetFromHtml(ARCHIVE_HTML);
    if (!datasetPayloadEqual(fromMonitor, fromArchive)) err("一致性", "release 两份 HTML 内嵌 data/_daily 不一致");
    if (!datasetPayloadEqual(fromMonitor, ds)) err("一致性", `${RELEASE.monitor} 与 ${DATA} 的 data/_daily 不一致`);
    if (!datasetPayloadEqual(fromArchive, ds)) err("一致性", `${RELEASE.archive} 与 ${DATA} 的 data/_daily 不一致`);
    else if (!errors.some((e) => e.startsWith("[一致性]"))) console.log("✓ 三处数据集 payload（data、_daily、_baseline、_fields、_meta）一致");
  } catch (e) {
    err("一致性", `无法解析 release HTML 内嵌数据集：${e.message}`);
  }
} else if (CHECK_RELEASE) err("一致性", "缺少 release HTML，请先构建，再执行 check:release");

if (!existsSync(HISTORY)) err("存档", "缺少 data/训练历史存档.md");
else {
  const H = parseHistory(readFileSync(HISTORY, "utf8"));
  if (!H.blocks.length) err("存档", "历史存档为空");
  else console.log(`✓ 历史存档 ${H.stats.chapters} 章 ${H.stats.sections} 节 · 冻结 ${H.frozen || "—"}`);
}

const stamp = dataStamp(ds);
const downloadMetaLine = `数据截止 ${last} · ${data.length} 天 · 指纹 ${stamp}`;

if (CHECK_RELEASE && !STAGING_RELEASE) {
  const dlOpts = { err, ok: (msg) => console.log(msg) };
  checkDownloadHtmlAt(resolve(ROOT, "download.html"), "download.html", downloadMetaLine, {
    required: true,
    ...dlOpts,
  });
  if (CHECK_PUBLISHED) {
    checkDownloadHtmlAt(resolve(ROOT, "download/download.html"), "download/download.html", downloadMetaLine, {
      required: true,
      ...dlOpts,
    });
  }
}

console.log(`✓ ${data.length} 天 · ${order[0]} 至 ${last} · 指纹 ${stamp}`);
for (const w of warns) console.log(`! ${w}`);
for (const e of errors) console.log(`✗ ${e}`);
if (errors.length) { console.log(`\n自检未通过：${errors.length} 错误${warns.length ? `、${warns.length} 提醒` : ""}`); process.exit(1); }
console.log(warns.length ? `\n自检通过，${warns.length} 条提醒待确认。` : "\n自检通过。");
