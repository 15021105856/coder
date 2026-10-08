/* 粒子光感：背景光粒子流 / 粒子光球 / 粒子文字。
   全部遵循 prefers-reduced-motion，页面不可见时暂停，dpr 上限 2。 */

import { STORAGE_KEYS } from "./release.js";
import { FIELDS } from "./schema.js";
import { validateDataset } from "./validate-dataset.js";
import { dataStamp } from "./stamp.js";
import { checkExpectedStamp } from "./release-runtime.js";

const EMPTY_DATASET = () => ({ data: [], _fields: FIELDS, _daily: {}, _invalid: true });

function showDatasetFatal(msg) {
  const b = document.getElementById("dsBanner");
  if (b) {
    b.textContent = msg;
    b.classList.add("on");
  }
  console.error("[physio-log]", msg);
}

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const isLight = () => document.documentElement.dataset.theme === "light";

const FX_KEY = STORAGE_KEYS.fx;

export function fxEnabled() {
  try { return localStorage.getItem(FX_KEY) !== "off"; } catch { return true; }
}
export function setFxEnabled(on) {
  try { localStorage.setItem(FX_KEY, on ? "on" : "off"); } catch (err) { void err; }
  document.body.classList.toggle("no-fx", !on);
  window.dispatchEvent(new CustomEvent("fx-toggle", { detail: on }));
}

const PALETTE_DARK = [[91, 140, 255], [154, 123, 255], [63, 224, 255], [120, 200, 255], [255, 140, 200]];
const PALETTE_LIGHT = [[10, 89, 247], [106, 76, 255], [0, 150, 210], [60, 120, 255], [220, 80, 150]];

/* ---------- 背景光粒子流 ---------- */
export function mountParticleField(canvas) {
  const ctx = canvas.getContext("2d");
  let W = 0, H = 0, dpr = 1, parts = [], raf = 0, t = 0, last = 0, running = false;
  const pointer = { x: -9999, y: -9999, active: false };

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.round(Math.min(240, Math.max(70, (W * H) / 7000)));
    parts = Array.from({ length: n }, () => spawn(true));
  }
  function spawn(anywhere) {
    return {
      x: Math.random() * W, y: anywhere ? Math.random() * H : H + 10,
      px: 0, py: 0,
      s: 0.35 + Math.random() * 0.9,
      r: Math.random() < 0.08 ? 1.6 + Math.random() * 1.2 : 0.5 + Math.random() * 1.1,
      c: Math.floor(Math.random() * 5),
      ph: Math.random() * Math.PI * 2,
      life: 400 + Math.random() * 900,
    };
  }
  function field(x, y) {
    return Math.sin(x * 0.0017 + t * 0.00011) * 1.6
      + Math.cos(y * 0.0021 - t * 0.00009) * 1.4
      + Math.sin((x + y) * 0.0007 + t * 0.00005) * 1.2 - 1.2;
  }
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (now - last < 30) return;
    const dt = Math.min(48, now - last); last = now; t = now;
    ctx.clearRect(0, 0, W, H);
    const light = isLight();
    const pal = light ? PALETTE_LIGHT : PALETTE_DARK;
    ctx.globalCompositeOperation = light ? "source-over" : "lighter";
    ctx.lineCap = "round";
    for (const p of parts) {
      p.px = p.x; p.py = p.y;
      const a = field(p.x, p.y);
      let vx = Math.cos(a) * p.s, vy = Math.sin(a) * p.s - 0.12;
      if (pointer.active) {
        const dx = p.x - pointer.x, dy = p.y - pointer.y, d2 = dx * dx + dy * dy;
        if (d2 < 32000) {
          const f = (1 - d2 / 32000) * 2.2;
          vx += (-dy / 120) * f + (dx / 160) * f;
          vy += (dx / 120) * f + (dy / 160) * f;
        }
      }
      p.x += vx * dt * 0.06; p.y += vy * dt * 0.06;
      p.life -= dt * 0.06;
      if (p.x < -20 || p.x > W + 20 || p.y < -20 || p.y > H + 20 || p.life < 0) {
        Object.assign(p, spawn(false), { x: Math.random() * W, y: Math.random() < 0.5 ? H + 8 : Math.random() * H });
        p.px = p.x; p.py = p.y;
        continue;
      }
      const tw = 0.55 + 0.45 * Math.sin(now * 0.002 + p.ph);
      const [r, g, b] = pal[p.c];
      const al = (light ? 0.38 : 0.62) * tw;
      ctx.strokeStyle = `rgba(${r},${g},${b},${al * 0.5})`;
      ctx.lineWidth = p.r;
      ctx.beginPath(); ctx.moveTo(p.px - vx * 6, p.py - vy * 6); ctx.lineTo(p.x, p.y); ctx.stroke();
      ctx.fillStyle = `rgba(${r},${g},${b},${al})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      if (p.r > 1.5 && !light) {
        ctx.fillStyle = `rgba(${r},${g},${b},${al * 0.12})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 5, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  function start() {
    if (running || reduced() || !fxEnabled()) return;
    running = true; last = performance.now(); raf = requestAnimationFrame(frame);
  }
  function stop() { running = false; cancelAnimationFrame(raf); }
  function drawStatic() { ctx.clearRect(0, 0, W, H); }

  resize();
  window.addEventListener("resize", () => { resize(); if (!running) drawStatic(); });
  window.addEventListener("pointermove", (e) => { pointer.x = e.clientX; pointer.y = e.clientY; pointer.active = true; }, { passive: true });
  window.addEventListener("pointerleave", () => { pointer.active = false; });
  document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));
  window.addEventListener("fx-toggle", (e) => (e.detail ? start() : (stop(), drawStatic())));
  start();
}

