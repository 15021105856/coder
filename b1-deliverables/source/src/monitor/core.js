/* 数据与核心算法：唯一真源是内嵌《训练数据集.json》，localStorage 键名与 v5 兼容。 */
import { readDataset } from "../shared/fx.js";
import { dataStamp } from "../shared/stamp.js";
import { FIELDS, NUM_FIELDS } from "../shared/schema.js";
import { dayMs, pad2, DAY_MS, lastDataDate } from "../shared/time.js";
import { esc, fmtTsec, fmtDur, normPace, fmtPace } from "../shared/format.js";
import { runTotalKg, strengthTotalDetail } from "../shared/daily.js";
import { normalizeRec, upsertIntoList, byDate as recByDate } from "../shared/records-io.js";
import {
  loadAppState, commitAppState, exportRescueBundle, overlayAuthorityOnCommit, evaluateCommitGate,
  mergeLegacySourcesForCommit,
} from "../shared/app-storage.js";
import { createMemoryStorageAdapter, wrapLocalStorage } from "../shared/local-storage-adapter.js";

export { FIELDS, NUM_FIELDS, dayMs, pad2, esc, fmtTsec, fmtDur, normPace, fmtPace };
export { mergeDailyStore } from "../shared/daily-merge.js";
export { normalizeRec } from "../shared/records-io.js";

const DATASET = readDataset();
export const DATASET_VALID = !DATASET._invalid;
export const SEED = DATASET.data || [];
export const DAILY_SEED = DATASET._daily || {};
export const DATASET_META = Object.fromEntries(Object.entries(DATASET).filter(([k]) => k !== "data" && k !== "_daily"));

export const store = { dailyMeta: structuredClone(DAILY_SEED) };
export const DATA_STAMP = dataStamp(DATASET);
export const DATA_DATE = lastDataDate(SEED) || "—";

export const T = {
  HRR_BAND_ENABLED: false,
  HRR_LO: 22.4, HRR_HI: 24.7,
  SHR_LO: 45, SHR_HI: 52,
  CONT_LO: 70,
  PRO_LO: 100, PRO_HI: 115,
  RULE_A_DROP: -8,
  BASELINE_MIN_N: 28,
};

export function loadDaily() {
  bootstrapStorage();
}

export function saveDaily() {
  return persistAppState();
}

export function weightPoints() {
  return Object.entries(store.dailyMeta).flatMap(([d, m]) => (m.weight || [])
    .filter((w) => w.period === "morning" && Number.isFinite(w.kg))
    .map((w) => ({ d, y: w.kg, time: w.time, confirmed: w.protocol_confirmed }))).sort(byDate);
}

export function weight7(d) {
  const w = weightPoints().filter((x) => dayMs(x.d) <= dayMs(d) && dayMs(x.d) >= dayMs(d) - 6 * DAY_MS);
  return w.length >= 3 ? { value: w.reduce((a, b) => a + b.y, 0) / w.length, n: w.length } : null;
}

export function weightAxis(points) {
  const lo = Math.min(59.5, ...points.map((p) => Math.floor(p.y * 2) / 2));
  const hi = Math.max(63, ...points.map((p) => Math.ceil(p.y * 2) / 2));
  const step = Math.max(0.5, Math.ceil(((hi - lo) / 12) * 2) / 2), ticks = [];
  for (let v = lo; v <= hi + 0.0001; v += step) ticks.push(+v.toFixed(1));
  if (ticks.at(-1) !== hi) ticks.push(hi);
  return { domain: [lo - 0.05, hi + 0.05], ticks };
}

export function strengthTotal(r) {
  return strengthTotalDetail(r, store.dailyMeta[r.d]);
}

export function runTotal(r) {
  return runTotalKg(r, store.dailyMeta[r.d]);
}

export function byDate(a, b) { return recByDate(a, b); }

export function hrrNorm(r) {
  if (r.hrr0 == null || r.hrr1 == null || !r.hrr0) return null;
  return ((r.hrr0 - r.hrr1) / r.hrr0) * 100;
}

