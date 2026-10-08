/* ================================================================
   生成《个人训练档案_v7.docx》
   正文来自 src/archive/content.js，数值来自 derive(《训练数据集.json》)，
   与网页版档案共用同一套内容、同一套派生计算和同一条图表编号规则。
   用法：npm run docx   （可选参数：数据集路径、输出路径）
   ================================================================ */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AlignmentType, BorderStyle, Bookmark, Document, Footer, Header, HeadingLevel,
  InternalHyperlink, LineRuleType, Packer, PageNumber, Paragraph, ShadingType,
  TableCell, TableRow, TextRun, VerticalAlign, WidthType,
} from "docx";
import {
  META, CHAPTERS as CHAPTER_DEFS, ABSTRACT, PROFILE, GEAR, PEAKS, RINGS, CHAIN, WORKOUT, PHASES, VOICES_NOTE,
  FUEL, METHOD, RULES, AHEAD, PLAN, APPX_B_NOTE, FILES, HISTORY_NOTE, HISTORY_DOCX,
} from "../src/archive/content.js";
import { parseHistory } from "../src/archive/history.js";
import { derive, md, mdZh, weekday, fmtDurEn, fmtDurZh, dayMs, pad2, CAT_LABEL } from "../src/archive/derive.js";
import { workoutStats, phaseBar, chartExtents, elPos as elPosFn, chaptersForDays, latestTrainingSummary, nutritionSummary } from "../src/archive/section-data.js";
import { dataStamp } from "../src/shared/stamp.js";
import { RELEASE } from "../src/shared/release.js";
import { lineChart, weeklyChart, setsChart, sleepChart } from "./svg-charts.mjs";
import { FONT, C, CAT, TAG_C, PAGE_W, MARGIN, SZ, tint } from "./docx/theme.js";
import { resetNumbering, makeCaptions, tableCount, figureCount } from "./docx/numbering.mjs";
import {
  tr, P, gap, num, dotD, cell, grid, table, card, eyebrow, src, note, lead, figure, legend, NONE, NO_BORDERS,
} from "./docx/primitives.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = resolve(ROOT, process.argv[2] || "data/训练数据集.json");
const OUT = resolve(ROOT, process.argv[3] || `release/${RELEASE.docx}`);
const DS = JSON.parse(readFileSync(DATA, "utf8"));
const APPX_B = JSON.parse(readFileSync(resolve(ROOT, "src/archive/appendix-b.json"), "utf8"));
const HIST = parseHistory(readFileSync(resolve(ROOT, "data/训练历史存档.md"), "utf8"));
const X = derive(DS), B = X.baseline, STAMP = dataStamp(DS);
const CHAPTERS = chaptersForDays(CHAPTER_DEFS, X.stats.days);
resetNumbering();
const { tcap, fcap } = makeCaptions(P, tr);
const fmtT = (s) => (s == null ? "—" : `${Math.floor(s / 60)}:${pad2(s % 60)}`);
const auto = (s) => (s?.line ? { ...s, lineRule: LineRuleType.AUTO } : s);

/* ---------------- 章节标题 ---------------- */
const chap = (id) => CHAPTERS.find((c) => c.id === id);
function chapter(id, intro) {
  const c = chap(id), numeric = /^\d+$/.test(c.no) && c.no !== "00";
  return [
    P([new Bookmark({ id: `ch_${c.id}`, children: [tr(c.no, { size: 120, bold: true, color: tint(C.violet, 0.22), font: { ascii: "Segoe UI Light", hAnsi: "Segoe UI Light", eastAsia: "Microsoft YaHei Light" } })] })],
      { pageBreakBefore: true, spacing: { before: 0, after: 0, line: 240 } }),
    P(tr(`${c.en.toUpperCase()} · ${c.from}`, { size: SZ.tiny, color: C.faint, characterSpacing: 40 }), { spacing: { before: 0, after: 60 } }),
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [...(numeric ? [tr(`第 ${c.no} 章  `, { size: 22, color: C.violet, bold: true })] : []), tr(c.zh)],
    }),
    P(tr(intro, { color: C.mut, size: 23 }), {
      spacing: { before: 0, after: 320 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: tint(C.violet, 0.35), space: 10 } },
    }),
  ];
}
const sub = (no, t) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [...(no ? [tr(`${no}  `, { color: C.violet })] : []), tr(t)] });

