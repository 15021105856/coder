/* 数据与核心算法：唯一真源是内嵌《训练数据集.json》，localStorage 键名与 v5 兼容。 */
import { readDataset } from "../shared/fx.js";
import { dataStamp } from "../shared/stamp.js";
import { FIELDS, NUM_FIELDS } from "../shared/schema.js";
import { dayMs, pad2, DAY_MS, lastDataDate } from "../shared/time.js";
import { esc, fmtTsec, fmtDur, normPace, fmtPace } from "../shared/format.js";
import { runTotalKg, strengthTotalDetail } from "../shared/daily.js";
import { normalizeRec, validateImportPayload, upsertIntoList, byDate as recByDate } from "../shared/records-io.js";
import {
  loadAppState, commitAppState, exportRescueBundle, overlayAuthorityOnCommit, evaluateCommitGate,
  mergeLegacySourcesForCommit, readAuthority, parseSnapshot, prepareV2State, isOlderSeed,
} from "../shared/app-storage.js";
import { withStorageLock, reconcileConcurrentState } from "../shared/concurrent-storage.js";
import { mergeQuarantine } from "../shared/storage-intent.js";
import { createMemoryStorageAdapter, wrapLocalStorage } from "../shared/local-storage-adapter.js";
import { mergeImportedDaily } from "../shared/payload-validation.js";

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
let concurrencyBase = null;
let baseStamp = null;
let storageReadOnly = false;
let lsAdapterOverride = null;
let unavailableAdapter = null;

function storageCtx() {
  return {
    SEED,
    DAILY_SEED,
    DATA_STAMP,
    DATA_DATE,
    normalizeRec,
    readOnly: storageReadOnly,
  };
}

export function loadBaselineLock() {
  bootstrapStorage();
  const b = hydrateBaseline(memBaseline);
  if (b && b.auto !== true) return b;
  return hydrateBaseline(structuredClone(DEFAULT_BASELINE));
}

export function saveBaselineLock(b) {
  if (storage.busy) return Promise.resolve(busyResult());
  bootstrapStorage();
  memBaseline = b?.auto === true ? null : b;
  storage.baselineIntent = "locked";
  return persistAppState();
}

export function clearBaselineLock() {
  if (storage.busy) return Promise.resolve(busyResult());
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
  busy: false,
  conflict: null,
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
  identityBlocked: false,
  authorityOverlayOnCommit: false,
  seedPlaceholder: false,
  migrationBlocked: false,
  deletedRecordDates: new Set(),
  userRecordDates: new Set(),
  userDailyDates: new Set(),
  dailyPatch: {},
  baselineIntent: "inherit",
  onStorageUiSync: null,
};
export const state = { recs: [], sel: null, view: "today" };

export function getStorageAdapter() {
  if (lsAdapterOverride) return lsAdapterOverride;
  let accessError = "localStorage-unavailable";
  try {
    const area = globalThis.localStorage;
    if (area) return wrapLocalStorage(area);
  } catch (error) {
    accessError = error?.message || accessError;
  }
  unavailableAdapter ||= createMemoryStorageAdapter({}, {}, { persistent: false, accessError });
  return unavailableAdapter;
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
  if (r.reason === "concurrent-conflict") return "另一页面已修改相同数据，草稿未保存；请先导出 JSON，再放弃草稿并重载";
  if (r.reason === "older-seed" || r.reason === "seed-changed") return "此页面的数据版本已过期，未写入；请导出草稿并使用最新文件";
  if (r.reason === "locks-unavailable" || r.reason === "lock-failed") return "无法取得安全保存锁，改动未保存；请导出 JSON 备份后换用支持 Web Locks 的浏览器";
  if (r.reason === "busy") return "上一笔保存尚未完成，请稍后再操作";
  if (r.reason === "identity-blocked") return "课次或体重身份无效，未覆盖已保存数据；请导出 JSON 后处理重复或非法身份";
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
  storage.identityBlocked = !!loaded.identityBlocked;
  storage.authorityOverlayOnCommit = !!loaded.authorityOverlayOnCommit;
  storage.seedPlaceholder = !!loaded.seedPlaceholder;
  storage.migrationBlocked = !!loaded.migrationBlocked;
  storage.deletedRecordDates = new Set();
  storage.userRecordDates = new Set();
  storage.userDailyDates = new Set();
  storage.dailyPatch = {};
  storage.baselineIntent = "inherit";
  storage.memStore = loaded.memMode ? loaded.records : null;
  storage.hadAuthority = !loaded.seedPlaceholder && !loaded.corruptAuthority;
  storage.bootstrapped = true;
  concurrencyBase = structuredClone({ records: state.recs, dailyMeta: store.dailyMeta, baseline: memBaseline });
  try { const raw = readAuthority(getStorageAdapter()); storage.hadAuthority = !!raw; baseStamp = parseSnapshot(raw).snapshot?.dataStamp ?? DATA_STAMP; }
  catch { baseStamp = DATA_STAMP; }
}

