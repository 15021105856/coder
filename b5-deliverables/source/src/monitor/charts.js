/* 手写 SVG 图表：时间轴 + 多序列 + 参考带 + 悬浮十字线。
   视觉为光感渐变；越界点用暖光脉冲环标出，其余一律冷色。 */
import { dayMs, pad2, esc, fmtPace } from "./core.js";

const chartCfg = new WeakMap();
const chartRo = new WeakMap();
/** 每容器固定命名空间；每次重绘序号从 0 起，避免长会话 id 无限增长 */
const chartNs = new WeakMap();
const chartSeq = new WeakMap();
let sparkSeq = 0;

function uidFor(container) {
  if (!chartNs.has(container)) chartNs.set(container, `c${Math.random().toString(36).slice(2, 9)}`);
  const seq = (chartSeq.get(container) ?? 0) + 1;
  chartSeq.set(container, seq);
  return `${chartNs.get(container)}-${seq}`;
}

function beginChartDraw(container) {
  chartSeq.set(container, 0);
  return uidFor(container);
}

/** 视图整页重绘时重置迷你图序号（通常个位数） */
export function resetSparklineIds() {
  sparkSeq = 0;
}

function observeChartResize(container) {
  if (chartRo.has(container)) return;
  let raf = 0, lastW = 0;
  const ro = new ResizeObserver(() => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const w = Math.max(280, container.clientWidth - 4);
      if (Math.abs(w - lastW) <= 4) return;
      lastW = w;
      const cfg = chartCfg.get(container);
      if (cfg) drawChart(container, cfg);
    });
  });
  ro.observe(container);
  chartRo.set(container, ro);
}

const COLORS = {
  a: ["var(--cyan)", "var(--accent)"],
  b: ["var(--accent-2)", "#ff7fc8"],
  c: ["var(--mint)", "var(--cyan)"],
};

/* 单调三次插值：曲线圆润且不过冲，不会画出数据里不存在的峰谷 */
function smoothPath(pts) {
  if (pts.length < 2) return "";
  if (pts.length === 2) return `M${pts[0][0]},${pts[0][1]}L${pts[1][0]},${pts[1][1]}`;
  const n = pts.length, d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) d.push((pts[i + 1][1] - pts[i][1]) / (pts[i + 1][0] - pts[i][0] || 1));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  let p = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = (pts[i + 1][0] - pts[i][0]) / 3;
    p += `C${(pts[i][0] + h).toFixed(1)},${(pts[i][1] + m[i] * h).toFixed(1)} ${(pts[i + 1][0] - h).toFixed(1)},${(pts[i + 1][1] - m[i + 1] * h).toFixed(1)} ${pts[i + 1][0].toFixed(1)},${pts[i + 1][1].toFixed(1)}`;
  }
  return p;
}

function defs(uid, extra = "") {
  let s = `<defs>`;
  for (const [k, [c1, c2]] of Object.entries(COLORS)) {
    s += `<linearGradient id="ln-${k}-${uid}" x1="0" x2="1" y1="0" y2="0"><stop offset="0" style="stop-color:${c1}"/><stop offset="1" style="stop-color:${c2}"/></linearGradient>`;
    s += `<linearGradient id="ar-${k}-${uid}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" style="stop-color:${c2};stop-opacity:.32"/><stop offset="1" style="stop-color:${c2};stop-opacity:0"/></linearGradient>`;
    s += `<linearGradient id="br-${k}-${uid}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" style="stop-color:${c1}"/><stop offset="1" style="stop-color:${c2};stop-opacity:.55"/></linearGradient>`;
  }
  s += `<linearGradient id="band-${uid}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" style="stop-color:var(--cyan);stop-opacity:.16"/><stop offset=".5" style="stop-color:var(--accent);stop-opacity:.10"/><stop offset="1" style="stop-color:var(--cyan);stop-opacity:.16"/></linearGradient>`;
  return s + extra + `</defs>`;
}