/* ---------- 粒子光球：颜色只描述读数所处区间，不代表评分 ---------- */
const ORB_TONES = {
  in:   { a: [64, 224, 255], b: [91, 140, 255], c: [154, 123, 255] },
  edge: { a: [154, 123, 255], b: [255, 181, 71], c: [91, 140, 255] },
  out:  { a: [255, 181, 71], b: [255, 106, 61], c: [255, 140, 200] },
  alt:  { a: [154, 123, 255], b: [91, 140, 255], c: [255, 140, 200] },
  none: { a: [150, 160, 200], b: [110, 120, 170], c: [170, 150, 220] },
};
export function mountOrb(canvas, tone = "in") {
  const ctx = canvas.getContext("2d");
  const N = 1100;
  const pts = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2, rad = Math.sqrt(1 - y * y), th = golden * i;
    pts.push({ x: Math.cos(th) * rad, y, z: Math.sin(th) * rad, ph: Math.random() * 6.28, k: Math.random() });
  }
  const ring = Array.from({ length: 140 }, () => ({ a: Math.random() * 6.28, r: 1.25 + Math.random() * 0.35, s: 0.2 + Math.random() * 0.5, y: (Math.random() - 0.5) * 0.12 }));
  let S = 0, dpr = 1, raf = 0, rotY = 0, tiltX = -0.35, tx = -0.35, ty = 0, alive = true;
  let cur = ORB_TONES[tone] || ORB_TONES.in, mix = 1, prev = cur;

  function size() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    S = canvas.clientWidth;
    canvas.width = canvas.height = S * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  const lerp = (a, b, m) => a.map((v, i) => Math.round(v + (b[i] - v) * m));
  function draw(now) {
    if (!alive) return;
    ctx.clearRect(0, 0, S, S);
    const light = isLight();
    ctx.globalCompositeOperation = light ? "source-over" : "lighter";
    if (mix < 1) mix = Math.min(1, mix + 0.03);
    const A = lerp(prev.a, cur.a, mix), B = lerp(prev.b, cur.b, mix), C = lerp(prev.c, cur.c, mix);
    const cx = S / 2, cy = S / 2, R = S * 0.3;
    const g = ctx.createRadialGradient(cx, cy, R * 0.1, cx, cy, R * 1.7);
    g.addColorStop(0, `rgba(${B},${light ? 0.18 : 0.3})`);
    g.addColorStop(0.55, `rgba(${C},${light ? 0.06 : 0.1})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
    tiltX += (tx - tiltX) * 0.05;
    rotY += 0.0042 + ty * 0.02;
    const cY = Math.cos(rotY), sY = Math.sin(rotY), cX = Math.cos(tiltX), sX = Math.sin(tiltX);
    const t = now * 0.001;
    for (const p of pts) {
      const breathe = 1 + 0.035 * Math.sin(t * 1.4 + p.ph) + (p.k > 0.97 ? 0.08 * Math.sin(t * 2 + p.ph) : 0);
      let x = p.x * breathe, y = p.y * breathe, z = p.z * breathe;
      const x1 = x * cY + z * sY, z1 = -x * sY + z * cY;
      const y2 = y * cX - z1 * sX, z2 = y * sX + z1 * cX;
      const persp = 1 / (1.9 - z2 * 0.6);
      const px = cx + x1 * R * persp * 1.6, py = cy + y2 * R * persp * 1.6;
      const depth = (z2 + 1) / 2;
      const col = depth > 0.5 ? lerp(B, A, (depth - 0.5) * 2) : lerp(C, B, depth * 2);
      const al = (light ? 0.25 : 0.18) + depth * (light ? 0.6 : 0.75);
      ctx.fillStyle = `rgba(${col},${al})`;
      const r = 0.45 + depth * 1.25;
      ctx.beginPath(); ctx.arc(px, py, r, 0, 6.283); ctx.fill();
    }
    for (const q of ring) {
      q.a += q.s * 0.006;
      const x = Math.cos(q.a) * q.r, z = Math.sin(q.a) * q.r, y = q.y;
      const y2 = y * cX - z * sX, z2 = y * sX + z * cX;
      const persp = 1 / (1.9 - z2 * 0.45);
      const px = cx + x * R * persp * 1.6, py = cy + y2 * R * persp * 1.6;
      const depth = (z2 + 1.6) / 3.2;
      ctx.fillStyle = `rgba(${A},${0.15 + depth * 0.55})`;
      ctx.beginPath(); ctx.arc(px, py, 0.5 + depth, 0, 6.283); ctx.fill();
    }
    if (!reduced() && fxEnabled()) raf = requestAnimationFrame(draw);
  }
  function onMove(e) {
    const r = canvas.getBoundingClientRect();
    tx = -0.35 + ((e.clientY - r.top) / r.height - 0.5) * 0.7;
    ty = ((e.clientX - r.left) / r.width - 0.5) * 0.5;
  }
  size();
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerleave", () => { tx = -0.35; ty = 0; });
  const ro = new ResizeObserver(() => { size(); if (reduced() || !fxEnabled()) draw(performance.now()); });
  ro.observe(canvas);
  raf = requestAnimationFrame(draw);
  return {
    setTone(t) { const n = ORB_TONES[t] || ORB_TONES.in; if (n === cur) return; prev = cur; cur = n; mix = 0; if (reduced() || !fxEnabled()) { mix = 1; draw(performance.now()); } },
    destroy() { alive = false; cancelAnimationFrame(raf); ro.disconnect(); },
  };
}

/* ---------- 粒子文字：粒子从散点聚拢成字形，指针拨开后回弹 ---------- */
export function mountParticleText(canvas, text, opts = {}) {
  const ctx = canvas.getContext("2d");
  let W = 0, H = 0, dpr = 1, parts = [], raf = 0, alive = true;
  const ptr = { x: -9999, y: -9999 };
  function build() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const off = document.createElement("canvas");
    off.width = W; off.height = H;
    const o = off.getContext("2d");
    const fs = Math.min(H * 0.86, (W / Math.max(1, text.length)) * 0.92);
    o.font = `700 ${fs}px ${getComputedStyle(document.body).fontFamily}`;
    o.textAlign = opts.align || "left"; o.textBaseline = "middle";
    o.fillStyle = "#fff";
    o.fillText(text, opts.align === "center" ? W / 2 : 4, H / 2 + fs * 0.04);
    const data = o.getImageData(0, 0, W, H).data;
    const step = Math.max(3, Math.round(fs / 46));
    const targets = [];
    for (let y = 0; y < H; y += step) for (let x = 0; x < W; x += step) if (data[(y * W + x) * 4 + 3] > 128) targets.push([x, y]);
    const oldParts = parts;
    parts = targets.map(([x, y], i) => {
      const o2 = oldParts[i];
      return {
        tx: x, ty: y,
        x: o2 ? o2.x : Math.random() * W, y: o2 ? o2.y : H + Math.random() * H * 0.6,
        vx: 0, vy: 0, ph: Math.random() * 6.28, r: 0.7 + Math.random() * (step * 0.32),
        hue: x / W,
      };
    });
    if (reduced() || !fxEnabled()) for (const p of parts) { p.x = p.tx; p.y = p.ty; }
  }
  function draw(now) {
    if (!alive) return;
    ctx.clearRect(0, 0, W, H);
    const light = isLight();
    ctx.globalCompositeOperation = light ? "source-over" : "lighter";
    const A = light ? [10, 89, 247] : [91, 160, 255], B = light ? [106, 76, 255] : [190, 140, 255], C = light ? [0, 160, 210] : [80, 230, 255];
    for (const p of parts) {
      const dx = p.x - ptr.x, dy = p.y - ptr.y, d2 = dx * dx + dy * dy;
      if (d2 < 5200) { const f = (1 - d2 / 5200) * 3.2; const d = Math.sqrt(d2) || 1; p.vx += (dx / d) * f; p.vy += (dy / d) * f; }
      p.vx += (p.tx - p.x) * 0.045; p.vy += (p.ty - p.y) * 0.045;
      p.vx *= 0.82; p.vy *= 0.82;
      p.x += p.vx; p.y += p.vy;
      const tw = 0.7 + 0.3 * Math.sin(now * 0.003 + p.ph);
      const h = p.hue;
      const col = h < 0.5 ? A.map((v, i) => Math.round(v + (C[i] - v) * h * 2)) : C.map((v, i) => Math.round(v + (B[i] - v) * (h - 0.5) * 2));
      ctx.fillStyle = `rgba(${col},${(light ? 0.85 : 0.9) * tw})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
    }
    if (!reduced() && fxEnabled()) raf = requestAnimationFrame(draw);
  }
  canvas.addEventListener("pointermove", (e) => { const r = canvas.getBoundingClientRect(); ptr.x = e.clientX - r.left; ptr.y = e.clientY - r.top; if (reduced() || !fxEnabled()) { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); } });
  canvas.addEventListener("pointerleave", () => { ptr.x = ptr.y = -9999; });
  const ro = new ResizeObserver(() => { build(); draw(performance.now()); });
  ro.observe(canvas);
  document.fonts?.ready.then(() => build());
  build();
  raf = requestAnimationFrame(draw);
  return { destroy() { alive = false; cancelAnimationFrame(raf); ro.disconnect(); } };
}

