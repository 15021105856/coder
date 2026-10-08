import "../styles/harmony.css";
import "../styles/charts.css";
import "../styles/archive.css";
import { mountParticleField, mountParticleText, bindLight, initTheme, toggleTheme, readDataset } from "../shared/fx.js";
import { icon } from "../shared/icons.js";
import { dataStamp } from "../shared/stamp.js";
import { drawChart } from "../monitor/charts.js";
import {
  META, CHAPTERS as CHAPTER_DEFS, ABSTRACT, PROFILE, GEAR, PEAKS, RINGS, CHAIN, WORKOUT, PHASES, VOICES_NOTE,
  FUEL, METHOD, RULES, AHEAD, PLAN, APPX_B_NOTE, FILES, HISTORY_NOTE,
} from "./content.js";
import APPX_B from "./appendix-b.json";
import { derive, md, mdZh, weekday, fmtDurEn, fmtDurZh, fmtMinZh, dayMs, pad2, CAT_LABEL } from "./derive.js";
import { parseHistory, dayPattern, countMatches, mountHistoryReader } from "./history.js";
import { esc, tcap, fcap, src, table, section, resetNumbering, tableCount, figureCount } from "./html.js";
import { workoutStats, phaseBar, chartExtents, elPos as elPosFn, chaptersForDays, latestTrainingSummary, nutritionSummary } from "./section-data.js";
import { dotD } from "../shared/format.js";

import { getMonitorHref, getRelease } from "../shared/release-runtime.js";

const MONITOR_HREF = getMonitorHref();
const RELEASE = getRelease();
const DS = readDataset();
const X = derive(DS);
const CHAPTERS = chaptersForDays(CHAPTER_DEFS, X.stats.days);
const DATA_STAMP = dataStamp(DS);
const H = parseHistory(document.getElementById("history")?.textContent || "");
const H_TEXT = H.blocks.map((b) => b.text).join("\n");
const zhDay = (d) => `${+d.slice(5, 7)}月${+d.slice(8, 10)}日`;
const histSecFor = (d) => H.toc.flatMap((c) => c.secs).find((s) => s.text.startsWith(zhDay(d)))?.id || null;
const $ = (s, r = document) => r.querySelector(s);
const num = (v, d = 0) => (v == null ? "—" : (+v).toFixed(d));
const fmtT = (s) => (s == null ? "—" : `${Math.floor(s / 60)}:${pad2(s % 60)}`);
const B = X.baseline;
const elPos = (v) => elPosFn(v, B);
resetNumbering();

/* ================= 封面 ================= */
function cover() {
  const s = X.stats;
  const stat = (v, u, sub) => `<div class="cv-stat rv"><span class="num">${v}</span><b>${u}</b><small>${sub}</small></div>`;
  return `<section class="cover" id="cover">
    <div class="cv-eyebrow">PERSONAL TRAINING ARCHIVE · ${META.version} · 观察截止 ${META.through.replace(/-/g, ".")}</div>
    <h1 class="sr-only">${META.subject} · ${META.title}</h1>
    <canvas class="cv-name" id="cvName" aria-hidden="true"></canvas>
    <div class="cv-print" aria-hidden="true">${META.subject}</div>
    <div class="cv-title">${META.title}<span>${META.subtitle}</span></div>
    <p class="cv-tag">${META.tagline}</p>
    <div class="cv-stats">
      ${stat(s.days, "天", `连续记录 ${dotD(s.first)} → ${dotD(s.last)}`)}
      ${stat(s.runDays, "个跑步日", `有距离记录 ${num(s.runKm, 1)} km（${s.runKmDays} 天）`)}
      ${stat(s.strengthDays, "个力量日", `已记录容量 ${num(s.totalVol / 1000, 1)} t`)}
      ${stat(fmtDurEn(s.sleepAvg).replace(" h ", "h").replace(" min", ""), "平均睡眠", `华为 · n=${X.recs.filter((r) => r.dur != null).length}`)}
      ${stat(s.elN, "次 Elite 晨测", `参考期 n=${B.n} · 已锁定`)}
      ${stat(X.voices.length, "段原话", "摘自当日记录")}
    </div>
    <a class="cv-cue" href="#now"><span>进入档案</span>${icon("down")}</a>
  </section>`;
}

/* ================= 00 此刻 ================= */
function now() {
  const L = X.latest, dm = L.daily, ses = dm.sessions?.[0] || {}, wm = (dm.weight || []).find((w) => w.period === "morning");
  const training = latestTrainingSummary(L);
  const squat = ses.squat_top_set ? `深蹲 ${ses.squat_top_set.kg} kg × ${ses.squat_top_set.reps}${ses.squat_assisted === false ? " · 独立完成" : ""}` : null;
  const chips = [
    squat && ["dumbbell", squat, "hi"],
    wm && ["scale", `体重 ${wm.kg.toFixed(2)} kg · ${wm.time}`],
    ["moon", `睡眠 ${fmtDurEn(L.dur)}`],
    ["wave", `夜间 HRV ${L.hw} ms`],
    ["bowl", nutritionSummary(L)],
    ["heart", L.el != null ? `Elite ${L.el} ms` : `Elite 缺测 · 最近 ${md(X.lastEl.d)} ${X.lastEl.el} ms`, "mute"],
  ].filter(Boolean);
  const routeHref = { "此刻与第 04 章": "#chain", "第 07 章": "#method", "第 08 章": "#rules", "附录 B": "#appx-b", "附录 D": "#appx-d" };
  return section("now", `
    <div class="now-grid">
      <article class="now-card glass lit rv">
        <div class="eyebrow">最新观察 · ${L.d.replace(/-/g, ".")} · ${weekday(L.d)}</div>
        <div class="now-big">${esc(training.title)}<span class="num">${training.runKm != null ? `${training.runKm.toFixed(2)} km / ` : ""}${fmtT(training.tsec)}</span></div>
        <div class="chips">${chips.map(([ic, t, c]) => `<span class="chip-s ${c || ""}">${icon(ic, "ic-xs")}${esc(t)}</span>`).join("")}</div>
        <p>${ABSTRACT.latest}</p>
      </article>
      <aside class="route glass rv">
        <div class="eyebrow">检索顺序 · How to read</div>
        <ol>${ABSTRACT.route.map(([k, v]) => `<li><span>${k}</span>${routeHref[v] ? `<a href="${routeHref[v]}">${v}${icon("right", "ic-xs")}</a>` : `<em>${v}</em>`}</li>`).join("")}</ol>
      </aside>
    </div>
    <div class="abstract rv"><span class="ab-lb">摘要<small>Abstract</small></span><p>${ABSTRACT.lead}</p></div>`,
  "先看最近的自己。");
}