/* ================= 封面与目录 ================= */
function cover() {
  const s = X.stats;
  const stat = (v, u, subt, color) => cell([
    P(tr(v, { size: 52, bold: true, color }), { alignment: AlignmentType.CENTER, spacing: { after: 0 } }),
    P(tr(u, { size: 19, bold: true, color: C.ink }), { alignment: AlignmentType.CENTER, spacing: { after: 20 } }),
    P(tr(subt, { size: SZ.tiny, color: C.faint }), { alignment: AlignmentType.CENTER, spacing: { after: 0 } }),
  ], { fill: C.soft, pad: 200 });
  const st = [
    [s.days, "天", `连续记录 ${dotD(s.first)} → ${dotD(s.last)}`, C.cyan],
    [s.runDays, "个跑步日", `有距离记录 ${num(s.runKm, 1)} km（${s.runKmDays} 天）`, C.cyan],
    [s.strengthDays, "个力量日", `已记录容量 ${num(s.totalVol / 1000, 1)} t`, C.violet],
    [fmtDurEn(s.sleepAvg).replace(" h ", "h").replace(" min", ""), "平均睡眠", `华为 · n=${X.recs.filter((r) => r.dur != null).length}`, C.violet],
    [s.elN, "次 Elite 晨测", `参考期 n=${B.n} · 已锁定`, C.cyan],
    [X.voices.length, "段原话", "摘自当日记录", C.warm],
  ].map((a) => stat(...a));
  const spacer = () => new TableCell({ children: [P("")], width: { size: 120, type: WidthType.DXA }, borders: { top: NONE, bottom: NONE, left: NONE, right: NONE } });
  const statRow = (cs) => new TableRow({ children: [cs[0], spacer(), cs[1], spacer(), cs[2]] });
  const ctr = { alignment: AlignmentType.CENTER };
  return [
    gap(100),
    P(tr(`PERSONAL TRAINING ARCHIVE · ${META.version.toUpperCase()} · 观察截止 ${META.through.replace(/-/g, ".")}`, { size: SZ.tiny, color: C.faint, characterSpacing: 60 }), ctr),
    P(tr(META.subject, { size: 180, bold: true, color: C.violet }), { ...ctr, spacing: { before: 160, after: 0, line: 240 } }),
    P(tr(META.title, { size: 48, bold: true, color: C.ink, characterSpacing: 120 }), { ...ctr, spacing: { before: 120, after: 60 } }),
    P(tr(META.subtitle, { size: 22, color: C.mut, characterSpacing: 80 }), { ...ctr, spacing: { after: 240 } }),
    P([tr("——  ", { color: C.cyan }), tr(META.tagline, { size: 24, color: C.violet }), tr("  ——", { color: C.cyan })], { ...ctr, spacing: { after: 200 } }),
    grid([statRow(st.slice(0, 3)), new TableRow({ children: [cell("", { span: 5, pad: 40 })] }), statRow(st.slice(3))], [10, 0.4, 10, 0.4, 10]),
    gap(100),
    P(tr("本档案为单人纵向观察记录，只描述变化，不提供训练处方或医学诊断。", { size: SZ.tiny, color: C.faint }), { ...ctr, spacing: { after: 0, line: 220 } }),
    P(tr(`数据指纹 ${STAMP} · 与《${RELEASE.monitor}》《${RELEASE.archive}》读取同一份《训练数据集.json》`, { size: SZ.tiny, color: C.faint }), { ...ctr, spacing: { after: 0, line: 220 } }),
  ];
}
function contents() {
  const rows = CHAPTERS.map((c) => new TableRow({
    children: [
      cell(tr(c.no, { size: 32, bold: true, color: tint(C.violet, 0.55) }), { pad: 60 }),
      cell([
        P(new InternalHyperlink({ anchor: `ch_${c.id}`, children: [tr(c.zh, { size: 22, bold: true, color: C.ink })] }), { spacing: { after: 0, line: 260 } }),
        P(tr(c.en, { size: 14, color: C.faint, characterSpacing: 30 }), { spacing: { after: 0, line: 240 } }),
      ], { pad: 60 }),
      cell(tr(c.from, { size: SZ.small, color: C.mut }), { align: AlignmentType.RIGHT, pad: 60 }),
    ],
  }));
  const line = { style: BorderStyle.SINGLE, size: 4, color: C.line };
  return [
    P(tr("目录", { size: 40, bold: true }), { pageBreakBefore: true, spacing: { after: 0 } }),
    P(tr("CONTENTS · 章节编号与网页版一致", { size: SZ.tiny, color: C.faint, characterSpacing: 40 }), { spacing: { after: 280 } }),
    grid(rows, [1.4, 6, 3], { borders: { top: NONE, bottom: line, left: NONE, right: NONE, insideHorizontal: line, insideVertical: NONE } }),
    gap(240),
    P(tr("检索顺序 · How to read", { size: SZ.small, bold: true, color: C.violet }), { spacing: { after: 80 } }),
    ...ABSTRACT.route.map(([k, v]) => P([tr("›  ", { color: C.cyan, bold: true }), tr(`${k}：`, { color: C.mut, size: 19 }), tr(v, { bold: true, size: 19 })], { spacing: { after: 40 } })),
  ];
}

/* ================= 00 此刻 ================= */
function now() {
  const L = X.latest, dm = L.daily, ses = dm.sessions?.[0] || {}, wm = (dm.weight || []).find((w) => w.period === "morning");
  const training = latestTrainingSummary(L);
  const chips = [
    ses.squat_top_set && [`深蹲 ${ses.squat_top_set.kg} kg × ${ses.squat_top_set.reps}${ses.squat_assisted === false ? " · 独立完成" : ""}`, C.warm],
    wm && [`体重 ${wm.kg.toFixed(2)} kg · ${wm.time}`],
    [`睡眠 ${fmtDurEn(L.dur)}`],
    [`夜间 HRV ${L.hw} ms`],
    [nutritionSummary(L)],
    [L.el != null ? `Elite ${L.el} ms` : `Elite 缺测 · 最近 ${md(X.lastEl.d)} ${X.lastEl.el} ms`, C.faint],
  ].filter(Boolean);
  return [
    ...chapter("now", "先看最近的自己。"),
    card([
      eyebrow(`最新观察 · ${L.d.replace(/-/g, ".")} · ${weekday(L.d)}`, C.violet),
      P([tr(training.title, { size: 36, bold: true }), tr(`   ${training.runKm != null ? `${training.runKm.toFixed(2)} km / ` : ""}${fmtT(training.tsec)}`, { size: 36, color: C.cyan })], { spacing: { after: 120 } }),
      P(chips.flatMap(([t, c], i) => [...(i ? [tr("  ·  ", { color: C.faint, size: SZ.small })] : []), tr(t, { size: SZ.small, bold: !!c && c !== C.faint, color: c || C.ink })]), { spacing: { after: 140, line: 320 } }),
      P(tr(ABSTRACT.latest, { size: 20, color: C.mut }), { spacing: { after: 0, line: 340 } }),
    ], C.soft, C.violet),
    gap(240),
    grid([new TableRow({
      children: [
        cell([P(tr("摘要", { size: 26, bold: true, color: C.violet }), { spacing: { after: 0 } }), P(tr("Abstract", { size: SZ.tiny, color: C.faint }))], { v: VerticalAlign.TOP }),
        cell(P(tr(ABSTRACT.lead, { size: 21 }), { spacing: { after: 0, line: 360 } }), { v: VerticalAlign.TOP }),
      ],
    })], [1.5, 8.5], { borders: { top: { style: BorderStyle.SINGLE, size: 6, color: C.line }, bottom: { style: BorderStyle.SINGLE, size: 6, color: C.line }, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE } }),
  ];
}