export function hrrOut(hp) {
  if (!T.HRR_BAND_ENABLED || hp == null) return false;
  const r1 = Math.round(hp * 10) / 10;
  return r1 < T.HRR_LO || r1 > T.HRR_HI;
}

const DSB = DATASET._baseline || {};
export const DEFAULT_BASELINE = typeof DSB.lnRMSSD_mean === "number" && typeof DSB.lnRMSSD_sd === "number" && DSB.window_start && DSB.window_end
  ? { start: DSB.window_start, end: DSB.window_end, exclude: [...(DSB.excluded || [])], n: DSB.n, mean: DSB.lnRMSSD_mean, sd: DSB.lnRMSSD_sd, locked: true, builtin: true }
  : { start: "2026-08-08", end: "2026-08-23", exclude: ["2026-08-16", "2026-08-17"], n: 14, mean: 4.4417, sd: 0.0935, locked: true, builtin: true };

export function hydrateBaseline(b) {
  if (!b || typeof b.mean !== "number" || typeof b.sd !== "number" || typeof b.start !== "string" || typeof b.end !== "string") return null;
  const exclude = Array.isArray(b.exclude) ? b.exclude.slice() : [];
  const { mean, sd } = b;
  return {
    ...b, exclude,
    lo: mean - sd, hi: mean + sd,
    olo: mean - 1.5 * sd, ohi: mean + 1.5 * sd,
  };
}

let memBaseline = null;
let lsAdapterOverride = null;

function storageCtx() {
  return {
    SEED,
    DAILY_SEED,
    DATA_STAMP,
    DATA_DATE,
    normalizeRec,
  };
}

export function loadBaselineLock() {
  bootstrapStorage();
  const b = hydrateBaseline(memBaseline);
  if (b && b.auto !== true) return b;
  return hydrateBaseline(structuredClone(DEFAULT_BASELINE));
}

export function saveBaselineLock(b) {
  bootstrapStorage();
  memBaseline = b?.auto === true ? null : b;
  storage.baselineIntent = "locked";
  return persistAppState();
}

export function clearBaselineLock() {
  bootstrapStorage();
  memBaseline = null;
  storage.baselineIntent = "cleared";
  return persistAppState();
}

export function windowStats(recs, start, end, exclude) {
  const ex = exclude?.length ? new Set(exclude) : null;
  const vals = recs.filter((r) => r.el != null && r.d >= start && r.d <= end && !(ex && ex.has(r.d))).sort(byDate).map((r) => Math.log(r.el));
  const n = vals.length;
  if (n < 2) return null;
  const mean = vals.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(vals.reduce((a, v) => a + (v - mean) ** 2, 0) / (n - 1));
  return { start, end, n, mean, sd, exclude: exclude?.slice() || [], lo: mean - sd, hi: mean + sd, olo: mean - 1.5 * sd, ohi: mean + 1.5 * sd };
}

export function getBaseline(recs) {
  const lock = loadBaselineLock();
  if (lock) return { ...lock, locked: true };
  const all = recs.filter((r) => r.el != null).sort(byDate);
  if (!all.length) return null;
  return { ...windowStats(recs, all[0].d, all.at(-1).d), locked: false };
}

export function maybeAutoLock(toast) {
  if (loadBaselineLock()) return false;
  const all = state.recs.filter((r) => r.el != null).sort(byDate);
  if (all.length < T.BASELINE_MIN_N) return false;
  const w = windowStats(state.recs, all[0].d, all[T.BASELINE_MIN_N - 1].d);
  if (!w) return false;
  saveBaselineLock({ ...w, lockedAt: new Date().toISOString(), auto: true });
  toast?.(`已满 ${T.BASELINE_MIN_N} 个有效样本，自动锁定最早 ${T.BASELINE_MIN_N} 个为参考期基线`);
  return true;
}