/* ================= 01 我与装备 ================= */
function me() {
  return section("me", `
    <div class="me-grid">
      <article class="idcard glass lit rv">
        <div class="id-top"><span class="id-orb">${META.subject}</span><div><div class="id-name">${META.subject}</div><div class="eyebrow">记录对象 · Subject</div></div></div>
        <dl>${PROFILE.id.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>
        <div class="id-foot"><span>档案 ${META.version}</span><span>自 ${X.stats.first.replace(/-/g, ".")} 起</span></div>
      </article>
      <figure class="fig rv">${tcap(PROFILE.caption)}${table(PROFILE.head, PROFILE.rows)}<p class="note">${PROFILE.note}</p></figure>
    </div>
    <h3 class="sub rv">装备与场景</h3>
    <figure class="fig rv">${tcap(GEAR.caption)}
      <div class="gear">${GEAR.rows.map((r, i) => `<div class="gear-c glass lit"><span class="g-ic">${icon(GEAR.icons[i])}</span><b>${r[0]}</b><p>${r[1]}</p><small>${r[2]}</small></div>`).join("")}</div>
    </figure>`,
  "一个 22 岁、178 cm、正在备考的跑者，和陪他记录的几件设备。");
}

/* ================= 02 高光坐标 ================= */
function peaks() {
  const R = PEAKS.race;
  return section("peaks", `
    <article class="race glass lit rv">
      <div class="race-l">
        <div class="eyebrow">${icon("trophy", "ic-xs")}2026.05.17 · 安顺</div>
        <h3>${R.title}</h3>
        <div class="race-time num">1:28:05</div>
        <div class="race-goal"><s>Sub-1:35 原目标</s>${icon("right", "ic-xs")}<b>Sub-1:30 完成</b></div>
      </div>
      <div class="race-r">
        <div class="race-stats">${R.stats.map(([k, v]) => `<div><small>${k}</small><b class="num">${v}</b></div>`).join("")}</div>
        <p>${R.text}</p>
      </div>
    </article>
    <div class="peaks">${PEAKS.cards.filter((c) => !c.hero).map((c) => `
      <article class="peak glass lit rv${c.fresh ? " fresh" : ""}">
        <div class="pk-top"><span>${c.k}</span>${c.fresh ? `<span class="pill"><span class="dot"></span>最新</span>` : ""}</div>
        <div class="pk-v num">${c.v}<small>${c.u}</small></div>
        <div class="pk-when">${c.when}</div>
        <p>${c.note}</p>
      </article>`).join("")}</div>
    <details class="raw rv"><summary>${icon("table", "ic-xs")}查看原表：表 ${tableCount() + 1} · ${PEAKS.caption}</summary>
      <figure class="fig">${tcap(PEAKS.caption)}${table(PEAKS.head, PEAKS.rows)}</figure></details>
    <p class="note rv">${PEAKS.foot}</p>`,
  "跑过的、蹲起来的，按能核实的口径摆在这里。");
}