/* ================= 01 我与装备 ================= */
function me() {
  const id = grid([new TableRow({
    children: PROFILE.id.map(([k, v]) => cell([
      P(tr(k, { size: SZ.tiny, color: C.faint }), { spacing: { after: 20 } }),
      P(tr(v, { size: 20, bold: true }), { spacing: { after: 0 } }),
    ], { fill: C.soft, pad: 140 })),
  })], [1, 1.3, 1.3, 2.6, 1.6]);
  return [
    ...chapter("me", "一个 22 岁、178 cm、正在备考的跑者，和陪他记录的几件设备。"),
    P([tr(META.subject, { size: 30, bold: true, color: C.violet }), tr(`   记录对象 · Subject · 档案 ${META.version} · 自 ${X.stats.first.replace(/-/g, ".")} 起`, { size: SZ.tiny, color: C.faint })], { spacing: { after: 120 } }),
    id,
    tcap(PROFILE.caption), table(PROFILE.head, PROFILE.rows, [2, 3.4, 4]),
    note(PROFILE.note),
    sub("", "装备与场景"),
    tcap(GEAR.caption), table(GEAR.head, GEAR.rows, [3, 3.4, 4], { keepTogether: true }),
  ];
}

/* ================= 02 高光坐标 ================= */
function peaks() {
  const R = PEAKS.race;
  const race = grid([new TableRow({
    children: [
      cell([
        eyebrow("2026.05.17 · 安顺", C.cyan),
        P(tr(R.title, { size: 24, bold: true }), { spacing: { after: 60 } }),
        P(tr("1:28:05", { size: 80, bold: true, color: C.cyan }), { spacing: { after: 40, line: 240 } }),
        P([tr("Sub-1:35 原目标", { strike: true, color: C.faint, size: SZ.small }), tr("  →  ", { color: C.faint }), tr("Sub-1:30 完成", { bold: true, color: C.violet, size: SZ.small })]),
      ], { fill: C.soft2, pad: 220, padX: 260, v: VerticalAlign.TOP }),
      cell([
        P(R.stats.flatMap(([k, v], i) => [...(i ? [tr("   ", {})] : []), tr(`${k} `, { size: SZ.tiny, color: C.faint }), tr(v, { size: 20, bold: true })]), { spacing: { after: 140, line: 320 } }),
        P(tr(R.text, { size: 19, color: C.mut }), { spacing: { after: 0, line: 330 } }),
      ], { fill: C.soft2, pad: 220, padX: 200, v: VerticalAlign.TOP }),
    ],
  })], [4, 6]);
  const cs = PEAKS.cards.filter((c) => !c.hero);
  const pk = (c) => c ? cell([
    P([tr(c.k, { size: SZ.small, color: C.mut, bold: true }), ...(c.fresh ? [tr("   ● 最新", { size: SZ.tiny, color: C.warm, bold: true })] : [])], { spacing: { after: 40 } }),
    P([tr(c.v, { size: 40, bold: true, color: c.fresh ? C.warm : C.violet }), tr(c.u ? ` ${c.u}` : "", { size: SZ.small, color: C.faint })], { spacing: { after: 20, line: 240 } }),
    P(tr(c.when, { size: SZ.tiny, color: C.faint }), { spacing: { after: 60 } }),
    P(tr(c.note, { size: SZ.small, color: C.mut }), { spacing: { after: 0, line: 300 } }),
  ], { fill: c.fresh ? C.warmSoft : C.soft, pad: 160, padX: 180, v: VerticalAlign.TOP }) : cell("");
  const sp = () => cell("", { padX: 0 });
  const rowOf = (a) => new TableRow({ children: [pk(a[0]), sp(), pk(a[1]), sp(), pk(a[2])] });
  return [
    ...chapter("peaks", "跑过的、蹲起来的，按能核实的口径摆在这里。"),
    race, gap(160),
    grid([rowOf(cs.slice(0, 3)), new TableRow({ children: [cell("", { span: 5, pad: 30 })] }), rowOf(cs.slice(3, 6))], [10, 0.35, 10, 0.35, 10]),
    tcap(PEAKS.caption), table(PEAKS.head, PEAKS.rows, [2.4, 3.6, 4.6]),
    note(PEAKS.foot),
  ];
}

