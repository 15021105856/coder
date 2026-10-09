import "../styles/harmony.css";
import "../styles/monitor.css";
import { mountParticleField, bindLight, initTheme, fxEnabled } from "../shared/fx.js";
import {
  DATA_DATE, DATASET_VALID, state, storage, loadDaily, loadRecords, maybeAutoLock, sortedRecs,
} from "./core.js";
import { importJSON } from "./io.js";
import {
  TABS, bindUi, toast, showMemBanner, syncStorageChrome, moveSlider, switchView, buildChrome,
} from "./ui.js";
import { renderToday } from "./views/today.js";
import { renderTrend, bindTrend } from "./views/trend.js";
import { renderSource, bindSource } from "./views/source.js";
import { renderData, bindData } from "./views/data.js";
import { renderDocs } from "./views/docs.js";

import { getArchiveHref } from "../shared/release-runtime.js";

const ARCHIVE_HREF = getArchiveHref();
const $ = (s, r = document) => r.querySelector(s);

const themeLabel = () => (document.documentElement.dataset.theme === "light" ? "切换到深色" : "切换到浅色");
const fxLabel = () => (fxEnabled() ? "关闭粒子动效" : "开启粒子动效");

export function renderAll() {
  renderToday();
  renderData();
  if (state.view === "trend") renderTrend();
}

bindTrend({ toast, renderAll });
bindSource({ toast, renderAll, switchView });
bindData({ toast, renderAll });
bindUi({ renderTrend, renderAll, themeLabel, fxLabel, ARCHIVE_HREF });

function init() {
  initTheme();
  buildChrome();
  if (!DATASET_VALID) {
    $("#view-today").innerHTML = `<div class="empty-state glass"><h3>数据无法加载</h3><p>请使用完整的最新交付文件，或重新构建源码。</p></div>`;
    document.querySelectorAll(".tab, #menuBtn").forEach((b) => { b.disabled = true; });
    return;
  }
  storage.onMem = showMemBanner;
  storage.onStorageUiSync = syncStorageChrome;
  state.recs = loadRecords();
  loadDaily();
  syncStorageChrome();
  if (storage.staleVer) {
    const vb = $("#verBanner");
    vb.textContent = "此文件（DATA " + DATA_DATE + "）旧于本机缓存（DATA " + storage.staleVer + "）：已保留缓存数据、未合并内嵌数据。请改用最新生成的文件。";
    vb.classList.add("on");
  }
  maybeAutoLock(toast);
  if (!fxEnabled()) document.body.classList.add("no-fx");
  mountParticleField($("#fx"));
  bindLight();

  document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => switchView(t.dataset.view)));
  $("#tabs").addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const tabs = [...document.querySelectorAll(".tab")], i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    const j = (i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length;
    tabs[j].focus(); switchView(tabs[j].dataset.view); e.preventDefault();
  });
  document.addEventListener("pointerdown", (e) => {
    if (e.target.closest && e.target.closest(".p-body")) return;
    document.querySelectorAll(".chart-tip").forEach((t) => t.classList.remove("on"));
    document.querySelectorAll("svg .xh, svg .xh-dot").forEach((x) => x.setAttribute("visibility", "hidden"));
  });
  const toTop = $("#toTop");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.addEventListener("scroll", () => {
    toTop.classList.toggle("on", window.scrollY > 700);
    document.body.classList.toggle("scrolled", window.scrollY > 8);
  }, { passive: true });
  toTop.onclick = () => window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
  document.addEventListener("keydown", (e) => {
    if (state.view !== "today" || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
    if (t && t.closest && t.closest(".tabs")) return;
    const recs = sortedRecs(); if (!recs.length) return;
    let i = recs.findIndex((r) => r.d === state.sel); if (i < 0) i = recs.length - 1;
    const j = e.key === "ArrowLeft" ? i - 1 : i + 1;
    if (j < 0 || j >= recs.length) return;
    state.sel = recs[j].d; renderToday();
  });
  $("#fileInput").addEventListener("change", (e) => { if (e.target.files[0]) importJSON(e.target.files[0], toast, renderAll); e.target.value = ""; });
  let rz = null, lastW = window.innerWidth;
  window.addEventListener("resize", () => {
    moveSlider();
    clearTimeout(rz);
    rz = setTimeout(() => {
      const ae = document.activeElement;
      if (ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) return;
      if (window.innerWidth === lastW) return;
      lastW = window.innerWidth;
      if (state.view === "trend") renderTrend();
    }, 180);
  });
  $("#verBadge").innerHTML = `<span class="dot"></span>DATA ${DATA_DATE}`;
  $("#storBadge").textContent = storage.memMode ? "内存模式" : "本机缓存";
  const hash = location.hash.replace("#", "");
  if (hash === "entry") state.view = "source";
  else if (TABS.some((t) => t.id === hash)) state.view = hash;
  window.addEventListener("hashchange", () => {
    const h = location.hash.replace("#", "");
    const v = h === "entry" ? "source" : h;
    if (TABS.some((t) => t.id === v) && v !== state.view) switchView(v);
  });
  renderSource();
  renderDocs();
  renderAll();
  switchView(state.view);
  document.fonts?.ready.then(moveSlider);
}
init();