export function rolling7(recs) {
  const out = {};
  const sorted = recs.slice().sort(byDate);
  for (let i = 0; i < sorted.length; i++) {
    const end = dayMs(sorted[i].d), start = end - 6 * DAY_MS;
    const win = [];
    for (let j = i; j >= 0; j--) {
      if (dayMs(sorted[j].d) < start) break;
      if (sorted[j].el != null) win.push(Math.log(sorted[j].el));
    }
    if (win.length >= 3) out[sorted[i].d] = { v: win.reduce((a, b) => a + b, 0) / win.length, n: win.length };
  }
  return out;
}

export function judge(recs, d) {
  const r = recs.find((x) => x.d === d); if (!r) return [];
  const out = [], st = getBaseline(recs), sorted = recs.slice().sort(byDate);
  const prev = sorted.filter((x) => x.d < d && x.el != null).pop();
  if (r.el != null && prev && r.el - prev.el < T.RULE_A_DROP) {
    const gap = Math.round((dayMs(d) - dayMs(prev.d)) / DAY_MS);
    out.push({ level: "info", tag: "数值变化", text: `晨起RMSSD较${prev.d}下降${(prev.el - r.el).toFixed(1)}ms。${gap === 1 && r.shr != null && prev.shr != null ? `睡眠平均心率变化${r.shr - prev.shr}bpm；这两项变化不能单独区分疲劳与测量因素。` : `间隔${gap}天或缺少对应心率，不作单日归因。`}` });
  }
  if (st) {
    const rolls = rolling7(recs); let streak = 0, lastDay = null, lastV = null;
    for (const x of sorted) {
      if (x.d > d) break;
      const ro = rolls[x.d];
      if (!ro || x.el == null) { streak = 0; lastDay = null; continue; }
      if (lastDay && dayMs(x.d) - dayMs(lastDay) !== DAY_MS) streak = 0;
      streak = ro.v < st.lo ? streak + 1 : 0; lastDay = x.d; lastV = ro.v;
    }
    if (streak >= 3 && r.el != null) out.push({ level: "info", tag: "滚动趋势", text: `连续${streak}个日历日有晨测，7日滚动均值低于固定参考带；当前折算约${Math.exp(lastV).toFixed(1)}ms。仅描述趋势，不诊断恢复状态。` });
  }
  const shrRange = store.dailyMeta[d]?.sleep?.shr_range || [T.SHR_LO, T.SHR_HI];
  if (r.shr != null && (r.shr < shrRange[0] || r.shr > shrRange[1])) out.push({ level: "info", tag: "睡眠心率", text: `平均心率${r.shr}bpm超出所用参考区间${shrRange.join("–")}bpm，结合当日背景查看。` });
  if (r.cont != null && r.cont < T.CONT_LO) out.push({ level: "info", tag: "设备指标", text: `深睡连续性${r.cont}低于既有提示线${T.CONT_LO}；不单独判断恢复。` });
  if (r.pro != null && r.pro < T.PRO_LO) out.push({ level: "info", tag: "营养估计", text: `蛋白代表估值${r.pro}g低于既有参考值${T.PRO_LO}g；请结合估算范围，不能确认实际不足。` });
  return out;
}

export const storage = {
  memMode: false,
  memStore: null,
  staleVer: null,
  onMem: null,
  bootstrapped: false,
  readErrors: [],
  quarantine: null,
  storageBanner: null,
  migrationPending: false,
  pendingCommit: false,
  writeOk: true,
  corruptAuthority: false,
  authorityOverlayOnCommit: false,
  seedPlaceholder: false,
  migrationBlocked: false,
  deletedRecordDates: new Set(),
  userRecordDates: new Set(),
  userDailyDates: new Set(),
  baselineIntent: "inherit",
  onStorageUiSync: null,
};
export const state = { recs: [], sel: null, view: "today" };

export function getStorageAdapter() {
  if (lsAdapterOverride) return lsAdapterOverride;
  try {
    if (typeof localStorage !== "undefined" && localStorage) return wrapLocalStorage(localStorage);
  } catch {
    /* SecurityError 等：降级内存适配器 */
  }
  return createMemoryStorageAdapter();
}

export function markUserRecordDates(dates) {
  for (const d of dates || []) if (d) storage.userRecordDates.add(d);
}