/* ================= 03 70 天年轮 ================= */
function rings() {
  const flat = X.weeks.flat().filter(Boolean);
  const maxKm = Math.max(...flat.filter((c) => c.km).map((c) => c.km));
  const maxVol = Math.max(...flat.filter((c) => c.vol).map((c) => c.vol));
  const white = { style: BorderStyle.SINGLE, size: 18, color: "FFFFFF" };
  const box = { top: white, bottom: white, left: white, right: white };
  const dayCell = (c) => {
    if (!c) return cell("", { borders: box });
    if (c.cat === "gap") return cell(tr("·", { color: C.faint, size: SZ.tiny }), { align: AlignmentType.CENTER, borders: box, pad: 70 });
    const a = c.km ? 0.45 + 0.55 * (c.km / maxKm) : c.vol ? 0.45 + 0.55 * (c.vol / maxVol) : 0.55;
    const none = c.cat === "none";
    const fill = none ? "FFFFFF" : tint(CAT[c.cat], a);
    const b = none ? { ...box, top: { style: BorderStyle.SINGLE, size: 18, color: "FFFFFF" } } : box;
    return cell(tr(+c.d.slice(8), { size: SZ.small, bold: true, color: none ? C.faint : a > 0.62 ? "FFFFFF" : C.ink }),
      { fill: none ? tint("9AA0AE", 0.15) : fill, align: AlignmentType.CENTER, borders: b, pad: 70, padX: 40 });
  };
  const head = new TableRow({ children: [cell(""), ...["一", "二", "三", "四", "五", "六", "日"].map((w) => cell(tr(w, { size: SZ.tiny, color: C.mut, bold: true }), { align: AlignmentType.CENTER, pad: 40 }))] });
  const body = X.weeks.map((w) => new TableRow({
    cantSplit: true,
    children: [cell(tr(md(w.find(Boolean).d), { size: SZ.tiny, color: C.faint }), { pad: 70, padX: 60 }), ...w.map(dayCell)],
  }));
  const cal = grid([head, ...body], [1.3, 1, 1, 1, 1, 1, 1, 1]);
  const facts = grid([new TableRow({
    children: [
      ["最长一觉", fmtDurEn(X.stats.longestSleep.dur), `${mdZh(X.stats.longestSleep.d)} · 未听到闹钟`],
      ["单日最长跑量", `${X.stats.longestRun.km} km`, `${mdZh(X.stats.longestRun.d)} · 两段合计`],
      ["夜间 HRV 均值", `${num(X.stats.hwAvg, 1)} ms`, "华为口径 · 仅作本设备序列"],
    ].flatMap(([k, v, s], i) => [
      ...(i ? [cell("", { padX: 0 })] : []),
      cell([P(tr(k, { size: SZ.tiny, color: C.faint }), { spacing: { after: 20 } }), P(tr(v, { size: 32, bold: true, color: C.violet }), { spacing: { after: 20 } }), P(tr(s, { size: SZ.tiny, color: C.mut }), { spacing: { after: 0 } })], { fill: C.soft, pad: 160 }),
    ]),
  })], [10, 0.35, 10, 0.35, 10]);

  const { t0, t1, mon0 } = chartExtents(X.recs);
  const ex = new Set(B.excluded);
  const elSvg = lineChart({
    xMin: t0, xMax: t1, height: 250, logY: true, xStepDays: 14, xTick0: mon0,
    series: [{ values: X.series.el.map((p) => ({ ...p, flag: ex.has(p.d) })), line: true, points: true, lineW: 1.3 }],
    bands: [{ lo: B.band[0], hi: B.band[1] }],
    hlines: [{ y: B.outl[0], label: `${B.outl[0]}` }, { y: B.outl[1], label: `${B.outl[1]}` }],
    marks: X.series.el.filter((p) => !ex.has(p.d) && (p.y < B.outl[0] || p.y > B.outl[1])),
    refSpan: { t0: B.start, t1: B.end, label: "参考期 · 已锁定" },
    yTicks: [60, 70, 80, 90, 100, 110],
  });
  const hwSvg = lineChart({
    xMin: t0, xMax: t1, height: 190, xStepDays: 14, xTick0: mon0,
    series: [{ values: X.series.hw, line: true, points: true, color: "b", area: true }],
    yTicks: [70, 90, 110],
  });
  const calLegend = ["run", "str", "mix", "rest", "ball", "none"].map((k) => [k === "none" ? C.faint : CAT[k], CAT_LABEL[k], k === "none"]);
  return [
    ...chapter("rings", `把 ${X.stats.days} 天铺开：每一格是一天，每一种颜色是一种训练。`),
    fcap(`${X.stats.days} 天训练日历：每格一天，颜色为训练类型，亮度为当日跑量或力量容量`),
    cal, legend(calLegend),
    src("data.type、km、vol 与 _daily.day_totals / sessions；未报告训练不等于休息"),
    fcap("每周跑量（上）与力量容量（下），周一至周日"),
    figure(weeklyChart(X.weekly)),
    src("周跑量优先使用 _daily 全天合计；早期部分跑步日未记录距离，不补数"),
    gap(60), facts,
    fcap("Elite 晨起 RMSSD 全程：浅色竖带为参考期，横带为锁定常态带，虚线为离群线"),
    figure(elSvg),
    legend([[tint(C.violet, 0.35), `常态带 ${B.band.join("–")} ms`], [C.warm, `离群线 ${B.outl.join(" / ")} ms`], [C.violet, "单日晨测"], [C.violet, "排除日（不入基线）", true]]),
    src(`data.el（n=${X.stats.elN}）· 纵轴对数刻度 · ${RINGS.elGap}`),
    fcap("华为夜间 HRV 全程：设备整夜均值，与上图不同口径，不互相比较"),
    figure(hwSvg),
    src(`data.hw（n=${X.series.hw.length}）· 设备个人区间持续漂移，故不标注`),
  ];
}