/* ================= 03 训练年轮 ================= */
function rings() {
  const n = X.stats.days;
  const maxKm = Math.max(...X.weeks.flat().filter((c) => c && c.km).map((c) => c.km));
  const maxVol = Math.max(...X.weeks.flat().filter((c) => c && c.vol).map((c) => c.vol));
  const cell = (c) => {
    if (!c) return `<span class="cal-c empty"></span>`;
    if (c.cat === "gap") return `<span class="cal-c gap" title="${c.d} 无记录"></span>`;
    const a = c.km ? 0.45 + 0.55 * (c.km / maxKm) : c.vol ? 0.45 + 0.55 * (c.vol / maxVol) : 0.55;
    return `<button class="cal-c c-${c.cat}" style="--a:${a.toFixed(2)}" data-d="${c.d}" aria-label="${c.d} ${esc(c.type || "未报告")}"><span>${+c.d.slice(8)}</span></button>`;
  };
  const cal = `<div class="cal" id="cal">
    <div class="cal-row head"><span class="cal-wk"></span>${["一", "二", "三", "四", "五", "六", "日"].map((w) => `<span class="cal-h">${w}</span>`).join("")}</div>
    ${X.weeks.map((w) => `<div class="cal-row"><span class="cal-wk">${md(w.find(Boolean).d)}</span>${w.map(cell).join("")}</div>`).join("")}
  </div>`;
  const legend = ["run", "str", "mix", "rest", "ball", "none"].map((k) => `<span><i class="lg-c c-${k}"></i>${CAT_LABEL[k]}</span>`).join("");
  return section("rings", `
    <div class="rings-grid">
      <figure class="fig glass pad rv">${fcap(`${n} 天训练日历：每格一天，颜色为训练类型，亮度为当日跑量或力量容量`)}
        ${cal}
        <div class="legend">${legend}</div>
        <div class="cal-info" id="calInfo">点按任意一天查看当日读数</div>
        ${src("data.type、km、vol 与 _daily.day_totals / sessions；未报告训练不等于休息")}
      </figure>
      <div class="rings-side">
        <figure class="fig glass pad rv">${fcap("每周跑量（上）与力量容量（下），周一至周日")}
          <div class="wk-chart" id="wkChart"></div>
          ${src("周跑量优先使用 _daily 全天合计；早期部分跑步日未记录距离，不补数")}
        </figure>
        <div class="ring-facts rv">
          <div class="rf glass"><small>最长一觉</small><b class="num">${fmtDurEn(X.stats.longestSleep.dur)}</b><span>${mdZh(X.stats.longestSleep.d)} · 未听到闹钟</span></div>
          <div class="rf glass"><small>单日最长跑量</small><b class="num">${X.stats.longestRun.km} km</b><span>${mdZh(X.stats.longestRun.d)} · 两段合计</span></div>
          <div class="rf glass"><small>夜间 HRV 均值</small><b class="num">${num(X.stats.hwAvg, 1)} ms</b><span>华为口径 · 仅作本设备序列</span></div>
        </div>
      </div>
    </div>
    <figure class="fig glass pad rv" data-chart="el">${fcap("Elite 晨起 RMSSD 全程：浅色竖带为参考期，横带为锁定常态带，虚线为离群线")}
      <div class="p-body"></div><div class="chart-tip"></div>
      <div class="legend"><span><i class="lg-band"></i>常态带 ${B.band.join("–")} ms</span><span><i class="lg-dash"></i>离群线 ${B.outl.join(" / ")} ms</span><span><i class="lg-dot"></i>单日晨测</span><span><i class="lg-dot hollow"></i>排除日（不入基线）</span></div>
      ${src(`data.el（n=${X.stats.elN}）· 纵轴对数刻度 · ${RINGS.elGap}`)}
    </figure>
    <figure class="fig glass pad rv" data-chart="hw">${fcap("华为夜间 HRV 全程：设备整夜均值，与上图不同口径，不互相比较")}
      <div class="p-body"></div><div class="chart-tip"></div>
      ${src(`data.hw（n=${X.series.hw.length}）· 设备个人区间持续漂移，故不标注`)}
    </figure>`,
  `把 ${n} 天铺开：每一格是一天，每一种颜色是一种训练。`);
}
function weeklySvg() {
  const W = 720, H = 250, padL = 8, padR = 8, mid = 128, wk = X.weekly, n = wk.length;
  const bw = (W - padL - padR) / n, maxKm = Math.max(...wk.map((w) => w.km)) || 1, maxV = Math.max(...wk.map((w) => w.vol)) || 1;
  let s = `<svg viewBox="0 0 ${W} ${H}" class="chart wk" role="img" aria-label="每周跑量与力量容量"><defs>
    <linearGradient id="wkA" x1="0" x2="0" y1="0" y2="1"><stop offset="0" style="stop-color:var(--cyan)"/><stop offset="1" style="stop-color:var(--accent);stop-opacity:.6"/></linearGradient>
    <linearGradient id="wkB" x1="0" x2="0" y1="0" y2="1"><stop offset="0" style="stop-color:var(--accent-2);stop-opacity:.6"/><stop offset="1" style="stop-color:#ff7fc8"/></linearGradient></defs>`;
  s += `<line x1="${padL}" x2="${W - padR}" y1="${mid}" y2="${mid}" stroke="var(--faint)" stroke-opacity=".5"/>`;
  wk.forEach((w, i) => {
    const x = padL + i * bw + bw * 0.2, ww = bw * 0.6, hk = (w.km / maxKm) * 92, hv = (w.vol / maxV) * 78;
    s += `<rect class="bar" style="--i:${i}" x="${x}" y="${mid - 4 - hk}" width="${ww}" height="${Math.max(hk, 0)}" rx="5" fill="url(#wkA)"/>`;
    if (w.km) s += `<text x="${x + ww / 2}" y="${mid - 10 - hk}" text-anchor="middle" class="ax wk-v">${w.km.toFixed(1)}</text>`;
    s += `<rect class="bar down" style="--i:${i}" x="${x}" y="${mid + 4}" width="${ww}" height="${Math.max(hv, 0)}" rx="5" fill="url(#wkB)"/>`;
    if (w.vol) s += `<text x="${x + ww / 2}" y="${mid + 18 + hv}" text-anchor="middle" class="ax wk-v">${(w.vol / 1000).toFixed(1)}t</text>`;
    s += `<text x="${x + ww / 2}" y="${H - 2}" text-anchor="middle" class="ax">${md(w.start)}</text>`;
  });
  s += `<text x="${padL}" y="12" class="ax lb-ref">跑量 km</text><text x="${padL}" y="${H - 18}" class="ax" style="fill:var(--accent-2)">容量 t</text></svg>`;
  return s;
}