/* 共用悬浮绑定：最近点吸附 + 十字线 + 悬浮框 */
export function bindTip(container, W, allPts, htmlFn) {
  const svg = container.querySelector("svg");
  const ovl = svg.querySelector(".ovl");
  const xh = svg.querySelector(".xh");
  const dot = svg.querySelector(".xh-dot");
  const tip = container.parentElement.querySelector(".chart-tip");
  function nearest(clientX) {
    const rect = svg.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * W;
    let best = null, bd = Infinity;
    for (const p of allPts) { const dd = Math.abs(p.x - px); if (dd < bd) { bd = dd; best = p; } }
    return best;
  }
  function show(e) {
    const p = nearest(e.clientX);
    if (!p || !tip) return;
    xh.setAttribute("x1", p.x); xh.setAttribute("x2", p.x); xh.setAttribute("visibility", "visible");
    if (dot) { dot.setAttribute("cx", p.x); dot.setAttribute("cy", p.y); dot.setAttribute("visibility", "visible"); }
    tip.innerHTML = htmlFn(p);
    tip.classList.add("on");
    const rect = svg.getBoundingClientRect();
    const body = tip.parentElement;
    const bodyRect = body.getBoundingClientRect();
    const cx = rect.left - bodyRect.left + (p.x / W) * rect.width;
    let left = cx + 16;
    if (left + tip.offsetWidth > body.clientWidth - 8) left = cx - tip.offsetWidth - 16;
    tip.style.left = Math.max(8, Math.min(left, body.clientWidth - tip.offsetWidth - 8)) + "px";
    tip.style.top = (rect.top - bodyRect.top + 6) + "px";
  }
  function hide() {
    xh.setAttribute("visibility", "hidden");
    if (dot) dot.setAttribute("visibility", "hidden");
    tip?.classList.remove("on");
  }
  ovl.addEventListener("pointermove", show);
  ovl.addEventListener("pointerdown", show);
  ovl.addEventListener("pointerleave", hide);
}

function xTicks(xMin, xMax, W, sx, padT, ih, H) {
  const dayN = Math.round((xMax - xMin) / 86400000);
  const step = W < 390 ? (dayN <= 14 ? 4 : dayN <= 35 ? 10 : 21) : (dayN <= 14 ? 2 : dayN <= 35 ? 7 : 14);
  const t0 = xMin + 43200000, t1 = xMax - 43200000;
  let s = "";
  for (let k = 0; ; k++) {
    const t = t0 + k * step * 86400000;
    if (t > t1) break;
    const x = sx(t), dt = new Date(t);
    s += `<line x1="${x}" y1="${padT}" x2="${x}" y2="${padT + ih}" stroke="var(--grid)" stroke-width="1" stroke-dasharray="2 5"/>`;
    s += `<text x="${x}" y="${H - 6}" text-anchor="middle" class="ax">${dt.getMonth() + 1}/${dt.getDate()}</text>`;
  }
  return { s, dayN };
}

/* cfg: { series:[{values:[{d,y,flag,fill}], line, points, dash, axis, bar, color, area, lineW}],
          bands, hlines, marks, logY, yTicks, yFmt, y2Ticks, y2Fmt, yDomain, y2Domain,
          xMin, xMax, height, hasY2, refSpan, tipFn(rec,p), findRec } */