/* ================= 04 最近 14 天 ================= */
const elPos = (v) => elPosFn(v, B);
function chain() {
  const head = ["日期", "睡眠", "夜间 HRV", "晨起 RMSSD", "记录字段对应训练", "事件"];
  const rows = X.chain.map((c) => [c.d, c.dur, c.hw, c.el, c.train, c]);
  const tbl = table(head, rows, [1.35, 1.45, 1, 1.15, 2.6, 3.2], {
    cellFn: (v, i, ri) => {
      const c = X.chain[ri];
      if (i === 0) return {
        runs: [P(tr(dotD(c.d), { bold: true, size: 20 }), { spacing: { after: 0 } }), P(tr(weekday(c.d), { size: SZ.tiny, color: C.faint }), { spacing: { after: 0 } })],
        borders: { left: { style: BorderStyle.SINGLE, size: 24, color: c.cat === "none" ? C.faint : CAT[c.cat] } },
      };
      if (i === 1) return { runs: tr(fmtDurEn(c.dur), { size: 19 }) };
      if (i === 2) return { runs: tr(c.hw ?? "—", { size: 20, bold: true }) };
      if (i === 3) {
        const p = elPos(c.el);
        return { runs: c.el != null ? tr(c.el.toFixed(2), { size: 20, bold: true, color: p === "out" ? C.warm : p === "edge" ? "C2771F" : C.ink }) : tr("缺测", { size: SZ.small, color: C.faint }) };
      }
      if (i === 4) return { runs: tr(c.train, { size: 19 }) };
      return { runs: [tr(c.tag ? `${c.tag}  ` : "", { size: SZ.tiny, bold: true, color: C.violet }), tr(c.note, { size: SZ.small, color: C.mut })] };
    },
  });
  const { ses, formalLabel, srcLine } = workoutStats(X.daily, WORKOUT);
  const wstats = [["时长", fmtT(ses.tsec)], ["正式组", formalLabel], ["容量", `${ses.vol} kg`], ["均心 / 峰值", `${ses.hr} / ${ses.hrmax}`], ["负荷", ses.load], ["活动 / 总热量", `${ses.active_kcal} / ${ses.total_kcal}`]];
  const ws = grid([new TableRow({
    children: wstats.map(([k, v]) => cell([P(tr(k, { size: SZ.tiny, color: C.faint }), { spacing: { after: 20 }, alignment: AlignmentType.CENTER }), P(tr(v, { size: 21, bold: true }), { spacing: { after: 0 }, alignment: AlignmentType.CENTER })], { fill: C.soft, pad: 120 })),
  })], [1, 1.2, 1, 1.1, 0.8, 1.3]);
  const phases = phaseBar(PHASES);
  const pcol = ["7C6CF2", "5B8CFF", "22B8D6", "34C79A", "E8833A"];
  const bar = grid([new TableRow({
    children: phases.map((p) => cell([
      P(tr(p.label, { size: SZ.tiny, bold: true, color: "FFFFFF" }), { spacing: { after: 0 } }),
      P(tr(`${md(p.a)}–${md(p.b)} · ${p.days} 天`, { size: 13, color: "FFFFFF" }), { spacing: { after: 0 } }),
    ], { fill: pcol[p.i], pad: 100, padX: 80, borders: { right: { style: BorderStyle.SINGLE, size: 12, color: "FFFFFF" } } })),
  })], phases.map((p) => p.flex));
  return [
    ...chapter("chain", "最近两周的睡眠、HRV 和训练，一天一行。"),
    lead(CHAIN.intro),
    tcap(CHAIN.caption), tbl,
    src("数值来自 data.dur / hw / el 与 _daily；训练描述与事件标签为档案整理"),
    note(`${CHAIN.foot}晨起 RMSSD 以暖色标出低于或高于锁定离群线（${B.outl.join(" / ")} ms）的读数；单位均为 ms。`),
    sub("4.1", "本次力量训练"),
    fcap(WORKOUT.figure),
    figure(setsChart(WORKOUT.sets), 600),
    ws,
    src(srcLine),
    tcap(WORKOUT.caption), table(WORKOUT.head, WORKOUT.rows, [2.4, 1.8, 4, 1]),
    note(WORKOUT.foot),
    sub("4.2", "较早阶段索引"),
    tcap(PHASES.caption), bar, gap(100),
    table(PHASES.head, PHASES.rows, [2.6, 4.4, 3.6]),
  ];
}

/* ================= 05 身体说的话 ================= */
function voices() {
  const vc = (v) => {
    if (!v) return cell("");
    const c = TAG_C[v.tag] || C.pink;
    return cell([
      P([tr(` ${v.tag} `, { size: SZ.tiny, bold: true, color: "FFFFFF", shading: { type: ShadingType.CLEAR, fill: c, color: "auto" } }), tr(`   ${dotD(v.d)} · ${weekday(v.d)}`, { size: SZ.tiny, color: C.faint })], { spacing: { after: 80 } }),
      P(tr(v.title, { size: 26, bold: true }), { spacing: { after: 80 } }),
      P(tr(v.q, { size: 19, color: C.mut }), { spacing: { after: 100, line: 330 }, border: { left: { style: BorderStyle.SINGLE, size: 12, color: c, space: 8 } }, indent: { left: 120 } }),
      P(tr(`❝ ${v.type || "—"} · ${v.src === "feel" ? "feel 字段原文" : "flag 原文摘录"}`, { size: 14, color: C.faint }), { spacing: { after: 0 } }),
    ], { fill: tint(c, 0.06), pad: 180, padX: 200, v: VerticalAlign.TOP });
  };
  const rows = [];
  for (let i = 0; i < X.voices.length; i += 2) {
    if (i) rows.push(new TableRow({ children: [cell("", { span: 3, pad: 30 })] }));
    rows.push(new TableRow({ cantSplit: true, children: [vc(X.voices[i]), cell("", { padX: 0 }), vc(X.voices[i + 1])] }));
  }
  const tags = [...new Set(X.voices.map((v) => v.tag))];
  return [
    ...chapter("voices", "那些写在数据旁边的话——笑场、流鼻血、想念南明河。"),
    P(tags.flatMap((t) => [tr(`■ ${t} `, { size: SZ.small, color: TAG_C[t] || C.pink, bold: true }), tr(`${X.voices.filter((v) => v.tag === t).length}    `, { size: SZ.tiny, color: C.faint })]), { spacing: { after: 160 } }),
    grid(rows, [10, 0.35, 10]),
    note(VOICES_NOTE, { spacing: { before: 200, after: 120 } }),
  ];
}