/* ================= 04 最近 14 天 ================= */
function chain() {
  const maxDur = 540;
  const rows = X.chain.map((c) => {
    const p = elPos(c.el);
    return `<li class="tl-row rv c-${c.cat}">
      <div class="tl-date"><b class="num">${dotD(c.d)}</b><span>${weekday(c.d)}</span></div>
      <div class="tl-sleep"><span class="tl-bar"><i style="width:${Math.min(100, (c.dur / maxDur) * 100).toFixed(1)}%"></i></span><span class="num">${fmtDurEn(c.dur)}</span></div>
      <div class="tl-hw"><small>夜间 HRV</small><b class="num">${c.hw ?? "—"}</b></div>
      <div class="tl-el ${p}"><small>晨起 RMSSD</small>${c.el != null ? `<b class="num">${c.el.toFixed(2)}</b>` : `<span class="miss">缺测</span>`}</div>
      <div class="tl-train"><i class="dot c-${c.cat}"></i><span>${esc(c.train)}</span></div>
      <div class="tl-ev">${c.tag ? `<span class="tag">${c.tag}</span>` : ""}<span>${esc(c.note)}</span></div>
    </li>`;
  }).join("");
  const { ses, maxKg, formalLabel, srcLine } = workoutStats(X.daily, WORKOUT);
  const setRows = WORKOUT.sets.map((ex) => {
    const reps = (i) => (Array.isArray(ex.reps) ? ex.reps[i] : ex.reps);
    const bars = [
      ...ex.warm.map((kg) => `<span class="set warm" style="--h:${(kg / maxKg) * 100}%"><i></i><b>${kg}</b><small>×8</small></span>`),
      ...ex.work.map((kg, i) => `<span class="set${ex.top && i === ex.work.length - 1 ? " top" : ""}" style="--h:${(kg / maxKg) * 100}%"><i></i><b>${kg}</b><small>×${reps(i)}</small></span>`),
    ].join("");
    return `<div class="ex"><div class="ex-name">${ex.name}</div><div class="sets">${bars}</div></div>`;
  }).join("");
  const wstats = [["时长", fmtT(ses.tsec)], ["正式组", formalLabel], ["容量", `${ses.vol} kg`], ["均心 / 峰值", `${ses.hr} / ${ses.hrmax}`], ["负荷", ses.load], ["活动 / 总热量", `${ses.active_kcal} / ${ses.total_kcal}`]];
  const phases = phaseBar(PHASES);
  const total = (dayMs(PHASES.spans.at(-1)[1]) - dayMs(PHASES.spans[0][0])) / 864e5 + 1;
  const phaseBarHtml = phases.map((p) => `<div class="ph p${p.i}${p.isLast ? " now" : ""}" style="flex:${p.flex}"><b>${p.label}</b><small>${md(p.a)}–${md(p.b)} · ${p.days} 天</small></div>`).join("");
  return section("chain", `
    <p class="lead rv">${CHAIN.intro}</p>
    <figure class="fig rv">${tcap(CHAIN.caption)}
      <div class="tl-head"><span>日期</span><span>睡眠时长</span><span>夜间 HRV (ms)</span><span>晨起 RMSSD (ms)</span><span>记录字段对应训练</span><span>事件</span></div>
      <ol class="tl">${rows}</ol>
      ${src("数值来自 data.dur / hw / el 与 _daily；训练描述与事件标签为档案整理")}
      <p class="note">${CHAIN.foot}晨起 RMSSD 以暖色标出低于或高于锁定离群线（${B.outl.join(" / ")} ms）的读数。</p>
    </figure>
    <h3 class="sub rv"><small>4.1</small>本次力量训练</h3>
    <figure class="fig workout glass pad rv">${fcap(WORKOUT.figure)}
      <div class="ex-list">${setRows}</div>
      <div class="w-stats">${wstats.map(([k, v]) => `<div><small>${k}</small><b class="num">${v}</b></div>`).join("")}</div>
      ${src(srcLine)}
    </figure>
    <details class="raw rv"><summary>${icon("table", "ic-xs")}查看原表：表 ${tableCount() + 1} · ${WORKOUT.caption}</summary>
      <figure class="fig">${tcap(WORKOUT.caption)}${table(WORKOUT.head, WORKOUT.rows)}</figure></details>
    <p class="note rv">${WORKOUT.foot}</p>
    <h3 class="sub rv"><small>4.2</small>较早阶段索引</h3>
    <figure class="fig rv">${tcap(PHASES.caption)}
      <div class="phase-bar" aria-label="共 ${total} 天">${phaseBarHtml}</div>
      <div class="phase-list">${PHASES.rows.map((r, i) => {
        const sec = histSecFor(PHASES.spans[i][0]);
        return `<div class="pl glass"><span class="pl-i p${i}"></span><div><b>${r[0]}</b><p>${r[1]}</p><small>${icon("archive", "ic-xs")}${r[2]}</small>${sec ? `<button class="hist-link" data-hist-sec="${sec}">${icon("history", "ic-xs")}在历史存档中打开</button>` : ""}</div></div>`;
      }).join("")}</div>
    </figure>`,
  "最近两周的睡眠、HRV 和训练，一天一行。");
}

/* ================= 05 身体说的话 ================= */
const TAG_KEY = { 跑步: "run", 力量: "str", 睡眠: "sleep", 饮食: "food", 测量: "meas", 生活: "life", 备考: "study" };
function voices() {
  const tags = [...new Set(X.voices.map((v) => v.tag))];
  const missingBlock = X.voiceMissing.length ? `
    <aside class="voice-miss glass warm rv" role="alert" aria-live="assertive">
      <div class="eyebrow">${icon("info", "ic-xs")}未匹配引文 · ${X.voiceMissing.length} 条</div>
      <p class="note">以下引文在数据集中找不到对应原文子串，已从正文隐藏。请核对 feel/flag 或改为 snapshot 快照。</p>
      <ul>${X.voiceMissing.map((v) => `<li><span class="num">${v.d}</span> · ${esc(v.title)} — <code>${esc(v.q.slice(0, 48))}${v.q.length > 48 ? "…" : ""}</code></li>`).join("")}</ul>
    </aside>` : "";
  return section("voices", `
    <div class="v-filter rv" role="tablist" aria-label="按主题筛选">
      <button class="chip on" data-tag="">全部 <small>${X.voices.length}</small></button>
      ${tags.map((t) => `<button class="chip" data-tag="${t}">${t} <small>${X.voices.filter((v) => v.tag === t).length}</small></button>`).join("")}
    </div>
    <div class="voices" id="voices">${X.voices.map((v) => `
      <article class="vc glass lit t-${TAG_KEY[v.tag] || "life"}" data-tag="${v.tag}">
        <div class="vc-top"><span class="vc-tag">${v.tag}</span><span class="vc-date num">${dotD(v.d)} · ${weekday(v.d)}</span></div>
        <h3>${v.title}</h3>
        <blockquote>${esc(v.q)}</blockquote>
        <div class="vc-src">${icon("quote", "ic-xs")}${esc(v.type || "—")} · ${v.snapshot ? "快照原文" : (v.src === "feel" ? "feel 字段原文" : "flag 原文摘录")}</div>
      </article>`).join("")}</div>
    ${missingBlock}
    <p class="note rv">${VOICES_NOTE}</p>`,
  "那些写在数据旁边的话——笑场、流鼻血、想念南明河。");
}

