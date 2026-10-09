import { icon } from "../shared/icons.js";
import { toggleTheme, fxEnabled, setFxEnabled } from "../shared/fx.js";
import { state, storage } from "./core.js";
import { exportJSON, exportCSV } from "./io.js";

const $ = (s, r = document) => r.querySelector(s);

export const TABS = [
  { id: "today", label: "今日", icon: "today" },
  { id: "trend", label: "趋势", icon: "trend" },
  { id: "source", label: "数据来源", icon: "source" },
  { id: "data", label: "数据", icon: "data" },
  { id: "docs", label: "阈值说明", icon: "docs" },
];

let deps = {};

export function bindUi(d) {
  deps = d;
}

let toastTimer = null;
export function toast(msg) {
  const t = $("#toast");
  t.textContent = msg; t.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("on"), 2800);
}

export function showMemBanner() {
  $("#memBanner").classList.add("on");
  const b = $("#storBadge"); b.textContent = "内存模式"; b.classList.add("warn");
}

export function syncStorageChrome() {
  const memOn = storage.memMode || storage.pendingCommit || !storage.writeOk;
  const mb = $("#memBanner");
  if (mb) mb.classList.toggle("on", memOn);
  const badge = $("#storBadge");
  if (badge) {
    if (memOn) {
      badge.textContent = storage.writeOk === false ? "只读/内存" : "内存模式";
      badge.classList.add("warn");
    } else {
      badge.textContent = "";
      badge.classList.remove("warn");
    }
  }
  showStorageRecoveryBanner({
    readErrors: storage.readErrors,
    migrationPending: storage.migrationPending,
    pendingCommit: storage.pendingCommit,
    quarantine: storage.quarantine,
    storageBanner: storage.storageBanner,
  });
}

export function showStorageRecoveryBanner({ readErrors, migrationPending, pendingCommit, quarantine, storageBanner }) {
  const el = $("#storRecoverBanner");
  if (!el) return;
  const parts = [];
  if (["locks-unavailable", "lock-failed"].includes(storageBanner)) parts.push("无法取得安全保存锁；当前改动不会写入本机。请导出 JSON，使用支持 Web Locks 的浏览器打开。");
  if (["older-seed", "seed-changed"].includes(storageBanner)) parts.push("此页面的数据版本已过期，未写入；请导出草稿并使用最新文件。");
  if (storageBanner === "concurrent-conflict") parts.push("另一页面已修改相同数据，本页草稿未写入。请先导出 JSON，再重载最新数据；不要反复保存覆盖冲突。");
  if (readErrors?.length) {
    const keys = [...new Set(readErrors.map((e) => e.key))].join("、");
    parts.push(`部分存储键无法读取（${keys}），未宣称已自动备份；请用「导出 JSON」保存当前可用数据。`);
  }
  if (quarantine?.corruptAppStateRaw) {
    parts.push("权威快照已损坏，原文已保留在 quarantine 中，不会自动用内嵌数据覆盖；请导出 JSON 后人工处理。");
  }
  if (quarantine?.legacyRecordsRaw || quarantine?.parseError) {
    parts.push("本机缓存含无法完全解析的记录，已保留原文并救援可读行；刷新后仍会提示直至成功写入新快照。");
  }
  if (storageBanner === "migration-blocked") {
    parts.push("部分 legacy 键无法读取，未完成迁移写入，避免提交不完整的权威快照。");
  }
  if (migrationPending) parts.push("存储迁移尚未完成写入，旧格式数据仍保留在本机。");
  if (quarantine?.recordErrors?.length || quarantine?.badRows?.length) {
    parts.push("部分记录行无法解析，已救援可读行；详见导出 JSON 中的 quarantine。");
  }
  if (quarantine?.dailyStructureIssues?.length || quarantine?.baselineInvalid != null || quarantine?.quarantineInvalid != null) {
    parts.push("本机补充数据、基线或救援结构存在异常，已隔离不可用值并保留原值；请导出 JSON 查看救援材料。");
  }
  if (quarantine?.legacyVersionRaw) {
    parts.push("版本元数据无法解析，原文已保留；未按未知版本覆盖已有记录。");
  }
  if (quarantine?.originalSnapshots?.length) {
    parts.push("异常快照原文已保留在救援材料中，后续保存仍会保留。");
  }
  if (pendingCommit) parts.push("有未确认写入本机的编辑，请勿以为已持久保存。");
  if (!parts.length) {
    el.classList.remove("on");
    el.textContent = "";
    return;
  }
  el.textContent = parts.join(" ");
  el.classList.add("on");
}

export function moveSlider() {
  const tab = $(`.tab[data-view="${state.view}"]`), sl = $(".tab-slider");
  if (!tab || !sl) return;
  sl.style.width = tab.offsetWidth + "px";
  sl.style.transform = `translateX(${tab.offsetLeft}px)`;
}

export function switchView(v) {
  state.view = v;
  document.querySelectorAll(".tab").forEach((t) => t.setAttribute("aria-selected", String(t.dataset.view === v)));
  document.querySelectorAll(".view").forEach((s) => s.classList.toggle("on", s.id === "view-" + v));
  moveSlider();
  if (v === "trend") deps.renderTrend();
  try { history.replaceState(null, "", "#" + v); } catch (err) { void err; }
  window.scrollTo(0, 0);
}

export function buildChrome() {
  $("#tabs").insertAdjacentHTML("beforeend", TABS.map((t) => `<button class="tab" role="tab" aria-selected="false" aria-controls="view-${t.id}" data-view="${t.id}">${icon(t.icon)}<span>${t.label}</span></button>`).join(""));
  const al = $("#archiveLink"); al.href = deps.ARCHIVE_HREF; al.innerHTML = icon("archive") + "<span>档案</span>";
  $("#menuBtn").innerHTML = icon("more");
  $("#toTop").innerHTML = icon("up");
  const menu = $("#menu");
  menu.innerHTML = `
    <button role="menuitem" data-act="export">${icon("export")}导出 JSON</button>
    <button role="menuitem" data-act="csv">${icon("table")}导出 CSV</button>
    <button role="menuitem" data-act="import">${icon("import")}导入 JSON</button>
    <hr>
    <button role="menuitem" data-act="theme">${icon("palette")}<span>${deps.themeLabel()}</span></button>
    <button role="menuitem" data-act="fx">${icon("spark")}<span>${deps.fxLabel()}</span></button>
    <a role="menuitem" href="${deps.ARCHIVE_HREF}">${icon("archive")}打开个人训练档案</a>`;
  const btn = $("#menuBtn");
  const close = () => { menu.hidden = true; btn.setAttribute("aria-expanded", "false"); };
  btn.onclick = (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; btn.setAttribute("aria-expanded", String(!menu.hidden)); };
  document.addEventListener("click", (e) => { if (!menu.hidden && !menu.contains(e.target)) close(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  menu.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const a = b.dataset.act;
    if (a === "export") exportJSON(toast);
    else if (a === "csv") exportCSV(toast);
    else if (a === "import") $("#fileInput").click();
    else if (a === "theme") { toggleTheme(); b.querySelector("span").textContent = deps.themeLabel(); if (state.view === "trend") deps.renderTrend(); }
    else if (a === "fx") { setFxEnabled(!fxEnabled()); b.querySelector("span").textContent = deps.fxLabel(); }
    close();
  });
}