/* ================= 06 吃与睡 ================= */
function fuel() {
  const R = FUEL.recipe, M = FUEL.meals, nut = X.daily[M.date]?.nutrition;
  const recipe = card([
    eyebrow(FUEL.recipe.eyebrow, C.warm),
    P(tr(R.title, { size: 30, bold: true }), { spacing: { after: 100 } }),
    P(R.parts.flatMap((p, i) => [...(i ? [tr("  ＋  ", { color: C.violet, bold: true })] : []), tr(p, { size: 20, bold: true })]), { spacing: { after: 120 } }),
    P([tr(R.range.join("–"), { size: 56, bold: true, color: C.warm }), tr("  kcal / 整杯估计", { size: SZ.small, color: C.faint })], { spacing: { after: 100, line: 240 } }),
    P(tr(R.text, { size: 19, color: C.mut }), { spacing: { after: 0, line: 330 } }),
  ], C.warmSoft, C.warm);
  const maxK = 1600;
  const mealRows = [...M.rows.map((m) => [m.meal, m.what, m]), ["全天", M.total.what, null]];
  const meals = table(M.head, mealRows, [1, 4.6, 3], {
    cellFn: (v, i, ri) => {
      const total = ri === mealRows.length - 1;
      if (i === 2) {
        if (total) return { runs: tr(M.total.range, { size: 19, bold: true, color: C.violet }), fill: C.soft };
        if (!Number.isFinite(v.lo) || !Number.isFinite(v.hi)) return { runs: tr("未单独估算", { size: 19, color: C.mut }) };
        const m = v, filled = Math.round((m.hi / maxK) * 20), from = Math.round((m.lo / maxK) * 20);
        return { runs: [tr("━".repeat(from), { color: C.line, size: 14 }), tr("━".repeat(Math.max(1, filled - from)), { color: C.violet, size: 14, bold: true }), tr(`  ${m.lo}–${m.hi}`, { size: 19, bold: true })] };
      }
      if (total) return { runs: tr(v, { size: 19, bold: true }), fill: C.soft };
      return null;
    },
  });
  const wRows = X.weights.map((w) => [md(w.d).replace("/", "-"), w.time, w.kg.toFixed(2), w.bf != null ? w.bf.toFixed(1) : "缺测",
    w.period === "evening" ? "晚间，单独保留" : `上午，标准采集条件${w.confirmed ? "已确认" : "未确认"}`]);
  const w = X.weights;
  const { t0: wt0, t1: wt1 } = chartExtents(w);
  const wSvg = lineChart({
    xMin: wt0, xMax: wt1, height: 210, xStepDays: 2, xTick0: w[0].d,
    series: [
      { values: w.filter((x) => x.period === "morning").map((x) => ({ d: x.d, y: x.kg })), line: true, points: true, color: "a", lineW: 1.6 },
      { values: w.filter((x) => x.period === "evening").map((x) => ({ d: x.d, y: x.kg, flag: true })), line: false, points: true, color: "b" },
    ],
    yDomain: [59.8, 62.8], yTicks: [60, 60.5, 61, 61.5, 62, 62.5], yFmt: (v) => v.toFixed(1),
  });
  const sRows = X.sleep3.map((s) => {
    const other = s.light ?? s.dur - s.deep - s.rem, pc = (v) => `${((v / s.dur) * 100).toFixed(1)}%`;
    return [mdZh(s.d), fmtDurZh(s.dur), `${s.deep} 分 · ${pc(s.deep)}`, `${s.rem} 分 · ${pc(s.rem)}`, `${other} 分 · ${pc(other)}`, `${s.hw} ms / ${s.shr} bpm`];
  });
  return [
    ...chapter("fuel", "吃了什么、睡得怎样；估计值都带着误差范围。"),
    sub("6.1", "标签与实际配方"),
    recipe,
    tcap(FUEL.supps.caption), table(FUEL.supps.head, FUEL.supps.rows, [2.4, 3, 4.4]),
    sub("6.2", FUEL.meals.title),
    tcap(M.caption), meals,
    note(M.foot),
    ...(nut ? [src(`_daily.nutrition：kcal ${nut.kcal_range.join("–")} · 蛋白 ${nut.protein_range.join("–")} g · estimated=${nut.estimated}`)] : []),
    sub("6.3", "体重观察"),
    tcap(FUEL.weight.caption), table(["日期", "时间", "体重 (kg)", "体脂率 (%)", "测量条件"], wRows, [1.2, 1.1, 1.3, 1.3, 3.6]),
    note(FUEL.weight.note),
    fcap("上午体重（实心）与晚间读数（空心），晚间不入 7 日均值"),
    figure(wSvg),
    legend([[C.violet, "上午体重"], [C.cyan, "晚间读数", true]]),
    src("_daily.weight"),
    note(FUEL.weight.foot),
    sub("6.4", "睡眠观察"),
    tcap(FUEL.sleep.caption),
    figure(sleepChart(X.sleep3, (n) => `${mdZh(n.d)} · ${fmtDurEn(n.dur)}`), 600),
    table(["日期", "总时长", "深睡", "REM", "浅睡", "HRV / 睡眠心率"], sRows, [1.4, 1.7, 1.6, 1.5, 1.6, 2], { keepTogether: true }),
    src("data.dur / hw / shr 与 _daily.sleep（deep_min、rem_min、light_min）"),
    note(FUEL.sleep.foot),
  ];
}