/* ================= 06 吃与睡 ================= */
function fuel() {
  const R = FUEL.recipe, M = FUEL.meals, maxK = 1600;
  const meals = M.rows.map((m) => `<tr><td class="k">${m.meal}</td><td>${m.what}</td><td class="rg">${Number.isFinite(m.lo) && Number.isFinite(m.hi) ? `<span class="rg-track"><i style="left:${(m.lo / maxK) * 100}%;width:${((m.hi - m.lo) / maxK) * 100}%"></i></span><span class="num">${m.lo}–${m.hi}</span>` : '<span>未单独估算</span>'}</td></tr>`).join("");
  const nut = X.daily[M.date]?.nutrition;
  const wRows = X.weights.map((w) => [md(w.d).replace("/", "-"), w.time, w.kg.toFixed(2), w.bf != null ? w.bf.toFixed(1) : "缺测",
    w.period === "evening" ? "晚间，单独保留" : `上午，标准采集条件${w.confirmed ? "已确认" : "未确认"}`]);
  const sl = X.sleep3.map((s) => {
    const other = s.light ?? (s.dur - s.deep - s.rem);
    const pc = (v) => ((v / s.dur) * 100).toFixed(1);
    return `<div class="sn">
      <div class="sn-d"><b>${mdZh(s.d)}</b><span class="num">${fmtDurZh(s.dur)}</span></div>
      <div class="sn-bar"><i class="deep" style="width:${pc(s.deep)}%"><span>深 ${fmtMinZh(s.deep)}</span></i><i class="rem" style="width:${pc(s.rem)}%"><span>REM ${fmtMinZh(s.rem)}</span></i><i class="light" style="width:${pc(other)}%"><span>浅 ${fmtMinZh(other)}</span></i></div>
      <div class="sn-v num">${s.hw} ms / ${s.shr} bpm</div></div>`;
  }).join("");
  return section("fuel", `
    <h3 class="sub rv"><small>6.1</small>标签与实际配方</h3>
    <div class="fuel-grid">
      <article class="recipe glass lit rv">
        <div class="eyebrow">${icon("bowl", "ic-xs")}${FUEL.recipe.eyebrow}</div>
        <h4>${R.title}</h4>
        <div class="rc-parts">${R.parts.map((p) => `<span>${p}</span>`).join("<i>＋</i>")}</div>
        <div class="rc-out"><span class="num">${R.range.join("–")}</span><small>kcal / 整杯估计</small></div>
        <p>${R.text}</p>
      </article>
      <figure class="fig rv">${tcap(FUEL.supps.caption)}${table(FUEL.supps.head, FUEL.supps.rows)}</figure>
    </div>
    <h3 class="sub rv"><small>6.2</small>${FUEL.meals.title}</h3>
    <figure class="fig rv">${tcap(M.caption)}
      <div class="tbl meals"><table><thead><tr>${M.head.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${meals}
        <tr class="total"><td class="k">全天</td><td>${M.total.what}</td><td class="rg"><span class="num">${M.total.range}</span></td></tr></tbody></table></div>
      <p class="note">${M.foot}</p>
      ${nut ? src(`_daily.nutrition：kcal ${nut.kcal_range.join("–")} · 蛋白 ${nut.protein_range.join("–")} g · estimated=${nut.estimated}`) : ""}
    </figure>
    <h3 class="sub rv"><small>6.3</small>体重观察</h3>
    <div class="w-grid">
      <figure class="fig rv">${tcap(FUEL.weight.caption)}${table(["日期", "时间", "体重 (kg)", "体脂率 (%)", "测量条件"], wRows, "weights")}
        <p class="note">${FUEL.weight.note}</p></figure>
      <figure class="fig glass pad rv" data-chart="weight">${fcap("上午体重（实心）与晚间读数（空心），晚间不入 7 日均值")}
        <div class="p-body"></div><div class="chart-tip"></div>${src("_daily.weight")}</figure>
    </div>
    <p class="note rv">${FUEL.weight.foot}</p>
    <h3 class="sub rv"><small>6.4</small>睡眠观察</h3>
    <figure class="fig glass pad rv">${tcap(FUEL.sleep.caption)}
      <div class="sn-head"><span>日期 · 总时长</span><span>深睡 / REM / 浅睡</span><span>HRV / 睡眠心率</span></div>
      <div class="sleep3">${sl}</div>
      ${src("data.dur / hw / shr 与 _daily.sleep（deep_min、rem_min、light_min）")}
    </figure>
    <p class="note rv">${FUEL.sleep.foot}</p>`,
  "吃了什么、睡得怎样；估计值都带着误差范围。");
}

/* ================= 07 测量方法 ================= */
function method() {
  const S = METHOD, c = B.check;
  const ok = c.n === B.n && Math.abs(c.mean - B.mean) < 5e-5 && Math.abs(c.sd - B.sd) < 5e-5;
  return section("method", `
    <h3 class="sub rv"><small>7.1</small>${S.s1.title.replace(/^7\.1 /, "")}</h3>
    <p class="lead rv">${S.s1.text}</p>
    <figure class="fig rv">${tcap(S.s1.caption)}${table(S.s1.head, S.s1.rows)}</figure>
    <h3 class="sub rv"><small>7.2</small>${S.s2.title.replace(/^7\.2 /, "")}</h3>
    <div class="base-stats rv">
      <div class="bs glass"><small>窗口</small><b class="num">${md(B.start)} – ${md(B.end)}</b><span>闭区间，锁定后不延展</span></div>
      <div class="bs glass"><small>样本</small><b class="num">n = ${B.n}</b><span>排除 ${B.excluded.map(md).join("、")}</span></div>
      <div class="bs glass"><small>lnRMSSD</small><b class="num">μ ${B.mean} · σ ${B.sd}</b><span>样本标准差</span></div>
      <div class="bs glass"><small>常态带 / 离群线</small><b class="num">${B.band.join("–")}</b><span>离群线 ${B.outl.join(" / ")} ms</span></div>
    </div>
    ${S.s2.text.map((t) => `<p class="lead rv">${t}</p>`).join("")}
    <figure class="fig glass pad rv" data-chart="ref">${fcap(S.s2.figCaption)}
      <div class="p-body"></div><div class="chart-tip"></div>
      <div class="legend"><span><i class="lg-band"></i>常态带</span><span><i class="lg-dash"></i>离群线</span><span><i class="lg-dot"></i>纳入样本</span><span><i class="lg-dot hollow"></i>排除日</span></div>
      <div class="verify ${ok ? "ok" : "bad"}">${icon(ok ? "check" : "info", "ic-xs")}页面打开时按原始 el 值复算：n=${c.n} · μ=${c.mean.toFixed(4)} · σ=${c.sd.toFixed(4)} — ${ok ? "与锁定值一致" : "与锁定值不一致，请核对数据集"}</div>
      ${B.excluded.map((d) => `<p class="note">排除 ${mdZh(d)}：${esc(B.reasons[d] || "")}</p>`).join("")}
    </figure>
    <h3 class="sub rv"><small>7.3</small>${S.s3.title.replace(/^7\.3 /, "")}</h3>
    ${S.s3.text.map((t) => `<p class="lead rv">${t}</p>`).join("")}`,
  "数字之所以可信，是因为口径先说清楚了。");
}

