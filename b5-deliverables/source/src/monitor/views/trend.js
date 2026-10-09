import {
  state, T, sortedRecs, getBaseline, rolling7, xExtent, dayMs, pad2,
  weightPoints, weight7, weightAxis, strengthTotal, runTotal,
  DEFAULT_BASELINE, windowStats, saveBaselineLock, clearBaselineLock, saveResultMessage,
  esc, fmtPace, hrrNorm, hrrOut,
} from "../core.js";
import { drawChart, drawScatterPw, drawSleepStack } from "../charts.js";

const $ = (s, r = document) => r.querySelector(s);
const findRec = (d) => state.recs.find((r) => r.d === d);

let toast = () => {};
let renderAll = () => {};

export function bindTrend({ toast: t, renderAll: r }) {
  toast = t;
  renderAll = r;
}

export function tipBasic(units) {
  return (rec) => {
    if (!rec) return "";
    let rows = "";
    for (const [k, lb, u, fmt] of units) {
      let v = k === "hrr" ? hrrNorm(rec) : rec[k];
      if (v != null && fmt) v = fmt(v);
      rows += `<div class="t-row"><span class="k">${lb}</span><span>${v == null ? "—" : (typeof v === "number" ? (Number.isInteger(v) ? v : v.toFixed(1)) : esc(v)) + (v == null ? "" : u)}</span></div>`;
    }
    return `<div class="t-d">${rec.d}</div>${rows}`;
  };
}

export function panelHtml(title, valHtml, foot, id, cls = "") {
  return `<div class="panel glass rise ${cls}"${id ? ` id="${id}"` : ""}><div class="p-head"><span class="p-title">${title}</span><span class="p-val">${valHtml || ""}</span></div><div class="p-body"></div>${foot ? `<div class="p-foot">${foot}</div>` : ""}<div class="chart-tip"></div></div>`;
}