/* ================= 07 测量方法 ================= */
function method() {
  const S = METHOD, c = B.check;
  const ok = c.n === B.n && Math.abs(c.mean - B.mean) < 5e-5 && Math.abs(c.sd - B.sd) < 5e-5;
  const bs = grid([new TableRow({
    children: [
      ["窗口", `${md(B.start)} – ${md(B.end)}`, "闭区间，锁定后不延展"],
      ["样本", `n = ${B.n}`, `排除 ${B.excluded.map(md).join("、")}`],
      ["lnRMSSD", `μ ${B.mean} · σ ${B.sd}`, "样本标准差"],
      ["常态带 / 离群线", `${B.band.join("–")}`, `离群线 ${B.outl.join(" / ")} ms`],
    ].flatMap(([k, v, s], i) => [
      ...(i ? [cell("", { padX: 0 })] : []),
      cell([P(tr(k, { size: SZ.tiny, color: C.faint }), { spacing: { after: 20 } }), P(tr(v, { size: 23, bold: true, color: C.violet }), { spacing: { after: 20 } }), P(tr(s, { size: 14, color: C.mut }), { spacing: { after: 0 } })], { fill: C.soft, pad: 140, padX: 140 }),
    ]),
  })], [10, 0.3, 10, 0.3, 12, 0.3, 11]);
  const refSvg = lineChart({
    xMin: dayMs(B.start) - 432e5, xMax: dayMs(B.end) + 432e5, height: 220, logY: true, xStepDays: 2, xTick0: B.start,
    series: [{ values: X.refSamples.map((s) => ({ d: s.d, y: s.el, flag: s.excluded })), points: true }],
    bands: [{ lo: B.band[0], hi: B.band[1] }],
    hlines: [{ y: B.outl[0], label: `${B.outl[0]}` }, { y: B.outl[1], label: `${B.outl[1]}` }],
    yTicks: [60, 70, 80, 90, 100],
  });
  return [
    ...chapter("method", "数字之所以可信，是因为口径先说清楚了。"),
    sub("7.1", S.s1.title.replace(/^7\.1 /, "")),
    lead(S.s1.text),
    tcap(S.s1.caption), table(S.s1.head, S.s1.rows, [2.6, 2.8, 4.6]),
    sub("7.2", S.s2.title.replace(/^7\.2 /, "")),
    bs, gap(120),
    ...S.s2.text.map((t) => P(tr(t, { size: 21 }), { spacing: { before: 40, after: 100, line: 340 } })),
    fcap(S.s2.figCaption),
    figure(refSvg),
    legend([[tint(C.violet, 0.35), "常态带"], [C.warm, "离群线"], [C.violet, "纳入样本"], [C.violet, "排除日", true]]),
    P([tr(ok ? "✓ " : "! ", { bold: true, color: ok ? C.mint : C.warm }), tr(`生成本文件时按原始 el 值复算：n=${c.n} · μ=${c.mean.toFixed(4)} · σ=${c.sd.toFixed(4)} — ${ok ? "与锁定值一致" : "与锁定值不一致，请核对数据集"}`, { size: SZ.small, color: ok ? "1E7F62" : C.warm })],
      { spacing: { before: 80, after: 60 }, shading: { type: ShadingType.CLEAR, fill: ok ? "EAF8F2" : C.warmSoft, color: "auto" } }),
    ...B.excluded.map((d) => note(`排除 ${mdZh(d)}：${B.reasons[d] || ""}`, { spacing: { before: 20, after: 20 } })),
    sub("7.3", S.s3.title.replace(/^7\.3 /, "")),
    ...S.s3.text.map((t) => P(tr(t, { size: 21 }), { spacing: { before: 40, after: 100, line: 340 } })),
  ];
}

/* ================= 08 原则与边界 ================= */
function rules() {
  const R = RULES;
  const pr = grid(R.principles.map(([t, p], i) => new TableRow({
    cantSplit: true,
    children: [
      cell(tr(pad2(i + 1), { size: 44, bold: true, color: tint(C.violet, 0.5) }), { v: VerticalAlign.TOP, pad: 120 }),
      cell([P(tr(t, { size: 24, bold: true }), { spacing: { after: 40 } }), P(tr(p, { size: 19, color: C.mut }), { spacing: { after: 0, line: 330 } })], { v: VerticalAlign.TOP, pad: 120 }),
    ],
  })), [1.1, 9], { borders: { ...NO_BORDERS, insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: C.line } } });
  return [
    ...chapter("rules", "记录者给自己立的规矩：什么能说，什么不能说。"),
    sub("8.1", "当前采用的记录原则"),
    pr,
    sub("8.2", "需要重新核实的旧解释"),
    tcap(R.review.caption),
    table(R.review.head, R.review.rows, [3.6, 3.4, 3.2], { cellFn: (v, i) => (i === 2 ? { runs: tr(v, { size: 19, color: C.violet, bold: true }) } : null) }),
    note(R.review.foot),
    sub("8.3", "症状事件索引"),
    card(R.symptoms.map((p, i) => P(tr(p, { size: 19, color: C.mut }), { spacing: { after: i === R.symptoms.length - 1 ? 0 : 120, line: 330 } })), C.gray),
  ];
}

/* ================= 09 远方 ================= */
function ahead() {
  const goal = (eb, big, bigC, bigSz, label, text, fill) => cell([
    eyebrow(eb, bigC),
    P(tr(big, { size: bigSz, bold: true, color: bigC }), { spacing: { after: 40, line: 240 } }),
    P(tr(label, { size: 20, bold: true }), { spacing: { after: 100 } }),
    P(tr(text, { size: 19, color: C.mut }), { spacing: { after: 0, line: 330 } }),
  ], { fill, pad: 220, padX: 240, v: VerticalAlign.TOP });
  return [
    ...chapter("ahead", "当前主线只有一条：2026 年 12 月的考试。"),
    grid([new TableRow({
      children: [
        goal("当前主线", "2026.12", C.cyan, 72, "北京大学体育硕士 346", AHEAD.goals[0], C.soft2),
        cell("", { padX: 0 }),
        goal("远期意向", "考研之后", C.violet, 52, "5 km / 10 km · 力量 · 体重", AHEAD.goals[1], C.soft),
      ],
    })], [10, 0.35, 10]),
    sub("9.1", "记录边界与查阅方法"),
    P(["训练数据集.json", "训练监测系统 HTML", "个人训练档案"].flatMap((t, i) => [
      ...(i ? [tr("   →   ", { color: C.faint, bold: true })] : []),
      tr(`${pad2(i + 1)} `, { color: C.violet, bold: true, size: SZ.small }), tr(t, { bold: true, size: 20 }),
    ]), { spacing: { before: 60, after: 200 }, alignment: AlignmentType.CENTER }),
    ...AHEAD.boundary.map(lead),
  ];
}