/* ================= 08 原则与边界 ================= */
function rules() {
  const R = RULES;
  return section("rules", `
    <h3 class="sub rv"><small>8.1</small>当前采用的记录原则</h3>
    <div class="principles">${R.principles.map(([t, p], i) => `<article class="pr glass lit rv"><span class="pr-n num">${pad2(i + 1)}</span><h4>${t}</h4><p>${p}</p></article>`).join("")}</div>
    <h3 class="sub rv"><small>8.2</small>需要重新核实的旧解释</h3>
    <figure class="fig rv">${tcap(R.review.caption)}${table(R.review.head, R.review.rows, "review")}<p class="note">${R.review.foot}</p></figure>
    <h3 class="sub rv"><small>8.3</small>症状事件索引</h3>
    <div class="quiet glass rv">${R.symptoms.map((p) => `<p>${p}</p>`).join("")}</div>`,
  "记录者给自己立的规矩：什么能说，什么不能说。");
}

/* ================= 09 远方 ================= */
function ahead() {
  return section("ahead", `
    <div class="ahead-grid">
      <article class="goal glass lit rv"><div class="eyebrow">${icon("target", "ic-xs")}当前主线</div><div class="goal-big">2026.12<span>北京大学体育硕士 346</span></div><p>${AHEAD.goals[0]}</p></article>
      <article class="goal far glass rv"><div class="eyebrow">${icon("leaf", "ic-xs")}远期意向</div><div class="goal-big sm">考研之后<span>5 km / 10 km · 力量 · 体重</span></div><p>${AHEAD.goals[1]}</p></article>
    </div>
    <h3 class="sub rv"><small>9.1</small>记录边界与查阅方法</h3>
    <div class="flow-line rv">${["训练数据集.json", "训练监测系统 HTML", "个人训练档案"].map((t, i) => `<span class="fl-n"><b>${pad2(i + 1)}</b>${t}</span>`).join(`<i>${icon("right", "ic-xs")}</i>`)}</div>
    ${AHEAD.boundary.map((p) => `<p class="lead rv">${p}</p>`).join("")}`,
  "当前主线只有一条：2026 年 12 月的考试。");
}

/* ================= 附录 ================= */
function appx() {
  const art = (a, i) => `<details class="lit-art glass"${i === 0 ? "" : ""}>
    <summary><span class="la-n">B.${i + 1}</span><span class="la-t">${esc(a.title)}</span><span class="note">${a.blocks.length} 段 · 原文保存</span></summary>
    <div class="la-body">${a.blocks.map((b) => b.kind === "lead" ? `<h5>${esc(b.text)}</h5>` : `<p class="${b.kind}">${esc(b.text)}</p>`).join("")}</div>
  </details>`;
  return section("appx", `
    <h3 class="sub rv" id="appx-a"><small>A</small>既有维持计划</h3>
    <p class="lead rv">${PLAN.intro}</p>
    <div class="plan-tabs rv" role="tablist">${PLAN.days.map((d, i) => `<button class="chip${i === 0 ? " on" : ""}" data-i="${i}" role="tab" aria-selected="${i === 0}">${d.name}</button>`).join("")}</div>
    <div class="plans">${PLAN.days.map((d, i) => `<figure class="fig plan${i === 0 ? " on" : ""}" data-i="${i}">${tcap(d.caption)}${d.note ? `<p class="note hi">${d.note}</p>` : ""}${table(PLAN.head, d.rows)}</figure>`).join("")}</div>
    <h3 class="sub rv" id="appx-b"><small>B</small>文献核实留档</h3>
    <div class="ref-intro rv"><p>${APPX_B_NOTE}</p>${APPX_B.intro.slice(1).map((b) => `<p>${esc(b.text)}</p>`).join("")}</div>
    <div class="lit-list rv">${APPX_B.articles.map(art).join("")}</div>
    <h3 class="sub rv" id="appx-c"><small>C</small>数据接口与文件索引</h3>
    <figure class="fig rv">${tcap(FILES.caption)}${table(FILES.head, FILES.rows)}<p class="note">${FILES.foot}</p></figure>
    <h3 class="sub rv" id="appx-d"><small>D</small>训练历史存档</h3>
    ${H.blocks.length ? `<article class="hist-card glass lit rv">
      <div class="hc-l">
        <div class="eyebrow">${icon("history", "ic-xs")}冻结于 ${H.frozen || "—"} · 原文内嵌</div>
        <div class="hc-stats">
          <div><b class="num">${(H.stats.chars / 1e4).toFixed(1)}</b><small>万字</small></div>
          <div><b class="num">${H.stats.chapters}</b><small>章</small></div>
          <div><b class="num">${H.stats.sections}</b><small>节</small></div>
          <div><b class="num">${H.stats.tables}</b><small>张原表</small></div>
        </div>
        <p>${HISTORY_NOTE}</p>
      </div>
      <div class="hc-r">
        <form class="hc-search" id="histForm" role="search">${icon("search", "ic-xs")}<input name="q" type="search" placeholder="检索历史存档：右肩、HRR、8/24…" aria-label="检索历史存档"><button class="chip on" type="submit">检索</button></form>
        <div class="hc-chaps">${H.toc.filter((c) => c.text).map((c) => `<button class="chip" data-hist-sec="${c.id}">${esc(c.text)}</button>`).join("")}</div>
        <button class="hc-open" data-hist-open>${icon("book", "ic-xs")}打开全文阅读</button>
      </div>
    </article>` : `<p class="note rv">本文件未内嵌历史存档。</p>`}`,
  "维持计划、文献核实原文、文件索引与冻结的历史存档。");
}

function colophon() {
  return `<footer class="colophon">
    <div class="co-orb" aria-hidden="true"></div>
    <div class="co-name">${META.subject}<span>${META.title} · ${META.version}</span></div>
    <p>数据截止 ${META.through} · 数据指纹 <code>${DATA_STAMP}</code> · 与《${RELEASE.monitor}》读取同一份《训练数据集.json》</p>
    <p class="note">本档案只描述变化，不提供训练处方或医学诊断。共 ${tableCount()} 张表、${figureCount()} 幅图。</p>
  </footer>`;
}