export function markUserDailyDates(dates) {
  for (const d of dates || []) if (d) storage.userDailyDates.add(d);
}

export function markRecordDeleted(d) {
  if (!d) return;
  storage.deletedRecordDates.add(d);
  storage.userRecordDates.add(d);
}

function syncStorageUi() {
  storage.onStorageUiSync?.();
}

/** 单测 / 集成测试注入 mock localStorage */
export function configureStorageAdapter(adapter) {
  lsAdapterOverride = adapter;
  storage.bootstrapped = false;
}

export function saveResultMessage(r) {
  if (r.ok) return null;
  if (r.status === "unknown") return "保存结果无法确认，请先导出 JSON 备份";
  return "保存失败：改动仅保留在当前页面内存中，请导出 JSON";
}

export function bootstrapStorage() {
  if (storage.bootstrapped) return;
  const loaded = loadAppState(getStorageAdapter(), storageCtx());
  state.recs = loaded.records;
  store.dailyMeta = loaded.dailyMeta;
  memBaseline = loaded.baselineStored;
  storage.memMode = loaded.memMode;
  storage.staleVer = loaded.staleVer;
  storage.readErrors = loaded.readErrors || [];
  storage.quarantine = loaded.quarantine;
  storage.storageBanner = loaded.storageBanner;
  storage.migrationPending = loaded.migrationPending;
  storage.writeOk = loaded.writeOk !== false;
  storage.corruptAuthority = !!loaded.corruptAuthority;
  storage.authorityOverlayOnCommit = !!loaded.authorityOverlayOnCommit;
  storage.seedPlaceholder = !!loaded.seedPlaceholder;
  storage.migrationBlocked = !!loaded.migrationBlocked;
  storage.deletedRecordDates = new Set();
  storage.userRecordDates = new Set();
  storage.userDailyDates = new Set();
  storage.baselineIntent = "inherit";
  storage.memStore = loaded.memMode ? loaded.records : null;
  storage.bootstrapped = true;
}

export function persistAppState() {
  bootstrapStorage();
  const ls = getStorageAdapter();
  const writeOk = ls.probeWrite?.() ?? ls.probe?.() ?? true;
  storage.writeOk = writeOk;
  let bundle = overlayAuthorityOnCommit(ls, storageCtx(), {
    records: state.recs,
    dailyMeta: store.dailyMeta,
    baseline: memBaseline,
    quarantine: storage.quarantine,
    authorityOverlayOnCommit: storage.authorityOverlayOnCommit,
    seedPlaceholder: storage.seedPlaceholder,
    deletedRecordDates: [...storage.deletedRecordDates],
    userRecordDates: [...storage.userRecordDates],
    userDailyDates: [...storage.userDailyDates],
    baselineIntent: storage.baselineIntent,
  });
  state.recs = bundle.records;
  store.dailyMeta = bundle.dailyMeta;
  memBaseline = bundle.baseline;
  storage.quarantine = bundle.quarantine;
  storage.authorityOverlayOnCommit = bundle.authorityOverlayOnCommit;
  storage.seedPlaceholder = !!bundle.seedPlaceholder;
  if (bundle.corruptAuthority) storage.corruptAuthority = true;
  if (bundle.overlayReadFailed) {
    storage.memMode = true;
    storage.pendingCommit = true;
    syncStorageUi();
    return { ok: false, status: "failed", reason: "authority-read-failed" };
  }
  const gate = evaluateCommitGate(ls, storageCtx(), {
    corruptAuthority: storage.corruptAuthority,
  });
  if (!gate.ok) {
    storage.memMode = true;
    storage.pendingCommit = true;
    storage.storageBanner = gate.reason === "migration-blocked" ? "migration-blocked" : storage.storageBanner;
    syncStorageUi();
    return { ok: false, status: "failed", reason: gate.reason || "commit-blocked" };
  }
  bundle = mergeLegacySourcesForCommit(ls, storageCtx(), {
    records: state.recs,
    dailyMeta: store.dailyMeta,
    baseline: memBaseline,
    quarantine: storage.quarantine,
    deletedRecordDates: [...storage.deletedRecordDates],
    userRecordDates: [...storage.userRecordDates],
    userDailyDates: [...storage.userDailyDates],
    baselineIntent: storage.baselineIntent,
  });
  state.recs = bundle.records;
  store.dailyMeta = bundle.dailyMeta;
  memBaseline = bundle.baseline;
  storage.quarantine = bundle.quarantine;
  if (!writeOk) {
    storage.memMode = true;
    storage.memStore = state.recs;
    storage.pendingCommit = true;
    storage.onMem?.();
    return { ok: false, status: "failed", reason: "storage-probe-failed" };
  }
  if (storage.corruptAuthority) {
    storage.memMode = true;
    storage.pendingCommit = true;
    storage.onMem?.();
    return { ok: false, status: "failed", reason: "corrupt-authority-no-overwrite" };
  }
  const r = commitAppState(ls, storageCtx(), {
    records: state.recs,
    dailyMeta: store.dailyMeta,
    baseline: memBaseline,
    quarantine: storage.quarantine,
  });
  if (r.status === "ok") {
    storage.memMode = false;
    storage.pendingCommit = false;
    storage.migrationBlocked = false;
    storage.deletedRecordDates.clear();
    storage.userRecordDates.clear();
    storage.userDailyDates.clear();
    storage.baselineIntent = "inherit";
    syncStorageUi();
    return { ok: true, status: "ok" };
  }
  storage.memMode = true;
  storage.memStore = state.recs;
  storage.pendingCommit = true;
  syncStorageUi();
  if (r.status === "unknown") return { ok: false, status: "unknown", reason: r.reason };
  return { ok: false, status: "failed", reason: r.reason };
}