/* ================= 附录 ================= */
function appx() {
  const art = (a, i) => [
    new Paragraph({ heading: HeadingLevel.HEADING_3, children: [tr(`B.${i + 1}  `, { color: C.violet }), tr(a.title)] }),
    ...a.blocks.map((b) => b.kind === "lead"
      ? P(tr(b.text, { bold: true, size: 20, color: C.ink }), { spacing: { before: 140, after: 60 } })
      : b.kind === "item"
        ? P(tr(b.text, { size: 19 }), { indent: { left: 360 }, spacing: { after: 60, line: 330 } })
        : P(tr(b.text, { size: 19, color: C.mut }), { spacing: { after: 80, line: 330 } })),
  ];
  return [
    ...chapter("appx", "维持计划、文献核实原文、文件索引与冻结的历史存档。"),
    sub("A", "既有维持计划"),
    lead(PLAN.intro),
    ...PLAN.days.flatMap((d) => [
      tcap(d.caption),
      ...(d.note ? [P(tr(d.note, { size: SZ.small, bold: true, color: C.warm }), { spacing: { after: 80 } })] : []),
      table(PLAN.head, d.rows, [3, 2.4, 5]),
    ]),
    sub("B", "文献核实留档"),
    card([APPX_B_NOTE, ...APPX_B.intro.slice(1).map((b) => b.text)].map((t, i, a) => P(tr(t, { size: 19, color: C.mut }), { spacing: { after: i === a.length - 1 ? 0 : 100, line: 330 } })), C.gray),
    ...APPX_B.articles.flatMap(art),
    sub("C", "数据接口与文件索引"),
    tcap(FILES.caption), table(FILES.head, FILES.rows, [3.4, 6.6]),
    note(FILES.foot),
    sub("D", "训练历史存档"),
    card([
      P(tr(`冻结于 ${HIST.frozen || "—"} · 约 ${(HIST.stats.chars / 1e4).toFixed(1)} 万字 · ${HIST.stats.chapters} 章 ${HIST.stats.sections} 节 · ${HIST.stats.tables} 张原表`, { size: SZ.small, bold: true, color: C.violet }), { spacing: { after: 100 } }),
      P(tr(HISTORY_NOTE, { size: 19, color: C.mut }), { spacing: { after: 100, line: 330 } }),
      P(tr(HISTORY_DOCX, { size: 19, color: C.ink }), { spacing: { after: 0, line: 330 } }),
    ], C.gray),
    P(tr("存档章节：", { size: SZ.small, bold: true, color: C.mut }), { spacing: { before: 160, after: 60 } }),
    P(tr(HIST.toc.filter((c) => c.text).map((c) => c.text).join("　·　"), { size: SZ.small, color: C.mut }), { spacing: { after: 80, line: 330 } }),
  ];
}

function colophon() {
  const ctr = { alignment: AlignmentType.CENTER };
  return [
    gap(180),
    P(tr("◆", { color: tint(C.violet, 0.5), size: 28 }), ctr),
    P(tr(META.subject, { size: 44, bold: true, color: C.violet }), { ...ctr, spacing: { after: 20 } }),
    P(tr(`${META.title} · ${META.version}`, { size: SZ.small, color: C.mut, characterSpacing: 40 }), { ...ctr, spacing: { after: 160 } }),
    P(tr(`数据截止 ${META.through} · 数据指纹 ${STAMP} · 与《${RELEASE.monitor}》读取同一份《训练数据集.json》`, { size: SZ.tiny, color: C.faint }), { ...ctr, spacing: { after: 0, line: 220 } }),
    P(tr(`本档案只描述变化，不提供训练处方或医学诊断。共 ${tableCount()} 张表、${figureCount()} 幅图。`, { size: SZ.tiny, color: C.faint }), { ...ctr, spacing: { after: 0, line: 220 } }),
  ];
}

/* ================= 装配 ================= */
const body = [...cover(), ...contents(), ...now(), ...me(), ...peaks(), ...rings(), ...chain(), ...voices(), ...fuel(), ...method(), ...rules(), ...ahead(), ...appx()];
const tail = colophon();

const header = new Header({
  children: [P([tr(`${META.subject} · ${META.title}`, { size: SZ.tiny, color: C.faint, bold: true }), tr(`  ${META.version} · 观察截止 ${META.through.replace(/-/g, ".")}`, { size: SZ.tiny, color: C.faint })], {
    alignment: AlignmentType.RIGHT, border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: C.line, space: 4 } },
  })],
});
const footer = new Footer({
  children: [P([tr("— ", { color: C.faint, size: SZ.tiny }), new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: SZ.tiny, color: C.violet, bold: true }), tr(" —", { color: C.faint, size: SZ.tiny })], { alignment: AlignmentType.CENTER })],
});

const doc = new Document({
  creator: META.subject,
  title: `${META.title} ${META.version}`,
  description: `${META.subtitle} · 数据指纹 ${STAMP}`,
  styles: {
    default: {
      document: { run: { font: FONT, size: SZ.body, color: C.ink }, paragraph: { spacing: auto({ line: 360, after: 120 }) } },
    },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: FONT, size: 52, bold: true, color: C.ink }, paragraph: { spacing: auto({ before: 0, after: 80, line: 300 }), keepNext: true, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: FONT, size: 28, bold: true, color: C.ink }, paragraph: { spacing: auto({ before: 360, after: 140, line: 300 }), keepNext: true, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: FONT, size: 23, bold: true, color: C.ink }, paragraph: { spacing: auto({ before: 280, after: 100, line: 300 }), keepNext: true, outlineLevel: 2 } },
    ],
  },
  sections: [{
    properties: { titlePage: true, page: { size: { width: PAGE_W, height: 16838 }, margin: { top: 1300, bottom: 1200, left: MARGIN, right: MARGIN, header: 600, footer: 600 } } },
    headers: { default: header, first: new Header({ children: [P("")] }) },
    footers: { default: footer, first: new Footer({ children: [P("")] }) },
    children: [...body, ...tail],
  }],
});

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, await Packer.toBuffer(doc));
const ok = B.check.n === B.n && Math.abs(B.check.mean - B.mean) < 5e-5 && Math.abs(B.check.sd - B.sd) < 5e-5;
console.log(`✓ ${OUT.replace(ROOT + "/", "")}`);
console.log(`  表 ${tableCount()} · 图 ${figureCount()} · 引文 ${X.voices.length}${X.voiceMissing.length ? `（${X.voiceMissing.length} 条未在数据集中找到，已略去）` : ""} · 数据指纹 ${STAMP}`);
console.log(`  参考期复算 n=${B.check.n} μ=${B.check.mean.toFixed(4)} σ=${B.check.sd.toFixed(4)} — ${ok ? "与锁定值一致" : "不一致！"}`);
if (!ok) process.exitCode = 1;