export function drawChart(container, cfg) {
  chartCfg.set(container, cfg);
  const uid = beginChartDraw(container);
  let W = Math.max(280, container.clientWidth - 4);
  requestAnimationFrame(() => {
    const w2 = Math.max(280, container.clientWidth - 4);
    if (Math.abs(w2 - W) > 4) drawChart(container, cfg);
  });
  const H = cfg.height || 240;
  const padL = cfg.padL != null ? cfg.padL : 44;
  const padR = cfg.hasY2 ? 46 : 14;
  const padT = 14, padB = cfg.padB != null ? cfg.padB : 24;
  const iw = W - padL - padR, ih = H - padT - padB;
  const { xMin, xMax } = cfg;
  const sx = (t) => padL + ((t - xMin) / (xMax - xMin)) * iw;

  function domain(axis) {
    let lo = Infinity, hi = -Infinity;
    const L = (v) => (cfg.logY && axis === 0 ? Math.log(v) : v);
    for (const s of cfg.series) {
      if ((s.axis || 0) !== axis) continue;
      for (const p of s.values) { if (p.y == null) continue; const v = L(p.y); if (v < lo) lo = v; if (v > hi) hi = v; }
    }
    for (const b of cfg.bands || []) if ((b.axis || 0) === axis) { const a = L(b.lo), c = L(b.hi); if (a < lo) lo = a; if (c > hi) hi = c; }
    for (const h of cfg.hlines || []) if ((h.axis || 0) === axis) { const v = L(h.y); if (v < lo) lo = v; if (v > hi) hi = v; }
    const fixed = axis === 0 ? cfg.yDomain : cfg.y2Domain;
    if (Array.isArray(fixed) && fixed.length === 2 && fixed.every(Number.isFinite) && fixed[1] > fixed[0]) return fixed;
    if (!isFinite(lo)) { lo = 0; hi = 1; }
    const hasBars = cfg.series.some((s) => (s.axis || 0) === axis && s.bar);
    if (hasBars && !cfg.logY) { lo = Math.min(0, lo); hi = Math.max(0, hi); }
    const padv = (hi - lo) * 0.08 || 1;
    return [hasBars && lo === 0 ? 0 : lo - padv, hi + padv];
  }
  const d0 = domain(0), d1 = cfg.hasY2 ? domain(1) : null;
  const mapY = (v, axis) => {
    const dom = axis === 1 ? d1 : d0;
    const vv = cfg.logY && axis === 0 ? Math.log(v) : v;
    return padT + ih - ((vv - dom[0]) / (dom[1] - dom[0])) * ih;
  };

  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(cfg.aria || "数据图表")}" class="chart">${defs(uid)}`;
  const xt = xTicks(xMin, xMax, W, sx, padT, ih, H);
  s += xt.s;
  const dayN = xt.dayN;
  for (const v of cfg.yTicks || []) {
    const y = mapY(v, 0);
    if (y < padT - 1 || y > padT + ih + 1) continue;
    s += `<line x1="${padL}" y1="${y}" x2="${padL + iw}" y2="${y}" stroke="var(--grid)" stroke-width="1"/>`;
    s += `<text x="${padL - 8}" y="${y + 3.5}" text-anchor="end" class="ax">${esc(cfg.yFmt ? cfg.yFmt(v) : v)}</text>`;
  }
  if (cfg.hasY2) for (const v of cfg.y2Ticks || []) {
    const y = mapY(v, 1);
    if (y < padT - 1 || y > padT + ih + 1) continue;
    s += `<text x="${padL + iw + 8}" y="${y + 3.5}" text-anchor="start" class="ax ax2">${esc(cfg.y2Fmt ? cfg.y2Fmt(v) : v)}</text>`;
  }
  for (const b of cfg.bands || []) {
    const y0 = mapY(b.hi, b.axis || 0), y1 = mapY(b.lo, b.axis || 0);
    const stroke = (b.axis || 0) === 1 ? "var(--accent-2)" : "var(--cyan)";
    s += `<rect x="${padL}" y="${y0}" width="${iw}" height="${Math.max(1, y1 - y0)}" fill="url(#band-${uid})" rx="6"/>`;
    s += `<line x1="${padL}" y1="${y0}" x2="${padL + iw}" y2="${y0}" stroke="${stroke}" stroke-opacity=".55" stroke-width="1"/>`;
    s += `<line x1="${padL}" y1="${y1}" x2="${padL + iw}" y2="${y1}" stroke="${stroke}" stroke-opacity=".55" stroke-width="1"/>`;
    if (b.label) s += `<text x="${padL + iw - 6}" y="${y0 - 5}" text-anchor="end" class="ax lb-band">${esc(b.label)}</text>`;
  }
  for (const h of cfg.hlines || []) {
    const y = mapY(h.y, h.axis || 0);
    s += `<line x1="${padL}" y1="${y}" x2="${padL + iw}" y2="${y}" stroke="var(--faint)" stroke-width="1" ${h.dash ? 'stroke-dasharray="5 5"' : ""}/>`;
    if (h.label) s += `<text x="${padL + 6}" y="${y - 5}" class="ax">${esc(h.label)}</text>`;
  }

  const allPts = [];
  for (const sr of cfg.series) {
    const axis = sr.axis || 0;
    const col = sr.color || (axis === 1 ? "b" : "a");
    const pts = sr.values.filter((p) => p.y != null);
    if (sr.bar) {
      const bw = Math.max(4, Math.min(16, (iw / Math.max(1, dayN + 1)) * 0.58));
      const y0 = mapY(0, axis);
      s += `<g class="bars">`;
      pts.forEach((p, i) => {
        const x = sx(dayMs(p.d)), y = mapY(p.y, axis);
        const top = Math.min(y, y0), hh = Math.abs(y0 - y);
        s += `<rect class="bar" style="--i:${i}" x="${x - bw / 2}" y="${top}" width="${bw}" height="${hh}" rx="${Math.min(bw / 2, 4)}" fill="${p.fill || `url(#br-${col}-${uid})`}" ${p.flag ? 'fill-opacity="0.35"' : ""}/>`;
        allPts.push({ x, y, d: p.d, flag: p.flag });
      });
      s += `</g>`;
    } else {
      const xy = pts.map((p) => [sx(dayMs(p.d)), mapY(p.y, axis)]);
      if (sr.line && pts.length > 1) {
        const path = smoothPath(xy);
        if (sr.area) s += `<path d="${path}L${xy.at(-1)[0]},${padT + ih}L${xy[0][0]},${padT + ih}Z" fill="url(#ar-${col}-${uid})" class="area"/>`;
        s += `<path d="${path}" fill="none" stroke="url(#ln-${col}-${uid})" stroke-width="${(sr.lineW || 1.8) * 3.2}" stroke-opacity=".14" stroke-linejoin="round" stroke-linecap="round"/>`;
        s += `<path class="ln" pathLength="1" d="${path}" fill="none" stroke="url(#ln-${col}-${uid})" stroke-width="${sr.lineW || 1.8}" ${sr.dash ? 'stroke-dasharray="5 5" data-dash="1"' : ""} stroke-linejoin="round" stroke-linecap="round"/>`;
      }
      if (sr.points !== false) {
        const stroke = col === "b" ? "var(--accent-2)" : col === "c" ? "var(--mint)" : "var(--cyan)";
        pts.forEach((p, i) => {
          const [x, y] = xy[i];
          if (p.flag) s += `<circle cx="${x}" cy="${y}" r="3.4" fill="var(--dotfill)" stroke="${stroke}" stroke-width="1.4" stroke-dasharray="2.4 2"/>`;
          else s += `<circle cx="${x}" cy="${y}" r="2.7" fill="var(--dotfill)" stroke="${stroke}" stroke-width="1.6"/>`;
          allPts.push({ x, y, d: p.d, flag: p.flag });
        });
      } else {
        pts.forEach((p, i) => allPts.push({ x: xy[i][0], y: xy[i][1], d: p.d, flag: p.flag }));
      }
    }
  }

  if (cfg.refSpan) {
    const x0 = sx(dayMs(cfg.refSpan.t0)), x1 = sx(dayMs(cfg.refSpan.t1));
    s += `<rect x="${x0}" y="${padT}" width="${Math.max(1, x1 - x0)}" height="${ih}" fill="var(--wash)" rx="8"/>`;
    s += `<line x1="${x0}" y1="${padT}" x2="${x0}" y2="${padT + ih}" stroke="var(--accent)" stroke-opacity=".5" stroke-dasharray="2 4"/>`;
    s += `<line x1="${x1}" y1="${padT}" x2="${x1}" y2="${padT + ih}" stroke="var(--accent)" stroke-opacity=".5" stroke-dasharray="2 4"/>`;
    s += `<text x="${(x0 + x1) / 2}" y="${padT + 13}" text-anchor="middle" class="ax lb-ref">${esc(cfg.refSpan.label)}</text>`;
  }

  const marks = cfg.marks || [];
  const lastMark = marks.reduce((a, m) => (!a || m.d > a.d ? m : a), null);
  for (const m of marks) {
    const x = sx(dayMs(m.d)), y = mapY(m.y, m.axis || 0);
    if (m === lastMark) s += `<circle class="mk-pulse" cx="${x}" cy="${y}" r="7" fill="none" stroke="var(--warm)" stroke-width="1.5"/>`;
    s += `<circle cx="${x}" cy="${y}" r="5.5" fill="var(--warm)" fill-opacity=".28" stroke="var(--warm)" stroke-width="1.2"/>`;
    s += `<circle cx="${x}" cy="${y}" r="2.2" fill="var(--warm-2)"/>`;
  }

  s += `<line x1="${padL}" y1="${padT + ih}" x2="${padL + iw}" y2="${padT + ih}" stroke="var(--faint)" stroke-opacity=".6" stroke-width="1"/>`;
  s += `<line class="xh" x1="0" y1="${padT}" x2="0" y2="${padT + ih}" stroke="var(--accent)" stroke-width="1" stroke-dasharray="3 3" visibility="hidden"/>`;
  s += `<circle class="xh-dot" r="5" fill="none" stroke="var(--ink)" stroke-width="1.5" visibility="hidden"/>`;
  s += `<rect class="ovl" x="${padL}" y="${padT}" width="${iw}" height="${ih}" fill="transparent"/></svg>`;

  container.innerHTML = s;
  if (cfg.tipFn) bindTip(container, W, allPts, (p) => cfg.tipFn(cfg.findRec?.(p.d), p));
  observeChartResize(container);
}