export function loadRecords() {
  bootstrapStorage();
  return state.recs;
}

export function saveRecords(recs) {
  state.recs = recs;
  return persistAppState();
}

export function upsertRecords(list, toast) {
  const { recs, add, upd, skip } = upsertIntoList(state.recs, list);
  markUserRecordDates(list.map((r) => r?.d).filter(Boolean));
  state.recs = recs;
  const r = persistAppState();
  maybeAutoLock(r.ok ? toast : null);
  const msg = saveResultMessage(r);
  if (msg) toast?.(msg);
  return { add, upd, skip, saved: r.ok };
}

export function buildRescueExportPayload() {
  bootstrapStorage();
  return exportRescueBundle(storageCtx(), {
    records: state.recs,
    dailyMeta: store.dailyMeta,
    baseline: memBaseline,
    quarantine: storage.quarantine,
    readErrors: storage.readErrors,
    writeOk: storage.writeOk,
    corruptAuthority: storage.corruptAuthority,
  });
}

/** 导入 / 批量写入：单次完整提交 */
export function applyImportState({ recs, dailyMeta, baseline, touchedRecordDates, touchedDailyDates }) {
  bootstrapStorage();
  markUserRecordDates(touchedRecordDates);
  if (touchedDailyDates) markUserDailyDates(touchedDailyDates);
  state.recs = recs;
  if (dailyMeta != null) store.dailyMeta = dailyMeta;
  if (baseline !== undefined) {
    memBaseline = baseline?.auto === true ? null : baseline;
    storage.baselineIntent = baseline == null ? "cleared" : "locked";
  }
  return persistAppState();
}

export function sortedRecs() { return state.recs.slice().sort(byDate); }

export function xExtent(recs) {
  if (!recs.length) { const t = Date.now(); return [t - 7 * DAY_MS, t]; }
  const sorted = recs.slice().sort(byDate);
  return [dayMs(sorted[0].d) - DAY_MS / 2, dayMs(sorted.at(-1).d) + DAY_MS / 2];
}

export function bandPos(el, st) {
  if (el == null || !st) return null;
  const lv = Math.log(el);
  if (lv < st.olo || lv > st.ohi) return "out";
  if (lv < st.lo || lv > st.hi) return "edge";
  return "in";
}