/* ---------- 卡片跟随高光 ---------- */
export function bindLight(root = document) {
  root.addEventListener("pointermove", (e) => {
    const el = e.target.closest?.(".lit");
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - r.left}px`);
    el.style.setProperty("--my", `${e.clientY - r.top}px`);
  }, { passive: true });
}

/* ---------- 主题 ---------- */
const THEME_KEY = STORAGE_KEYS.theme;
export function initTheme() {
  let t = null;
  try { t = localStorage.getItem(THEME_KEY); } catch (err) { void err; }
  if (t !== "light" && t !== "dark") t = "dark";
  applyTheme(t);
  return t;
}
export function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.content = t === "light" ? "#eef2fb" : "#04060c";
}
export function toggleTheme() {
  const t = document.documentElement.dataset.theme === "light" ? "dark" : "light";
  try { localStorage.setItem(THEME_KEY, t); } catch (err) { void err; }
  applyTheme(t);
  window.dispatchEvent(new CustomEvent("theme-change", { detail: t }));
  return t;
}

export function readDataset() {
  const el = document.getElementById("dataset");
  if (!el) {
    showDatasetFatal("页面缺少内嵌数据集，请使用最新构建产物。");
    return EMPTY_DATASET();
  }
  let ds;
  try {
    ds = JSON.parse(el.textContent);
  } catch {
    showDatasetFatal("内嵌数据集 JSON 无法解析，请重新下载或运行 npm run build。");
    return EMPTY_DATASET();
  }
  const issues = validateDataset(ds);
  if (issues.length) {
    console.warn(`[physio-log] 数据集自检发现 ${issues.length} 项异常：`);
    console.table(issues.map((msg) => ({ 问题: msg })));
    showDatasetFatal(`数据集校验失败（${issues.length} 项）：${issues.slice(0, 3).join("；")}。请使用完整的最新交付文件。`);
    return EMPTY_DATASET();
  }
  checkExpectedStamp(dataStamp(ds));
  return ds;
}