function busyResult() { return { ok: false, status: "failed", reason: "busy" }; }

export async function initializeStorage() {
  const r = await withStorageLock(() => { bootstrapStorage(); return { ok: true }; });
  if (!r.ok) {
    storageReadOnly = true;
    bootstrapStorage();
    storage.storageBanner = r.reason;
    storage.writeOk = false;
  }
  return r;
}

export async function reloadLatestState() {
  if (storage.busy) return busyResult();
  storage.busy = true;
  const r = await withStorageLock(() => {
    storage.bootstrapped = false;
    bootstrapStorage();
    storage.pendingCommit = false;
    storage.conflict = null;
    return { ok: true };
  });
  storage.busy = false;
  syncStorageUi();
  return r;
}

export async function persistAppState() {
  if (storage.busy) return busyResult();
  storage.busy = true;
  let result;
  try { result = await withStorageLock(persistAppStateLocked); }
  finally { storage.busy = false; }
  if (!result.ok) {
    storage.pendingCommit = true;
    storage.memMode = true;
    storage.conflict = ["concurrent-conflict", "older-seed", "seed-changed"].includes(result.reason) ? result : storage.conflict;
    storage.storageBanner = result.reason;
  }
  syncStorageUi();
  return result;
}

function persistAppStateLocked() {
  storageReadOnly = false;
  bootstrapStorage();
  const ls = getStorageAdapter();
  // Read and merge while holding the same lock used by initialization and every save entry.
  let remote;
  try { remote = parseSnapshot(readAuthority(ls)); }
  catch { return { ok: false, status: "failed", reason: "authority-read-failed" }; }
  if (remote.ok) {
    if (isOlderSeed(remote.snapshot, storageCtx())) return { ok: false, status: "failed", reason: "older-seed" };
    const recovery = storage.authorityOverlayOnCommit || storage.seedPlaceholder;
    if (recovery) {
      // Once authority becomes readable, retain the consumed disk base even if this write
      // subsequently fails. A retry must not mistake its own seed merge for a foreign update.
      const disk = prepareV2State(remote.raw, remote.snapshot, storageCtx());
      concurrencyBase = structuredClone({ records: disk.records, dailyMeta: disk.dailyMeta, baseline: disk.baseline });
      baseStamp = remote.snapshot.dataStamp;
    }
    if (!recovery && remote.snapshot.dataStamp !== baseStamp) return { ok: false, status: "failed", reason: "seed-changed" };
    if (!recovery && concurrencyBase) {
      const disk = prepareV2State(remote.raw, remote.snapshot, storageCtx());
      const merged = reconcileConcurrentState(concurrencyBase,
        { records: state.recs, dailyMeta: store.dailyMeta, baseline: memBaseline }, disk);
      if (!merged.ok) return { ok: false, status: "failed", reason: "concurrent-conflict", conflicts: merged.conflicts };
      state.recs = merged.records;
      store.dailyMeta = merged.dailyMeta;
      memBaseline = merged.baseline;
      storage.quarantine = mergeQuarantine(disk.quarantine, storage.quarantine);
    }
  } else if (remote.reason === "empty" && concurrencyBase && baseStamp !== null && storage.hadAuthority) {
    return { ok: false, status: "failed", reason: "concurrent-conflict", conflicts: ["authority-deleted"] };
  }
  const writeOk = ls.persistent !== false && (ls.probeWrite?.() ?? ls.probe?.() ?? true);
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
    dailyPatch: storage.dailyPatch,
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
    dailyPatch: storage.dailyPatch,
    baselineIntent: storage.baselineIntent,
  });
  state.recs = bundle.records;
  store.dailyMeta = bundle.dailyMeta;
  memBaseline = bundle.baseline;
  storage.quarantine = bundle.quarantine;
  if (bundle.commitReadFailed) {
    storage.memMode = true;
    storage.pendingCommit = true;
    storage.readErrors = bundle.readErrors || storage.readErrors;
    syncStorageUi();
    return { ok: false, status: "failed", reason: "legacy-read-failed" };
  }
  if (!writeOk) {
    storage.memMode = true;
    storage.memStore = state.recs;
    storage.pendingCommit = true;
    syncStorageUi();
    return { ok: false, status: "failed", reason: "storage-probe-failed" };
  }
  if (storage.identityBlocked) {
    storage.memMode = true;
    storage.pendingCommit = true;
    syncStorageUi();
    return { ok: false, status: "failed", reason: "identity-blocked" };
  }
  if (storage.corruptAuthority) {
    storage.memMode = true;
    storage.pendingCommit = true;
    syncStorageUi();
    return { ok: false, status: "failed", reason: "corrupt-authority-no-overwrite" };
  }
  const r = commitAppState(ls, storageCtx(), {
    records: state.recs,
    dailyMeta: store.dailyMeta,
    baseline: memBaseline,
    quarantine: storage.quarantine,
  });
  if (r.snapshot) {
    state.recs = r.snapshot.records;
    store.dailyMeta = r.snapshot.daily.data;
    memBaseline = r.snapshot.baseline;
    storage.quarantine = r.snapshot.quarantine || null;
  }
  if (r.status === "ok") {
    concurrencyBase = structuredClone({ records: state.recs, dailyMeta: store.dailyMeta, baseline: memBaseline });
    baseStamp = r.snapshot.dataStamp;
    storage.hadAuthority = true;
    storage.conflict = null;
    storage.memMode = false;
    storage.pendingCommit = false;
    storage.migrationBlocked = false;
    storage.migrationPending = false;
    storage.readErrors = [];
    storage.storageBanner = storage.quarantine ? "quarantine" : null;
    storage.deletedRecordDates.clear();
    storage.userRecordDates.clear();
    storage.userDailyDates.clear();
    storage.dailyPatch = {};
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
  if (storage.busy) return Promise.resolve(busyResult());
  state.recs = recs;
  return persistAppState();
}

export async function upsertRecords(list, toast) {
  if (storage.busy) { toast?.(saveResultMessage(busyResult())); return { add: 0, upd: 0, skip: 0, saved: false }; }
  const valid = validateImportPayload(list);
  if (!valid.list) {
    toast?.(valid.issues[0]);
    return { add: 0, upd: 0, skip: 0, saved: false, rejected: true, issues: valid.issues };
  }
  const { recs, add, upd, skip } = upsertIntoList(state.recs, valid.list);
  markUserRecordDates(list.map((r) => r?.d).filter(Boolean));
  state.recs = recs;
  const r = await persistAppState();
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
export function applyImportState({ recs, dailyMeta, baseline, touchedRecordDates, touchedDailyDates, dailyPatch }) {
  if (storage.busy) return Promise.resolve(busyResult());
  bootstrapStorage();
  markUserRecordDates(touchedRecordDates);
  if (touchedDailyDates) markUserDailyDates(touchedDailyDates);
  if (dailyPatch) storage.dailyPatch = mergeImportedDaily(storage.dailyPatch, dailyPatch);
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