export function drawScatterPw(container, recs, findRec) {
  const pts = recs.filter((r) => r.pw != null && r.hr != null && r.shoe);
  const W = Math.max(280, container.clientWidth - 4), H = 250;
  const padL = 44, padR = 14, padT = 14, padB = 34, iw = W - padL - padR, ih = H - padT - padB;
  if (!pts.length) { container.innerHTML = `<div class="empty">暂无可绘制的数据（需同时记录功率、心率与鞋款）。</div>`; return; }
  const xs = pts.map((p) => p.hr), ys = pts.map((p) => p.pw);
  const x0 = Math.min(...xs) - 2, x1 = Math.max(...xs) + 2, y0 = Math.min(...ys) - 12, y1 = Math.max(...ys) + 12;
  const sx = (v) => padL + ((v - x0) / (x1 - x0)) * iw, sy = (v) => padT + ih - ((v - y0) / (y1 - y0)) * ih;
  const shoes = [...new Set(pts.map((p) => p.shoe))];
  const cols = ["var(--cyan)", "var(--accent-2)", "var(--mint)"];
  const shape = (sh, x, y) => {
    const i = shoes.indexOf(sh), c = cols[i % 3];
    if (i % 3 === 0) return `<circle cx="${x}" cy="${y}" r="4.2" fill="${c}" fill-opacity=".22" stroke="${c}" stroke-width="1.6"/>`;
    if (i % 3 === 1) return `<rect x="${x - 3.8}" y="${y - 3.8}" width="7.6" height="7.6" rx="2" fill="${c}" fill-opacity=".22" stroke="${c}" stroke-width="1.6"/>`;
    return `<path d="M${x} ${y - 4.6} L${x + 4.2} ${y + 3.3} L${x - 4.2} ${y + 3.3} Z" fill="${c}" fill-opacity=".22" stroke="${c}" stroke-width="1.6"/>`;
  };
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="功率心率散点图" class="chart">`;
  for (let v = Math.ceil(x0 / 5) * 5; v <= x1; v += 5) {
    s += `<line x1="${sx(v)}" y1="${padT}" x2="${sx(v)}" y2="${padT + ih}" stroke="var(--grid)" stroke-dasharray="2 5"/>`;
    s += `<text x="${sx(v)}" y="${H - 18}" text-anchor="middle" class="ax">${v}</text>`;
  }
  s += `<text x="${padL + iw / 2}" y="${H - 3}" text-anchor="middle" class="ax">平均心率 bpm</text>`;
  for (let v = Math.ceil(y0 / 20) * 20; v <= y1; v += 20) {
    s += `<line x1="${padL}" y1="${sy(v)}" x2="${padL + iw}" y2="${sy(v)}" stroke="var(--grid)"/>`;
    s += `<text x="${padL - 8}" y="${sy(v) + 3.5}" text-anchor="end" class="ax">${v}</text>`;
  }
  const allPts = [];
  for (const p of pts) { const x = sx(p.hr), y = sy(p.pw); s += shape(p.shoe, x, y); allPts.push({ x, y, d: p.d }); }
  s += `<line x1="${padL}" y1="${padT + ih}" x2="${padL + iw}" y2="${padT + ih}" stroke="var(--faint)" stroke-opacity=".6"/>`;
  s += `<line class="xh" x1="0" y1="${padT}" x2="0" y2="${padT + ih}" stroke="var(--accent)" stroke-dasharray="3 3" visibility="hidden"/>`;
  s += `<circle class="xh-dot" r="6" fill="none" stroke="var(--ink)" stroke-width="1.5" visibility="hidden"/>`;
  s += `<rect class="ovl" x="${padL}" y="${padT}" width="${iw}" height="${ih}" fill="transparent"/></svg>`;
  s += `<div class="legend">` + shoes.map((sh, i) => `<span><i class="lg-sym s${i % 3}"></i>${esc(sh)}</span>`).join("") + `</div>`;
  container.innerHTML = s;
  bindTip(container, W, allPts, (p) => {
    const r = findRec(p.d); if (!r) return "";
    return `<div class="t-d">${r.d}</div>
      <div class="t-row"><span class="k">功率</span><span>${r.pw} W</span></div>
      <div class="t-row"><span class="k">均心率</span><span>${r.hr} bpm</span></div>
      <div class="t-row"><span class="k">配速</span><span>${esc(fmtPace(r.pace))}</span></div>
      <div class="t-row"><span class="k">鞋款</span><span>${esc(r.shoe)}</span></div>`;
  });
}

export function drawSleepStack(container, recs, findRec) {
  const pts = recs.filter((r) => r.deep != null || r.rem != null);
  const W = Math.max(280, container.clientWidth - 4), H = 230;
  const padL = 40, padR = 14, padT = 14, padB = 24, iw = W - padL - padR, ih = H - padT - padB;
  if (!pts.length) { container.innerHTML = `<div class="empty">暂无睡眠结构数据。</div>`; return; }
  const xMin = dayMs(pts[0].d) - 43200000, xMax = dayMs(pts[pts.length - 1].d) + 43200000;
  const dayN = Math.round((xMax - xMin) / 86400000);
  const sx = (t) => padL + ((t - xMin) / (xMax - xMin)) * iw;
  const bw = Math.max(4, Math.min(14, (iw / Math.max(1, dayN)) * 0.62));
  const uid = beginChartDraw(container);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="睡眠结构堆叠图" class="chart"><defs>
    <linearGradient id="sd-${uid}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" style="stop-color:var(--accent-2)"/><stop offset="1" style="stop-color:var(--accent)"/></linearGradient>
    <linearGradient id="sr-${uid}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" style="stop-color:var(--cyan)"/><stop offset="1" style="stop-color:var(--mint)"/></linearGradient></defs>`;
  const step = dayN <= 14 ? 2 : dayN <= 35 ? 7 : 14;
  for (let k = 0; ; k++) {
    const t = xMin + 43200000 + k * step * 86400000;
    if (t > xMax - 43200000) break;
    const x = sx(t), dt = new Date(t);
    s += `<text x="${x}" y="${H - 6}" text-anchor="middle" class="ax">${dt.getMonth() + 1}/${dt.getDate()}</text>`;
  }
  for (const v of [0, 25, 50, 75, 100]) {
    const y = padT + ih - (v / 100) * ih;
    s += `<line x1="${padL}" y1="${y}" x2="${padL + iw}" y2="${y}" stroke="var(--grid)"/>`;
    s += `<text x="${padL - 8}" y="${y + 3.5}" text-anchor="end" class="ax">${v}%</text>`;
  }
  const allPts = [];
  pts.forEach((p, i) => {
    const deep = p.deep || 0, rem = p.rem || 0, light = Math.max(0, 100 - deep - rem);
    const x = sx(dayMs(p.d));
    let yAcc = padT + ih;
    const seg = (h, fill, op) => { const hh = (h / 100) * ih; yAcc -= hh; s += `<rect x="${x - bw / 2}" y="${yAcc}" width="${bw}" height="${hh}" fill="${fill}" fill-opacity="${op}"/>`; };
    s += `<g class="bar" style="--i:${i}">`;
    seg(deep, `url(#sd-${uid})`, 1); seg(rem, `url(#sr-${uid})`, 0.85); seg(light, "var(--ink)", 0.08);
    s += `</g>`;
    if (p.flag) s += `<rect x="${x - bw / 2}" y="${padT - 6}" width="${bw}" height="3" rx="1.5" fill="var(--faint)"/>`;
    allPts.push({ x, y: padT + ih / 2, d: p.d, flag: p.flag });
  });
  s += `<line class="xh" x1="0" y1="${padT}" x2="0" y2="${padT + ih}" stroke="var(--accent)" stroke-dasharray="3 3" visibility="hidden"/>`;
  s += `<rect class="ovl" x="${padL}" y="${padT}" width="${iw}" height="${ih}" fill="transparent"/></svg>`;
  s += `<div class="legend"><span><i class="lg-box" style="background:linear-gradient(var(--accent-2),var(--accent))"></i>深睡</span><span><i class="lg-box" style="background:linear-gradient(var(--cyan),var(--mint))"></i>REM</span><span><i class="lg-box" style="background:var(--ink);opacity:.15"></i>轻睡</span><span><i class="lg-box" style="background:var(--faint);height:3px"></i>当日有记录说明</span></div>`;
  container.innerHTML = s;
  bindTip(container, W, allPts, (p) => {
    const r = findRec(p.d); if (!r) return "";
    const light = Math.max(0, 100 - (r.deep || 0) - (r.rem || 0));
    return `<div class="t-d">${r.d}</div>
      <div class="t-row"><span class="k">深睡</span><span>${r.deep ?? "—"}%</span></div>
      <div class="t-row"><span class="k">REM</span><span>${r.rem ?? "—"}%</span></div>
      <div class="t-row"><span class="k">轻睡</span><span>${r.deep != null ? light + "%" : "—"}</span></div>
      <div class="t-row"><span class="k">总时长</span><span>${r.dur != null ? Math.floor(r.dur / 60) + "h" + pad2(r.dur % 60) + "m" : "—"}</span></div>`;
  });
}