/* ================= 图表 ================= */
const { t0: recT0, t1: recT1 } = chartExtents(X.recs);
const CHARTS = {
  el(body) {
    const ex = new Set(B.excluded);
    drawChart(body, {
      aria: "Elite 晨起 RMSSD 全程", xMin: recT0, xMax: recT1, height: 280, logY: true,
      series: [{ values: X.series.el.map((p) => ({ ...p, flag: ex.has(p.d) })), line: true, points: true, lineW: 1.4 }],
      bands: [{ lo: B.band[0], hi: B.band[1], label: "常态带" }],
      hlines: [{ y: B.outl[0], dash: true, label: "−1.5σ" }, { y: B.outl[1], dash: true, label: "+1.5σ" }],
      marks: X.series.el.filter((p) => !ex.has(p.d) && (p.y < B.outl[0] || p.y > B.outl[1])),
      refSpan: { t0: B.start, t1: B.end, label: "参考期 · 已锁定" },
      yTicks: [60, 70, 80, 90, 100, 110], yFmt: (v) => v,
      findRec: (d) => X.recs.find((r) => r.d === d),
      tipFn: (r) => r ? `<div class="t-d">${r.d}</div><div class="t-row"><span class="k">RMSSD</span><span>${r.el} ms</span></div><div class="t-row"><span class="k">训练</span><span>${esc(r.type || "—")}</span></div>${ex.has(r.d) ? `<div class="t-row"><span class="k">基线</span><span>排除</span></div>` : ""}` : "",
    });
  },
  hw(body) {
    drawChart(body, {
      aria: "华为夜间 HRV 全程", xMin: recT0, xMax: recT1, height: 200,
      series: [{ values: X.series.hw, line: true, points: true, color: "b", area: true }],
      yTicks: [70, 90, 110], yFmt: (v) => v,
      findRec: (d) => X.recs.find((r) => r.d === d),
      tipFn: (r) => r ? `<div class="t-d">${r.d}</div><div class="t-row"><span class="k">夜间 HRV</span><span>${r.hw} ms</span></div><div class="t-row"><span class="k">睡眠</span><span>${fmtDurEn(r.dur)}</span></div>` : "",
    });
  },
  ref(body) {
    const ex = new Set(B.excluded);
    const pts = X.refSamples.map((s) => ({ d: s.d, y: s.el, flag: s.excluded }));
    drawChart(body, {
      aria: "参考期晨测", xMin: dayMs(B.start) - 432e5, xMax: dayMs(B.end) + 432e5, height: 240, logY: true,
      series: [{ values: pts, line: false, points: true }],
      bands: [{ lo: B.band[0], hi: B.band[1], label: `常态带 ${B.band.join("–")}` }],
      hlines: [{ y: B.outl[0], dash: true, label: `${B.outl[0]}` }, { y: B.outl[1], dash: true, label: `${B.outl[1]}` }],
      yTicks: [60, 70, 80, 90, 100], yFmt: (v) => v,
      findRec: (d) => X.refSamples.find((s) => s.d === d),
      tipFn: (s) => s ? `<div class="t-d">${s.d}</div><div class="t-row"><span class="k">RMSSD</span><span>${s.el} ms</span></div><div class="t-row"><span class="k">ln</span><span>${Math.log(s.el).toFixed(4)}</span></div><div class="t-row"><span class="k">基线</span><span>${s.excluded ? "排除" : "纳入"}</span></div>${s.reason ? `<div class="t-row"><span>${esc(s.reason)}</span></div>` : ""}` : "",
    });
    void ex;
  },
  weight(body) {
    const w = X.weights;
    const { t0, t1 } = chartExtents(w);
    drawChart(body, {
      aria: "体重", xMin: t0, xMax: t1, height: 220,
      series: [
        { values: w.filter((x) => x.period === "morning").map((x) => ({ d: x.d, y: x.kg })), line: true, points: true, color: "a", lineW: 1.6 },
        { values: w.filter((x) => x.period === "evening").map((x) => ({ d: x.d, y: x.kg, flag: true })), line: false, points: true, color: "b" },
      ],
      yDomain: [59.8, 62.8], yTicks: [60, 60.5, 61, 61.5, 62, 62.5], yFmt: (v) => v.toFixed(1),
      findRec: (d) => d,
      tipFn: (d) => { const x = w.filter((v) => v.d === d); return x.length ? `<div class="t-d">${d}</div>${x.map((v) => `<div class="t-row"><span class="k">${v.time} ${v.period === "evening" ? "晚" : "上午"}</span><span>${v.kg.toFixed(2)} kg</span></div>`).join("")}` : ""; },
    });
  },
};
const drawn = new Set();
function drawFig(fig) {
  const k = fig.dataset.chart, body = fig.querySelector(".p-body");
  if (!k || !CHARTS[k] || !body) return;
  CHARTS[k](body);
  drawn.add(fig);
}

/* ================= 装配 ================= */
function render() {
  $("#doc").innerHTML = cover() + now() + me() + peaks() + rings() + chain() + voices() + fuel() + method() + rules() + ahead() + appx() + colophon();
  $("#wkChart").innerHTML = weeklySvg();
  $("#rail").innerHTML = CHAPTERS.map((c) => `<a href="#${c.id}" data-id="${c.id}"><span class="r-no">${c.no}</span><span class="r-zh">${c.zh}</span></a>`).join("");
  $("#chips").innerHTML = CHAPTERS.map((c) => `<a class="chip" href="#${c.id}" data-id="${c.id}">${c.no === "附" ? "附录" : c.no + " " + c.zh}</a>`).join("");
  $("#monitorLink").href = MONITOR_HREF;
  $("#monitorLink").innerHTML = icon("pulse") + "<span>监测系统</span>";
  $("#printBtn").innerHTML = icon("print");
  $("#themeBtn").innerHTML = icon("palette");
  $("#toTop").innerHTML = icon("up");
}

