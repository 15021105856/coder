import { mountOrb } from "../../shared/fx.js";
import { icon } from "../../shared/icons.js";
import { typeCat, CAT_LABEL } from "../../shared/training.js";
import { utcParts, pad2 } from "../../shared/time.js";
import {
  store, state, T, sortedRecs, getBaseline, weight7, strengthTotal,
  bandPos, judge, esc, fmtTsec, fmtDur, fmtPace, hrrNorm, hrrOut,
} from "../core.js";
import { sparkline, resetSparklineIds } from "../charts.js";

const $ = (s, r = document) => r.querySelector(s);
const WK = ["日", "一", "二", "三", "四", "五", "六"];

let orb = null, orbCanvas = null;

export function renderToday() {
  const el = $("#view-today");
  const recs = sortedRecs();
  if (!recs.length) {
    el.innerHTML = `<div class="empty-state glass"><div class="es-orb"></div><h3>还没有记录</h3><p>到「数据来源」粘贴一段 JSON，或用右上角菜单导入《训练数据集.json》。</p></div>`;
    return;
  }
  if (!state.sel || !recs.find((r) => r.d === state.sel)) state.sel = recs[recs.length - 1].d;
  resetSparklineIds();
  const r = recs.find((x) => x.d === state.sel);
  const idx = recs.indexOf(r);
  const st = getBaseline(state.recs);
  const { y, m, day, dow } = utcParts(r.d);
  const meta = store.dailyMeta[r.d] || {};
  const prev = (() => { for (let j = idx - 1; j >= 0; j--) if (recs[j].el != null) return recs[j]; return null; })();
  const lastEl = (() => { for (let j = idx; j >= 0; j--) if (recs[j].el != null) return recs[j]; return null; })();
  const win = recs.slice(Math.max(0, idx - 13), idx + 1);
  const series = (k) => win.map((x) => (typeof k === "function" ? k(x) : x[k]));

  const pos = bandPos(r.el, st);
  let orbTone, orbLb, orbV, orbU = "ms", orbSt;
  if (r.el != null) {
    orbTone = pos; orbLb = "晨起 RMSSD · Elite"; orbV = r.el.toFixed(1);
    orbSt = pos === "out" ? "超出 ±1.5σ 离群线" : pos === "edge" ? "常态带外 · 离群线内" : "常态带内";
  } else if (r.hw != null) {
    orbTone = "alt"; orbLb = "夜间 HRV · 华为"; orbV = r.hw;
    orbSt = "Elite 缺测 · 不与基线比较";
  } else { orbTone = "none"; orbLb = "当日无 HRV 读数"; orbV = "—"; orbU = ""; orbSt = "缺测不等于正常"; }

  let elDelta = "";
  if (r.el != null && prev) { const dd = r.el - prev.el; elDelta = `较 ${prev.d.slice(5).replace("-", "/")} ${dd >= 0 ? "+" : ""}${dd.toFixed(1)} ms`; }

  let gauge = "";
  if (st) {
    const lo = Math.exp(st.olo) - 10, hi = Math.exp(st.ohi) + 10;
    const P = (v) => Math.max(0, Math.min(100, ((Math.log(v) - Math.log(lo)) / (Math.log(hi) - Math.log(lo))) * 100));
    const bLo = P(Math.exp(st.lo)), bHi = P(Math.exp(st.hi)), oLo = P(Math.exp(st.olo)), oHi = P(Math.exp(st.ohi));
    const marker = r.el != null
      ? `<span class="g-marker ${pos}" style="left:${P(Math.min(hi, Math.max(lo, r.el)))}%"><b>${r.el.toFixed(1)}</b></span>`
      : "";
    gauge = `<div class="gauge">
      <div class="g-track">
        <span class="g-out" style="left:0;width:${oLo}%"></span>
        <span class="g-edge" style="left:${oLo}%;width:${bLo - oLo}%"></span>
        <span class="g-band" style="left:${bLo}%;width:${bHi - bLo}%"></span>
        <span class="g-edge" style="left:${bHi}%;width:${oHi - bHi}%"></span>
        <span class="g-out" style="left:${oHi}%;right:0"></span>
        ${marker}
      </div>
      <div class="g-ticks">
        <span style="left:${oLo}%">${Math.exp(st.olo).toFixed(1)}</span>
        <span style="left:${bLo}%">${Math.exp(st.lo).toFixed(1)}</span>
        <span style="left:${bHi}%">${Math.exp(st.hi).toFixed(1)}</span>
        <span style="left:${oHi}%">${Math.exp(st.ohi).toFixed(1)}</span>
      </div>
      <div class="g-legend"><span><i class="lg-band"></i>常态带 μ±1σ</span><span><i class="lg-edge"></i>带外</span><span><i class="lg-out"></i>离群线外 ±1.5σ</span></div>
    </div>`;
  }
  const baseNote = st ? (st.locked
    ? `参考期 ${st.start} → ${st.end} · n=${st.n} · 已锁定，不随新数据滑动 · lnRMSSD μ=${st.mean.toFixed(4)} σ=${st.sd.toFixed(4)}`
    : `<span class="hi">基线未锁定，趋势判定不可靠</span> · 临时以全部 n=${st.n} 个有效样本计算（${st.start} → ${st.end}，未达 ${T.BASELINE_MIN_N} 个）· 到「趋势」页可手动锁定参考期`) : "";
  const elMissing = r.el == null
    ? `<div class="g-missing">${icon("info")}<span>当日 Elite 晨测缺失${lastEl ? `；最近一次为 ${lastEl.d.slice(5).replace("-", "/")} 的 ${lastEl.el.toFixed(2)} ms，之后缺测不沿用为当天值` : ""}。</span></div>` : "";

  function tile({ k, ic, lb, val, unit, sub, mark, spark, color, wide }) {
    return `<div class="tile glass lit${mark ? " warm" : ""}${wide ? " wide" : ""}" data-k="${k}">
      <div class="t-top"><span class="t-ic">${icon(ic)}</span><span class="t-lb">${lb}</span>${mark ? `<span class="mark-chip">越界</span>` : ""}</div>
      <div class="t-val${mark ? " is-mark" : ""}"><span class="num">${val}</span><span class="unit">${unit || ""}</span></div>
      ${sub ? `<div class="t-sub">${sub}</div>` : ""}
      ${spark ? `<div class="t-spark">${sparkline(spark, { color: color || "a" })}<span class="sp-lb">近 ${win.length} 天</span></div>` : ""}
    </div>`;
  }
  const sr = meta.sleep?.shr_range || [T.SHR_LO, T.SHR_HI];
  const hp = hrrNorm(r);
  const wm = (meta.weight || []).find((x) => x.period === "morning");
  const wa = weight7(r.d);
  const wSeries = win.map((x) => (store.dailyMeta[x.d]?.weight || []).find((w) => w.period === "morning")?.kg ?? null);
  const ns = meta.nutrition;
  let kcalSub = "代表值；范围与误差见下方记录";
  if (ns?.kcal_range && r.kcal != null) {
    const [a, b] = ns.kcal_range, p = Math.max(0, Math.min(100, ((r.kcal - a) / (b - a || 1)) * 100));
    kcalSub = `<div class="range"><span class="rg-bar"><i style="left:${p}%"></i></span><span>估算 ${a}–${b} kcal · 蛋白 ${ns.protein_range.join("–")} g</span></div>`;
  }
  const tiles = [
    tile({ k: "el", ic: "heart", lb: "晨起 RMSSD · Elite", val: r.el != null ? r.el.toFixed(1) : "—", unit: "ms",
      sub: r.el != null ? [orbSt, elDelta].filter(Boolean).join(" · ") : "当日缺测", mark: pos === "out" || pos === "edge", spark: series("el") }),
    tile({ k: "hw", ic: "wave", lb: "夜间 HRV · 华为", val: r.hw ?? "—", unit: "ms",
      sub: meta.sleep?.hw_range ? `整夜均值 · 当日设备区间 ${meta.sleep.hw_range.join("–")}` : "整夜均值 · 设备区间会漂移", spark: series("hw"), color: "b" }),
    tile({ k: "shr", ic: "pulse", lb: "睡眠平均心率", val: r.shr ?? "—", unit: "bpm",
      sub: `参考区间 ${sr[0]}–${sr[1]}`, mark: r.shr != null && (r.shr < sr[0] || r.shr > sr[1]), spark: series("shr"), color: "c" }),
    tile({ k: "cont", ic: "layers", lb: "深睡连续性", val: r.cont ?? "—", unit: "分",
      sub: `个人下限 ${T.CONT_LO}`, mark: r.cont != null && r.cont < T.CONT_LO, spark: series("cont"), color: "b" }),
    tile({ k: "dur", ic: "moon", lb: "睡眠时长", val: r.dur != null ? fmtDur(r.dur) : "—", unit: "",
      sub: [r.bed ? "入睡 " + r.bed : "", meta.sleep?.wake_time ? "醒 " + meta.sleep.wake_time : "", meta.sleep?.score != null ? "评分 " + meta.sleep.score : ""].filter(Boolean).join(" · "), spark: series("dur") }),
    tile({ k: "deep", ic: "moon", lb: "深睡 / REM", val: (r.deep != null ? r.deep + "%" : "—") + " / " + (r.rem != null ? r.rem + "%" : "—"), unit: "",
      sub: r.wake != null ? "觉醒 " + r.wake + " 次" : "", spark: series("deep"), color: "b" }),
    tile({ k: "hrr", ic: "clock", lb: "HRR · 手动 1 分钟", val: hp != null ? r.hrr0 - r.hrr1 : "—", unit: hp != null ? "bpm" : "",
      sub: hp != null ? `${r.hrr0}→${r.hrr1} bpm · 归一化 ${hp.toFixed(1)}% · ${meta.hrr?.timing_protocol === "unconfirmed" ? "计时起点未确认 · " : ""}${T.HRR_BAND_ENABLED ? `带 ${T.HRR_LO}–${T.HRR_HI}` : "旧口径带已停用·仅记录"}` : (meta.hrr?.drop != null ? `用户报告下降 ${meta.hrr.drop} bpm · 起止心率未提供` : "未测量"),
      mark: hrrOut(hp), spark: series((x) => hrrNorm(x)), color: "c" }),
    tile({ k: "pro", ic: "egg", lb: "蛋白", val: r.pro ?? "—", unit: r.pro != null ? "g" : "",
      sub: `目标带 ${T.PRO_LO}–${T.PRO_HI} g · 估算值`, mark: r.pro != null && r.pro < T.PRO_LO, spark: series("pro"), color: "c" }),
    tile({ k: "w", ic: "scale", lb: "体重 · 上午记录", val: wm ? wm.kg.toFixed(2) : "—", unit: "kg",
      sub: wm ? `${wm.time} · 标准条件${wm.protocol_confirmed ? "已确认" : "未确认"}${wa ? ` · 7 日均值 ${wa.value.toFixed(2)} kg n=${wa.n}` : ""}` : "尚无结构化记录", spark: wSeries.filter((v) => v != null).length >= 2 ? wSeries : null, color: "b" }),
    tile({ k: "kcal", ic: "fire", lb: "饮食热量估计", val: r.kcal ?? "—", unit: r.kcal != null ? "kcal" : "", sub: kcalSub, spark: series("kcal") }),
  ].join("");

  const cat = typeCat(r.type);
  const facts = [
    r.km != null ? ["距离", r.km, "km"] : null,
    r.pace ? ["配速", fmtPace(r.pace), ""] : null,
    r.hr != null ? ["均心率", r.hr, "bpm"] : null,
    r.hrmax != null ? ["峰值", r.hrmax, "bpm"] : null,
    r.load != null ? ["负荷", r.load, ""] : null,
    r.tsec != null ? ["时长", fmtTsec(r.tsec), ""] : null,
    strengthTotal(r).value != null ? ["容量", strengthTotal(r).value, "kg"] : null,
    r.cad != null ? ["步频", r.cad, "spm"] : null,
    r.gct != null ? ["触地", r.gct, "ms"] : null,
    r.rec != null ? ["恢复提示", r.rec, "h"] : null,
  ].filter(Boolean);
  const sessions = meta.sessions || [];
  const dayTot = meta.day_totals;
  const train = `<div class="train glass lit cat-${cat}">
    <div class="tr-head">
      <span class="tr-ic">${icon(cat === "run" ? "run" : cat === "rest" ? "moon" : cat === "none" ? "info" : "dumbbell")}</span>
      <div><div class="eyebrow">训练 · ${CAT_LABEL[cat]}</div><div class="tr-type">${esc(r.type || "训练未报告")}</div>
      <div class="note">${[r.shoe, cat === "none" ? "未报告训练不等于休息" : ""].filter(Boolean).map(esc).join(" · ") || "&nbsp;"}</div></div>
    </div>
    ${facts.length ? `<div class="facts">${facts.map(([k, v, u]) => `<div class="fact"><span class="fk">${k}</span><span class="fv num">${esc(v)}<small>${u}</small></span></div>`).join("")}</div>` : ""}
    ${sessions.length ? `<div class="sessions"><div class="eyebrow">逐课记录 · ${sessions.length} 课${dayTot?.scope ? " · " + esc(dayTot.scope) : ""}</div>
      <ol>${sessions.map((x) => `<li><span class="s-time">${esc(x.start || "—")}</span><span class="s-dot ${x.kind === "run" ? "run" : "str"}"></span>
        <span class="s-body"><b>${esc(x.name || (x.kind === "run" ? "跑步" : "力量"))}</b>
        <span class="note">${[x.km != null ? esc(String(x.km)) + " km" : null, x.tsec != null ? esc(fmtTsec(x.tsec)) : null, x.hr != null ? "均心 " + esc(String(x.hr)) : null, x.vol != null ? "容量 " + esc(String(x.vol)) + " kg" : null, `活动 ${esc(String(x.active_kcal ?? "—"))} / 总 ${esc(String(x.total_kcal ?? "—"))} kcal`].filter(Boolean).join(" · ")}</span></span></li>`).join("")}</ol>
      ${dayTot ? `<div class="note">全天：${[dayTot.run_km != null ? "跑量 " + dayTot.run_km + " km" : null, dayTot.training_tsec != null ? "训练 " + fmtTsec(dayTot.training_tsec) : null, dayTot.active_kcal != null ? `活动 ${dayTot.active_kcal} / 总 ${dayTot.total_kcal} kcal（不相加）` : null].filter(Boolean).join(" · ")}</div>` : ""}
    </div>` : ""}
  </div>`;

  const items = judge(state.recs, r.d);
  const jHtml = items.length
    ? items.map((it) => `<li class="j-item"><span class="j-dot ${it.level}"></span><div><p>${esc(it.text)}</p><span class="j-tag">${it.tag} · ${it.level === "warn" ? "警示" : "提示"}</span></div></li>`).join("")
    : `<li class="j-item ok"><span class="j-dot ok">${icon("check")}</span><div><p>已记录指标未触发当前提示规则；缺测项目未参与判断。</p><span class="j-tag">观测结论</span></div></li>`;

  const feelQuote = typeof r.feel === "string" ? `<blockquote class="voice glass">${icon("quote")}<p>${esc(r.feel)}</p><cite>当日自述 · 原文</cite></blockquote>` : "";

  const stripRecs = recs.slice(Math.max(0, idx - 20), Math.min(recs.length, idx + 8));
  const strip = `<div class="day-strip" role="listbox" aria-label="选择日期">${stripRecs.map((x) => {
    const xp = utcParts(x.d);
    return `<button class="ds-day${x.d === r.d ? " on" : ""}" data-d="${x.d}" role="option" aria-selected="${x.d === r.d}" title="${x.d} · ${CAT_LABEL[typeCat(x.type)]}">
      <span class="ds-wk">${WK[xp.dow]}</span><span class="ds-n num">${xp.day}</span><span class="ds-dot c-${typeCat(x.type)}"></span></button>`;
  }).join("")}</div>`;

  el.innerHTML = `
    <div class="sec-head rise"><span class="eyebrow">§1 当日观测 · Daily Observation</span><span class="note">判定为提示而非诊断 · 越界 = 值得看一眼</span></div>
    <section class="hero glass rise${pos === "out" ? " warm" : ""}">
      <div class="h-date">
        <div class="eyebrow">${y} · 星期${WK[dow]} · 第 ${idx + 1} / ${recs.length} 天</div>
        <div class="h-big num">${pad2(m + 1)}<i>.</i>${pad2(day)}</div>
        <div class="day-nav">
          <button class="icon-btn" id="dayPrev" aria-label="前一天" title="前一天（←）" ${idx <= 0 ? "disabled" : ""}>${icon("left")}</button>
          <button class="icon-btn" id="dayNext" aria-label="后一天" title="后一天（→）" ${idx >= recs.length - 1 ? "disabled" : ""}>${icon("right")}</button>
          ${idx < recs.length - 1 ? `<button class="chip" id="dayToday" title="跳到最新一天">最新</button>` : `<span class="pill"><span class="dot"></span>最新一天</span>`}
        </div>
        <div class="h-chips">
          <span class="pill">${icon("moon", "ic-xs")}${r.dur != null ? fmtDur(r.dur) : "睡眠未记录"}</span>
          <span class="pill">${icon(cat === "run" ? "run" : "dumbbell", "ic-xs")}${CAT_LABEL[cat]}</span>
          ${wm ? `<span class="pill">${icon("scale", "ic-xs")}${wm.kg.toFixed(2)} kg</span>` : ""}
        </div>
      </div>
      <div class="h-orb">
        <div class="orb-slot"></div>
        <div class="orb-read">
          <span class="orb-lb">${orbLb}</span>
          <span class="orb-v num">${orbV}<small>${orbU}</small></span>
          <span class="orb-st ${orbTone}">${orbSt}</span>
        </div>
      </div>
      <div class="h-band">
        <div class="eyebrow">相对锁定基线的位置 · lnRMSSD</div>
        ${gauge}
        ${elMissing}
        <p class="note base-note">${baseNote}</p>
      </div>
    </section>
    ${strip}
    ${feelQuote}
    <div class="tiles">${tiles}</div>
    <div class="today-split">
      ${train}
      <div class="judge glass">
        <div class="j-head">${icon("spark")}<span>观测提示 · 自动判定</span></div>
        <ul>${jHtml}</ul>
        <p class="note">提示只说明「数值越过了某条线」，缺测、口径差异与当日背景需要你自己结合判断。</p>
      </div>
    </div>
    ${r.flag ? `<details class="record glass"><summary>${icon("book")}<span>完整当日记录与来源说明</span><span class="note">${r.flag.length} 字</span></summary><div class="record-body">${esc(r.flag).split(/\s{1,}(?=\d{1,2}月\d{1,2}日|【)/).map((p) => `<p>${p}</p>`).join("")}</div></details>` : ""}
    ${r.note ? `<p class="note" style="margin-top:12px">备注：${esc(r.note)}</p>` : ""}
  `;

  if (!orbCanvas) {
    orbCanvas = document.createElement("canvas");
    orbCanvas.className = "orb";
    orbCanvas.setAttribute("aria-hidden", "true");
  }
  $(".orb-slot", el).appendChild(orbCanvas);
  if (!orb) orb = mountOrb(orbCanvas, orbTone); else orb.setTone(orbTone);

  $("#dayPrev").onclick = () => { if (idx > 0) { state.sel = recs[idx - 1].d; renderToday(); } };
  $("#dayNext").onclick = () => { if (idx < recs.length - 1) { state.sel = recs[idx + 1].d; renderToday(); } };
  const dtBtn = $("#dayToday");
  if (dtBtn) dtBtn.onclick = () => { state.sel = recs[recs.length - 1].d; renderToday(); };
  el.querySelectorAll(".ds-day").forEach((b) => (b.onclick = () => { state.sel = b.dataset.d; renderToday(); }));
  const on = $(".ds-day.on", el);
  if (on) { const s = on.parentElement; s.scrollLeft = on.offsetLeft - s.clientWidth / 2 + on.clientWidth / 2; }
}