/* 指标卡上的迷你走势线：最近 n 天，缺测断开，不带坐标 */
export function sparkline(values, { w = 120, h = 34, color = "a", markLast = true } = {}) {
  const pts = values.map((v, i) => [i, v]).filter(([, v]) => v != null);
  if (pts.length < 2) return `<svg class="spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"></svg>`;
  const ys = pts.map(([, v]) => v), lo = Math.min(...ys), hi = Math.max(...ys), span = hi - lo || 1;
  const n = values.length - 1 || 1;
  const xy = pts.map(([i, v]) => [2 + (i / n) * (w - 4), h - 4 - ((v - lo) / span) * (h - 8)]);
  const uid = `sp${++sparkSeq}`;
  const [c1, c2] = COLORS[color] || COLORS.a;
  const path = smoothPath(xy);
  const last = xy.at(-1);
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"><defs>
    <linearGradient id="sp-${uid}" x1="0" x2="1"><stop offset="0" style="stop-color:${c1};stop-opacity:.25"/><stop offset="1" style="stop-color:${c2}"/></linearGradient>
    <linearGradient id="sa-${uid}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" style="stop-color:${c2};stop-opacity:.22"/><stop offset="1" style="stop-color:${c2};stop-opacity:0"/></linearGradient></defs>
    <path d="${path}L${last[0]},${h}L${xy[0][0]},${h}Z" fill="url(#sa-${uid})"/>
    <path d="${path}" fill="none" stroke="url(#sp-${uid})" stroke-width="1.6" stroke-linecap="round"/>
    ${markLast ? `<circle cx="${last[0]}" cy="${last[1]}" r="2.6" fill="${c2}"/><circle cx="${last[0]}" cy="${last[1]}" r="5" fill="${c2}" fill-opacity=".2"/>` : ""}
  </svg>`;
}