export function renderTrend() {
  const el = $("#view-trend");
  const recs = sortedRecs();
  if (!recs.length) { el.innerHTML = `<div class="empty-state glass"><h3>暂无记录</h3></div>`; return; }
  const [xMin, xMax] = xExtent(recs);
  const st = getBaseline(state.recs);
  const rolls = rolling7(state.recs);

  let html = `<div class="sec-head"><span class="eyebrow">§2 趋势 · Trend</span><span class="note">${recs[0].d} → ${recs[recs.length - 1].d} · n=${recs.length} 天</span></div>`;
  html += `<div class="panel glass hero-panel rise" id="p-band">
    <div class="p-head"><span class="p-title">lnRMSSD 基线带 · 晨起清醒静息（Polar H10 / Elite）</span>
    <span class="p-val">${st ? `参考期 ${st.start.slice(5).replace("-", "/")}–${st.end.slice(5).replace("-", "/")} · n=${st.n} · μ=${st.mean.toFixed(4)} · σ=${st.sd.toFixed(4)} · ${st.locked ? "已锁定" : '<span class="hi">基线未锁定</span>'}` : ""}</span></div>
    <div class="p-body"></div>
    <div class="legend">
      <span><i class="lg-band"></i>常态带 μ±1σ（≈${st ? Math.exp(st.lo).toFixed(1) + "–" + Math.exp(st.hi).toFixed(1) : "—"}ms，${st && st.locked ? "锁定" : "临时"}）</span>
      <span><i class="lg-dash"></i>离群线 μ±1.5σ（≈${st ? Math.exp(st.olo).toFixed(1) + " / " + Math.exp(st.ohi).toFixed(1) : "—"}ms）</span>
      <span><i class="lg-line"></i>7 日滚动均值（当前状态）</span>
      <span><i class="lg-dot"></i>单日值</span>
      <span><i class="lg-mark"></i>超出离群线</span>
    </div>
    <div class="p-foot">纵轴为对数刻度。浅色竖带为参考期——基线由其算出后锁定，不随新数据滑动；7 日滚动均值与锁定基线比较得出当前状态。${st && !st.locked ? '<span class="hi">基线未锁定，趋势判定不可靠</span>（临时使用全部 ' + st.n + " 个有效样本）。" : ""}原始记录保留；基线严格使用固定窗口及明确排除清单。</div>
    <div class="chart-tip"></div></div>
    <div class="panel glass rise" id="p-baseline"></div>`;
  html += `<div class="subnav"><span class="note">跳转</span>
    ${[["p-band", "基线带"], ["tr-weight", "体重"], ["tr-hw", "睡眠 / HRV"], ["tr-load", "训练 / 营养"], ["tr-gct", "跑姿 / 力量"], ["tr-week", "周汇总"]].map(([t, l]) => `<button class="chip" data-t="${t}">${l}</button>`).join("")}</div>`;
  html += panelHtml("体重 · 上午记录与 7 日均值", "晚间测量不混入", "已结构化范围为 9 月 25 日起；标准空腹条件未全部确认，历史缺口不补造。均值至少 3 点且显示样本数。", "tr-weight");
  html += `<div class="grid-2">`;
  html += panelHtml("夜间 HRV · 华为 WATCH 5", "整夜均值", "与晨起 RMSSD 是两套口径，不可互验。参考区间由设备滚动生成、会持续漂移，故不在此标注。", "tr-hw");
  html += panelHtml("RMSSD × 睡眠 HR · 双轴", '<span class="k-a">— RMSSD</span> <span class="k-b">┄ 睡眠HR</span>', "规则 A：RMSSD 单日跌超 8ms 时看睡眠 HR 方向。只描述方向，不据此自动归因。", "tr-elshr");
  html += panelHtml("深睡连续性", "个人下限 70", "华为专有指标，0–100。越界点以暖光标记。", "tr-cont");
  html += panelHtml("睡眠结构", "深睡 / REM / 轻睡占比", "消费级腕戴设备分期精度有限（BMJ 2021），看趋势不看单日。", "tr-sleep");
  html += panelHtml("训练负荷", "手表负荷值", "柱状。悬浮查看类型 / 距离 / 配速。", "tr-load");
  html += panelHtml("蛋白摄入", "目标带 100–115 g", "估值与旧目标并列；是否实际不足须结合误差范围。", "tr-pro");
  html += panelHtml("HRR 归一化 · 手动 1 分钟",
    T.HRR_BAND_ENABLED ? `收敛带 ${T.HRR_LO}–${T.HRR_HI}% · n=5` : "旧口径带已停用 · 仅记录数值",
    T.HRR_BAND_ENABLED ? "(hrr0−hrr1)/hrr0×100%。与手表 2 分钟口径绝不可混排。带外先查口径再查生理。"
      : "(hrr0−hrr1)/hrr0×100%。收敛带为旧口径（等峰值法）遗留，8/15 口径切换后停用——新口径样本不足，暂不判带外。与手表 2 分钟口径绝不可混排。", "tr-hrr");
  html += panelHtml("跑步功率原始记录", "只记录 不解读", "8 月 20 日起停止功率归因与鞋款效率比较。散点图仅保留原始点。", "tr-pw");
  html += panelHtml("跑姿 · 触地时间", "ms · 仅跑步日", "仅作跑姿观察；需结合配速和条件，不直接判定经济性。力量日不取点。", "tr-gct");
  html += panelHtml("跑姿 · 步频", "spm · 仅跑步日", "手表步频。样本尚少，看趋势不看单日。", "tr-cad");
  html += panelHtml("跑姿 · 垂直振幅", "cm · 仅跑步日", "仅记录垂直振幅，不由单项变化推断跑步经济性。", "tr-vo");
  html += panelHtml("左右平衡 · 偏离中线", "左侧占比 · 中线 50%", "以 50% 为中线画偏离。偏离 ≥±0.5% 以暖光标出，仅作观察。", "tr-bal");
  html += `</div>`;
  html += panelHtml("力量容量 · 逐日总容量", "kg · 已记录力量课", "优先合计逐课容量；历史未拆分日期沿用原字段。容量增长 ≠ 力量进步：单动作表现与辅助情况见档案明细。", "tr-vol");
  html += `<div class="sec-head" style="margin-top:34px"><span class="eyebrow">§3 周汇总 · Weekly（周一至周日）</span><span class="note">均值按有效记录计；* 优先已知全天跑量，其余沿用原字段，历史多课迁移未完</span></div>
    <div class="tbl-wrap glass" id="tr-week"><table id="wkTable"><thead><tr>
      <th class="l">周</th><th>天数</th><th>RMSSD 均值</th><th>夜间HRV 均值</th><th>睡眠HR 均值</th><th>睡眠时长 均值</th><th>已记录跑量*</th><th>字段负荷*</th><th>蛋白 均值</th>
    </tr></thead><tbody></tbody></table></div>`;
  el.innerHTML = html;
  el.querySelectorAll(".rise").forEach((n, i) => n.style.setProperty("animation-delay", `${Math.min(i, 10) * 40}ms`));

  const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.querySelectorAll(".subnav .chip").forEach((b) => (b.onclick = () => { $("#" + b.dataset.t)?.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" }); }));

  const vals = (key) => recs.filter((r) => r[key] != null).map((r) => ({ d: r.d, y: r[key], flag: false }));
  const body = (id) => el.querySelector("#" + id + " .p-body");
  const C = (extra) => Object.assign({ xMin, xMax, height: 220, findRec }, extra);

  if (st) {
    const daily = vals("el");
    const rollPts = recs.filter((r) => rolls[r.d]).map((r) => ({ d: r.d, y: Math.exp(rolls[r.d].v), flag: false }));
    const marks = daily.filter((p) => { const lv = Math.log(p.y); return lv < st.olo || lv > st.ohi; });
    drawChart($("#p-band .p-body"), C({
      aria: "lnRMSSD 基线带图", logY: true, height: 340,
      series: [{ values: daily, line: false, points: true }, { values: rollPts, line: true, points: false, lineW: 2.4, area: true }],
      bands: [{ lo: Math.exp(st.lo), hi: Math.exp(st.hi), label: "常态带" }],
      hlines: [{ y: Math.exp(st.olo), dash: true, label: "−1.5σ" }, { y: Math.exp(st.ohi), dash: true, label: "+1.5σ" }],
      marks, yTicks: [50, 60, 70, 80, 90, 100, 110, 120], yFmt: (v) => v,
      refSpan: { t0: st.start, t1: st.end, label: (st.locked ? "参考期 · 已锁定" : "临时参考期 · 未锁定") + " " + st.start.slice(5).replace("-", "/") + "–" + st.end.slice(5).replace("-", "/") },
      tipFn: tipBasic([["el", "RMSSD", " ms"], ["hw", "夜间HRV", " ms"], ["shr", "睡眠HR", " bpm"]]),
    }));
  }
  renderBaselinePanel(recs, st);
  const wp = weightPoints(), wr = wp.map((x) => ({ d: x.d, y: weight7(x.d)?.value })).filter((x) => x.y != null);
  if (wp.length) {
    const axis = weightAxis(wp);
    drawChart(body("tr-weight"), {
      aria: "体重趋势", xMin: dayMs(wp[0].d) - 43200000, xMax: dayMs(wp[wp.length - 1].d) + 43200000, height: 220, findRec,
      series: [{ values: wp, line: false, points: true, color: "b" }, { values: wr, line: true, points: false, lineW: 2.2, color: "b", area: true }],
      yDomain: axis.domain, yTicks: axis.ticks, yFmt: (v) => v.toFixed(1),
      tipFn: (rec, p) => {
        const d = p?.d || rec?.d, w = wp.find((x) => x.d === d), a = d ? weight7(d) : null;
        return w ? `<div class="t-d">${esc(w.d)} · ${esc(w.time || "上午")}</div>
          <div class="t-row"><span class="k">实测体重</span><span>${w.y.toFixed(2)} kg</span></div>
          <div class="t-row"><span class="k">7日均值</span><span>${a ? a.value.toFixed(2) + " kg (n=" + a.n + ")" : "不足3点"}</span></div>
          <div class="t-row"><span class="k">标准条件</span><span>${w.confirmed ? "已确认" : "未确认"}</span></div>` : "";
      },
    });
  } else body("tr-weight").innerHTML = '<div class="empty">暂无上午体重记录。</div>';

  drawChart(body("tr-hw"), C({ aria: "夜间HRV", series: [{ values: vals("hw"), line: true, points: true, color: "b", area: true }], yTicks: [70, 90, 110], yFmt: (v) => v,
    tipFn: tipBasic([["hw", "夜间HRV", " ms"], ["dur", "睡眠", " min"]]) }));
  drawChart(body("tr-elshr"), C({ aria: "RMSSD与睡眠HR双轴", hasY2: true,
    series: [{ values: vals("el"), line: true, points: true }, { values: vals("shr"), line: true, points: true, axis: 1, dash: true }],
    bands: [{ lo: T.SHR_LO, hi: T.SHR_HI, axis: 1, label: "45–52" }],
    yTicks: [60, 75, 90, 105], yFmt: (v) => v, y2Ticks: [44, 48, 52, 56], y2Fmt: (v) => v,
    tipFn: tipBasic([["el", "RMSSD", " ms"], ["shr", "睡眠HR", " bpm"]]) }));
  const contVals = vals("cont");
  drawChart(body("tr-cont"), C({ aria: "深睡连续性", series: [{ values: contVals, line: true, points: true, color: "c" }],
    hlines: [{ y: T.CONT_LO, label: "下限 70" }], marks: contVals.filter((p) => p.y < T.CONT_LO),
    yTicks: [60, 70, 80, 90, 100], yFmt: (v) => v, tipFn: tipBasic([["cont", "深睡连续性", " 分"], ["deep", "深睡", "%"], ["rem", "REM", "%"]]) }));
  drawSleepStack(body("tr-sleep"), recs, findRec);
  drawChart(body("tr-load"), C({ aria: "训练负荷", series: [{ values: vals("load"), bar: true }], yTicks: [0, 25, 50, 75, 100], yFmt: (v) => v,
    tipFn: tipBasic([["type", "类型", ""], ["km", "距离", " km"], ["pace", "配速", "", fmtPace], ["load", "负荷", ""]]) }));
  const proVals = vals("pro");
  drawChart(body("tr-pro"), C({ aria: "蛋白摄入", series: [{ values: proVals, bar: true, color: "c" }],
    bands: [{ lo: T.PRO_LO, hi: T.PRO_HI, label: "100–115g" }], marks: proVals.filter((p) => p.y < T.PRO_LO),
    yTicks: [0, 50, 100, 150], yFmt: (v) => v, tipFn: tipBasic([["pro", "蛋白", " g"], ["kcal", "热量", " kcal"]]) }));
  const hrrVals = recs.map((r) => ({ d: r.d, y: hrrNorm(r), flag: false })).filter((p) => p.y != null);
  drawChart(body("tr-hrr"), C({ aria: "HRR归一化", series: [{ values: hrrVals, line: false, points: true, color: "c" }],
    bands: T.HRR_BAND_ENABLED ? [{ lo: T.HRR_LO, hi: T.HRR_HI, label: "22.4–24.7%" }] : [],
    marks: T.HRR_BAND_ENABLED ? hrrVals.filter((p) => hrrOut(p.y)) : [],
    yTicks: T.HRR_BAND_ENABLED ? [20, 22.4, 24.7, 28, 30.2] : [15, 20, 25, 30], yFmt: (v) => v + "%",
    tipFn: tipBasic([["hrr", "HRR归一化", "%"], ["hrr0", "起始心率", " bpm"], ["hrr1", "1分钟末", " bpm"]]) }));
  drawScatterPw(body("tr-pw"), recs, findRec);
  drawChart(body("tr-gct"), C({ aria: "触地时间", height: 200, series: [{ values: vals("gct"), line: true, points: true }], yFmt: (v) => v,
    tipFn: tipBasic([["gct", "触地时间", " ms"], ["pace", "配速", "", fmtPace], ["pw", "功率", " W"], ["cad", "步频", " spm"]]) }));
  drawChart(body("tr-cad"), C({ aria: "步频", height: 200, series: [{ values: vals("cad"), line: true, points: true, color: "b" }], yFmt: (v) => v,
    tipFn: tipBasic([["cad", "步频", " spm"], ["pace", "配速", "", fmtPace], ["pw", "功率", " W"]]) }));
  drawChart(body("tr-vo"), C({ aria: "垂直振幅", height: 200, series: [{ values: vals("vo"), line: true, points: true, color: "c" }], yFmt: (v) => (+v).toFixed(1),
    tipFn: tipBasic([["vo", "垂直振幅", " cm"], ["pace", "配速", "", fmtPace], ["gct", "触地时间", " ms"]]) }));
  const balVals = vals("bal");
  drawChart(body("tr-bal"), C({ aria: "左右平衡", height: 200, series: [{ values: balVals, line: true, points: true, color: "b" }],
    bands: [{ lo: 49.5, hi: 50.5, label: "±0.5%" }], hlines: [{ y: 50, label: "50" }],
    marks: balVals.filter((p) => Math.abs(p.y - 50) >= 0.5), yTicks: [49, 49.5, 50, 50.5, 51], yFmt: (v) => (+v).toFixed(1) + "%",
    tipFn: (rec) => rec ? `<div class="t-d">${rec.d}</div><div class="t-row"><span class="k">左 / 右</span><span>${rec.bal.toFixed(1)}% / ${(100 - rec.bal).toFixed(1)}%</span></div><div class="t-row"><span class="k">配速</span><span>${esc(fmtPace(rec.pace))}</span></div>` : "" }));

  const VOL_FILL = { 腿日: "var(--accent-2)", 背日: "var(--accent)", 胸肩: "var(--cyan)" };
  const volVals = recs.filter((r) => strengthTotal(r).value != null).map((r) => ({ d: r.d, y: strengthTotal(r).value, flag: false, fill: VOL_FILL[r.type] }));
  drawChart(body("tr-vol"), C({ aria: "力量容量", height: 200, series: [{ values: volVals, bar: true, color: "b" }], yFmt: (v) => v,
    tipFn: (r) => { if (!r) return ""; const v = strengthTotal(r); return `<div class="t-d">${r.d}</div><div class="t-row"><span class="k">类型</span><span>${esc(r.type || "—")}</span></div><div class="t-row"><span class="k">容量</span><span>${v.value} kg</span></div><div class="t-row"><span class="k">口径</span><span>${v.scope}${v.n ? " · " + v.n + "课" : ""}</span></div>`; } }));
  const volLegend = document.createElement("div");
  volLegend.className = "legend";
  volLegend.innerHTML = Object.keys(VOL_FILL).map((k) => `<span><i class="lg-box" style="background:${VOL_FILL[k]}"></i>${k}</span>`).join("") + `<span><i class="lg-box" style="background:linear-gradient(var(--accent-2),#ff7fc8)"></i>其他力量</span>`;
  body("tr-vol").appendChild(volLegend);

  const weeks = new Map();
  for (const r of recs) {
    const dt = new Date(r.d + "T00:00:00"), dow = (dt.getDay() + 6) % 7, mon = new Date(dt.getTime() - dow * 86400000);
    const key = mon.getFullYear() + "-" + pad2(mon.getMonth() + 1) + "-" + pad2(mon.getDate());
    if (!weeks.has(key)) weeks.set(key, []);
    weeks.get(key).push(r);
  }
  const avg = (arr, key) => { const v = arr.map((r) => r[key]).filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const sum = (arr, key) => { const v = arr.map((r) => r[key]).filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) : null; };
  const durFmt = (m) => { const t = Math.round(m); return Math.floor(t / 60) + "h" + pad2(t % 60); };
  let rows = "";
  for (const [k, arr] of [...weeks.entries()].sort()) {
    const end = new Date(dayMs(k) + 6 * 86400000), endS = end.getMonth() + 1 + "/" + end.getDate();
    const aEl = avg(arr, "el"), aHw = avg(arr, "hw"), aShr = avg(arr, "shr"), aDur = avg(arr, "dur"), aPro = avg(arr, "pro");
    const kv = arr.map(runTotal).filter((v) => v != null); const sKm = kv.length ? kv.reduce((a, b) => a + b, 0) : null, sLoad = sum(arr, "load");
    rows += `<tr><td>${k.slice(5).replace("-", "/")} – ${endS}</td><td>${arr.length}</td><td>${aEl != null ? aEl.toFixed(1) : "—"}</td><td>${aHw != null ? Math.round(aHw) : "—"}</td><td>${aShr != null ? aShr.toFixed(1) : "—"}</td><td>${aDur != null ? durFmt(aDur) : "—"}</td><td>${sKm != null ? sKm.toFixed(2) : "—"}</td><td>${sLoad ?? "—"}</td><td>${aPro != null ? Math.round(aPro) : "—"}</td></tr>`;
  }
  el.querySelector("#wkTable tbody").innerHTML = rows || `<tr><td colspan="9" class="na">暂无数据</td></tr>`;
}

export function renderBaselinePanel(recs, st) {
  const p = $("#p-baseline");
  if (!p) return;
  const elDates = recs.filter((r) => r.el != null).map((r) => r.d);
  const opts = (sel) => elDates.map((d) => `<option value="${d}"${d === sel ? " selected" : ""}>${d}</option>`).join("");
  let status;
  if (st && st.locked) {
    status = `<div class="bs-status"><span class="pill"><span class="dot"></span>已锁定</span><span>${st.start} → ${st.end} · n=${st.n} · lnRMSSD μ=${st.mean.toFixed(4)} σ=${st.sd.toFixed(4)} · 常态带 ${Math.exp(st.lo).toFixed(1)}–${Math.exp(st.hi).toFixed(1)}ms${st.exclude && st.exclude.length ? ` · 排除 ${st.exclude.join("、")}` : ""}${st.auto ? " · 由满 28 个有效样本自动锁定（最早 28 个）" : ""}${st.lockedAt ? ` · 锁定于 ${st.lockedAt.slice(0, 10)}` : ""}</span>${st.builtin ? `<p class="note">内置默认基线 —— 随本文件内置，不是你在这台设备上手动锁的；如需调整，在下方重选区间 / 排除日后点「计算并锁定」即可覆盖。</p>` : ""}</div>`;
  } else if (st) {
    status = `<div class="bs-status"><span class="hi">基线未锁定，趋势判定不可靠</span> —— 当前临时使用全部 n=${st.n} 个有效样本（${st.start} → ${st.end}）。满 ${T.BASELINE_MIN_N} 个有效样本后将按最早 ${T.BASELINE_MIN_N} 个自动锁定；也可现在手动指定一段「健康基准期」提前锁定。</div>`;
  } else status = `<div class="note">暂无足够的 RMSSD 数据（至少 2 个有效样本）。</div>`;
  p.innerHTML = `
    <div class="p-head"><span class="p-title">参考期基线 · Reference Baseline</span><span class="p-val">锁定后不随新数据滑动 · 重设应仅在训练阶段切换等节点进行</span></div>
    <div class="bs-body">${status}</div>
    <div class="basegrid">
      <div><label for="bs-start">参考期起</label><select id="bs-start">${opts(st ? st.start : null)}</select></div>
      <div><label for="bs-end">参考期止</label><select id="bs-end">${opts(st ? st.end : null)}</select></div>
      <div class="bs-ex"><label for="bs-exclude">排除日期（逗号分隔，可留空）</label><input id="bs-exclude" placeholder="如 2026-08-16, 2026-08-17" value="${st && st.exclude ? esc(st.exclude.join(", ")) : ""}"></div>
    </div>
    <div class="bs-actions">
      <button class="btn" id="bs-preview">预览该区间的 μ / σ</button>
      <button class="btn primary" id="bs-lock">计算并锁定</button>
      ${st && st.locked ? `<button class="btn" id="bs-unlock">解除锁定</button>` : ""}
      <button class="btn sm" id="bs-first28" ${elDates.length < T.BASELINE_MIN_N ? "disabled" : ""}>用最早 ${T.BASELINE_MIN_N} 个有效样本</button>
      <button class="btn sm" id="bs-last28" ${elDates.length < T.BASELINE_MIN_N ? "disabled" : ""}>以最近 ${T.BASELINE_MIN_N} 个有效样本重设</button>
    </div>
    <div class="p-foot" id="bs-msg">参考期应选身体状态正常、无病程、测量协议稳定的一段；区间内带 flag 的记录照常计入，是否采信由你判断；已查明原因的测量事故日（如 8/16、8/17）建议填入「排除日期」剔除出参照系。</div>`;
  const msg = $("#bs-msg");
  const getRange = () => { const a = $("#bs-start").value, b = $("#bs-end").value; return a <= b ? [a, b] : [b, a]; };
  const getExclude = () => {
    const toks = $("#bs-exclude").value.split(/[,，、\s]+/).filter(Boolean);
    const list = toks.filter((t) => /^\d{4}-\d{2}-\d{2}$/.test(t));
    return { list, dropped: toks.length - list.length };
  };
  const preview = () => {
    const [a, b] = getRange(), ex = getExclude();
    const w = windowStats(recs, a, b, ex.list);
    if (!w) { msg.textContent = "该区间有效样本不足 2 个（排除后），无法计算。"; return null; }
    msg.innerHTML = `区间 ${a} → ${b}${ex.list.length ? `，排除 ${ex.list.length} 天（${ex.list.join("、")}）` : ""}：n=${w.n} · μ=${w.mean.toFixed(4)} · σ=${w.sd.toFixed(4)} · 常态带 ${Math.exp(w.lo).toFixed(1)}–${Math.exp(w.hi).toFixed(1)}ms · 离群线 ${Math.exp(w.olo).toFixed(1)} / ${Math.exp(w.ohi).toFixed(1)}ms${w.n < T.BASELINE_MIN_N ? ` · <span class="hi">n&lt;${T.BASELINE_MIN_N}，偏少</span>` : ""}${ex.dropped ? ` · <span class="hi">${ex.dropped} 个排除日期格式无法识别，已忽略</span>` : ""}`;
    return w;
  };
  $("#bs-preview").onclick = preview;
  $("#bs-lock").onclick = async () => {
    const w = preview(); if (!w) return;
    if (w.n < 7 && !confirm("该区间仅 " + w.n + " 个有效样本，基线会很脆弱。仍要锁定吗？")) return;
    w.lockedAt = new Date().toISOString(); w.auto = false;
    const sr = await saveBaselineLock(w);
    if (sr.ok) toast("参考期已锁定：" + w.start + " → " + w.end + "（n=" + w.n + (w.exclude && w.exclude.length ? "，排除 " + w.exclude.length + " 天" : "") + "）");
    else toast(saveResultMessage(sr) || "基线未能保存");
    renderAll();
  };
  const un = $("#bs-unlock");
  if (un) un.onclick = async () => {
    if (st && st.builtin) {
      if (!confirm("当前显示的是随文件内置的默认基线（" + DEFAULT_BASELINE.start + " → " + DEFAULT_BASELINE.end + "），本机并没有手动锁定。解除后仍会回落到这条内置默认 —— 如需修改，直接用下方「计算并锁定」覆盖即可。仍要清除本机记录吗？")) return;
      const sr = await clearBaselineLock();
      if (sr.ok) toast("已清除本机锁定记录，基线回落到内置默认");
      else toast(saveResultMessage(sr) || "未能写入本机存储");
      renderAll(); return;
    }
    if (!confirm("解除锁定后，基线将回落到随文件内置的默认基线（" + DEFAULT_BASELINE.start + " → " + DEFAULT_BASELINE.end + "，排除 " + DEFAULT_BASELINE.exclude.join("、") + "），不再回到临时全量模式。继续？")) return;
    const sr = await clearBaselineLock();
    if (sr.ok) toast("已解除本机锁定，回落到内置默认基线");
    else toast(saveResultMessage(sr) || "未能写入本机存储");
    renderAll();
  };
  $("#bs-first28").onclick = async () => {
    const win = elDates.slice(0, T.BASELINE_MIN_N), w = windowStats(recs, win[0], win[win.length - 1]); if (!w) return;
    w.lockedAt = new Date().toISOString(); w.auto = false;
    const sr = await saveBaselineLock(w);
    if (sr.ok) toast("已锁定最早 " + T.BASELINE_MIN_N + " 个有效样本为参考期");
    else toast(saveResultMessage(sr) || "基线未能保存");
    renderAll();
  };
  $("#bs-last28").onclick = async () => {
    if (!confirm("以最近 " + T.BASELINE_MIN_N + " 个有效样本重设基线？训练阶段切换才需要这样做，旧基线将被覆盖。")) return;
    const win = elDates.slice(-T.BASELINE_MIN_N), w = windowStats(recs, win[0], win[win.length - 1]); if (!w) return;
    w.lockedAt = new Date().toISOString(); w.auto = false;
    const sr = await saveBaselineLock(w);
    if (sr.ok) toast("已以最近 " + T.BASELINE_MIN_N + " 个有效样本重设基线");
    else toast(saveResultMessage(sr) || "基线未能保存");
    renderAll();
  };
}