function wire() {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  /* 进入视口：渐显 + 图表首次绘制（首次绘制与描线动画同时发生，避免闪烁） */
  const io = new IntersectionObserver((es) => {
    for (const e of es) {
      if (!e.isIntersecting) continue;
      e.target.classList.add("in");
      if (e.target.matches(".fig")) { e.target.classList.add("inview"); if (!drawn.has(e.target)) drawFig(e.target); }
      io.unobserve(e.target);
    }
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.06 });
  document.querySelectorAll(".rv, .fig").forEach((n) => io.observe(n));

  /* 当前章节高亮 */
  const links = [...document.querySelectorAll("#rail a, #chips a")];
  const spy = new IntersectionObserver((es) => {
    for (const e of es) if (e.isIntersecting) {
      const id = e.target.id;
      links.forEach((a) => a.classList.toggle("on", a.dataset.id === id));
      const chip = $(`#chips a[data-id="${id}"]`);
      if (chip) chip.parentElement.scrollTo({ left: chip.offsetLeft - 40, behavior: reduced ? "auto" : "smooth" });
    }
  }, { rootMargin: "-45% 0px -50% 0px" });
  document.querySelectorAll(".chap").forEach((s) => spy.observe(s));

  const bar = $("#progress"), toTop = $("#toTop");
  const onScroll = () => {
    const h = document.documentElement.scrollHeight - innerHeight;
    bar.style.transform = `scaleX(${h > 0 ? scrollY / h : 0})`;
    document.body.classList.toggle("scrolled", scrollY > innerHeight * 0.6);
    toTop.classList.toggle("on", scrollY > 900);
  };
  addEventListener("scroll", onScroll, { passive: true }); onScroll();
  toTop.onclick = () => scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });

  /* 日历 */
  const info = $("#calInfo");
  const showDay = (d) => {
    const r = X.recs.find((x) => x.d === d); if (!r) return;
    const km = X.weeks.flat().find((c) => c && c.d === d);
    const n = H_TEXT ? countMatches(H_TEXT, dayPattern(d)) : 0;
    info.innerHTML = `<b>${d.replace(/-/g, ".")} · ${weekday(d)}</b><span class="dot c-${km.cat}"></span>${esc(r.type || "训练未报告")}${km.km ? ` · ${km.km} km` : ""}${km.vol ? ` · 容量 ${km.vol} kg` : ""} · 睡眠 ${fmtDurEn(r.dur)} · 夜间 HRV ${r.hw ?? "—"}${r.el != null ? ` · Elite ${r.el}` : ""}${n ? `<button class="hist-link" data-hist-day="${d}">${icon("history", "ic-xs")}历史存档提及 ${n} 处</button>` : ""}`;
    document.querySelectorAll(".cal-c.sel").forEach((c) => c.classList.remove("sel"));
    $(`.cal-c[data-d="${d}"]`)?.classList.add("sel");
  };
  $("#cal").addEventListener("pointerover", (e) => { const c = e.target.closest(".cal-c[data-d]"); if (c) showDay(c.dataset.d); });
  $("#cal").addEventListener("click", (e) => { const c = e.target.closest(".cal-c[data-d]"); if (c) showDay(c.dataset.d); });

  /* 引文筛选 */
  document.querySelectorAll(".v-filter .chip").forEach((b) => (b.onclick = () => {
    document.querySelectorAll(".v-filter .chip").forEach((x) => x.classList.toggle("on", x === b));
    const t = b.dataset.tag;
    document.querySelectorAll("#voices .vc").forEach((c) => c.classList.toggle("hide", !!t && c.dataset.tag !== t));
  }));

  /* 计划切换 */
  document.querySelectorAll(".plan-tabs .chip").forEach((b) => (b.onclick = () => {
    document.querySelectorAll(".plan-tabs .chip").forEach((x) => { x.classList.toggle("on", x === b); x.setAttribute("aria-selected", String(x === b)); });
    document.querySelectorAll(".plans .plan").forEach((p) => p.classList.toggle("on", p.dataset.i === b.dataset.i));
  }));

  /* 附录 D 历史存档阅读器：#history 可直接打开，#history?q=关键词 带检索 */
  const reader = mountHistoryReader($("#hist"), H, {
    icon,
    onClose: () => { if (location.hash.startsWith("#history")) history.replaceState(null, "", "#appx-d"); },
  });
  const openHist = (o) => { if (!H.blocks.length) return; reader.open(o); if (!location.hash.startsWith("#history")) history.replaceState(null, "", "#history"); };
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-hist-sec], [data-hist-day], [data-hist-open]");
    if (!b) return;
    e.preventDefault();
    if (b.dataset.histDay) openHist({ re: dayPattern(b.dataset.histDay), label: `${+b.dataset.histDay.slice(5, 7)}/${+b.dataset.histDay.slice(8)} 或 ${zhDay(b.dataset.histDay)}` });
    else openHist({ sec: b.dataset.histSec || null });
  });
  $("#histForm")?.addEventListener("submit", (e) => { e.preventDefault(); openHist({ q: e.target.q.value }); });
  const fromHash = () => {
    if (!location.hash.startsWith("#history")) { if (reader.isOpen()) reader.close(); return; }
    const q = new URLSearchParams(location.hash.split("?")[1] || "").get("q") || "";
    if (!reader.isOpen()) openHist({ q });
  };
  addEventListener("hashchange", fromHash);
  fromHash();

  /* 打印：展开全部折叠内容 */
  let reopened = [];
  addEventListener("beforeprint", () => {
    reopened = [...document.querySelectorAll("details:not([open])")];
    reopened.forEach((d) => (d.open = true));
    document.querySelectorAll(".fig[data-chart]").forEach((f) => { if (!drawn.has(f)) { f.classList.add("inview"); drawFig(f); } });
  });
  addEventListener("afterprint", () => { reopened.forEach((d) => (d.open = false)); reopened = []; });
  $("#printBtn").onclick = () => print();
  $("#themeBtn").onclick = () => toggleTheme();

  let lastW = innerWidth, rz = null;
  addEventListener("resize", () => {
    clearTimeout(rz);
    rz = setTimeout(() => { if (innerWidth === lastW) return; lastW = innerWidth; drawn.forEach((f) => drawFig(f)); }, 200);
  });
}

function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("on");
  setTimeout(() => t.classList.remove("on"), 3200);
}

if (X.latest && !DS._invalid) {
initTheme();
render();
mountParticleField($("#fx"));
mountParticleText($("#cvName"), META.subject, { align: "center" });
bindLight();
wire();
if (X.voiceMissing.length) toast(`有 ${X.voiceMissing.length} 条引文未在数据集中找到原文，见第 05 章提示区`);

} else {
  initTheme();
  $("#doc").innerHTML = `<section class="sec"><h1>档案数据无法加载</h1><p>请使用完整的最新交付文件，或重新构建源码。</p></section>`;
}
