import {
  DATASET_META, FIELDS, store, state,
  loadBaselineLock, hydrateBaseline, windowStats, storage,
  sortedRecs, hrrNorm, applyImportState, saveResultMessage, buildRescueExportPayload,
} from "./core.js";
import { parseImportText, upsertIntoList, IMPORT_MAX_BYTES } from "../shared/records-io.js";
import { EXPORT_SCHEMA_VERSION } from "../shared/import-schema.js";
import { VERSION } from "../shared/release.js";
import { mergeImportedDaily } from "../shared/payload-validation.js";

export function download(name, text, mime) {
  const blob = new Blob([text], { type: mime || "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 300);
}

export function exportJSON(toast) {
  const rescue = buildRescueExportPayload();
  const payload = {
    ...rescue,
    baseline: loadBaselineLock(),
    ...DATASET_META,
    version: EXPORT_SCHEMA_VERSION,
    schemaVersion: EXPORT_SCHEMA_VERSION,
    appVersion: VERSION,
    data: sortedRecs(),
    records: sortedRecs(),
  };
  download("physio-log-" + new Date().toISOString().slice(0, 10) + ".json", JSON.stringify(payload, null, 1));
  toast(storage.quarantine || storage.readErrors?.length ? "已导出 JSON（含救援/异常摘要）" : "已导出 JSON");
}

export function exportCSV(toast) {
  const cols = FIELDS.slice();
  cols.splice(cols.indexOf("hrr1") + 1, 0, "hrr_pct");
  const lines = sortedRecs().map((r) => {
    const hp = hrrNorm(r);
    return cols.map((f) => {
      let v = f === "hrr_pct" ? (hp != null ? hp.toFixed(1) : null) : r[f];
      if (v == null) return "";
      v = String(v);
      return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    }).join(",");
  });
  download("physio-log-" + new Date().toISOString().slice(0, 10) + ".csv", cols.join(",") + "\n" + lines.join("\n"), "text/csv");
  toast("已导出 CSV");
}

/** 共用主动合并入口；所有解析和派生都在内存改动之前完成。 */
export async function importText(raw, toast, renderAll, label = "导入完成") {
  try {
    const v = parseImportText(raw);
    if (!v.list) { toast(v.issues[0]); return { rejected: true, issues: v.issues, saved: false }; }
    const { recs, add, upd, skip } = upsertIntoList(state.recs, v.list);
    if (!add && !upd && !v.daily && !v.baseline) {
      const issues = [skip ? `跳过 ${skip} 条无效日期，没有可导入内容` : "没有可导入内容"];
      toast(issues[0]);return { rejected: true, issues, saved: false };
    }
    const nextDaily = v.daily ? mergeImportedDaily(store.dailyMeta, v.daily) : store.dailyMeta;
    const b = v.baseline ? hydrateBaseline(v.baseline) : null;
    if (b && typeof b.n !== "number") { const w = windowStats(recs, b.start, b.end, b.exclude);b.n = w ? w.n : 0; }
    const commit = await applyImportState({ recs, dailyMeta: nextDaily, baseline: b || undefined,
      touchedRecordDates: v.list.filter((r) => r?.d).map((r) => r.d),
      touchedDailyDates: v.daily ? Object.keys(v.daily) : [], dailyPatch: v.daily });
    state.sel = null;
    renderAll();
    if (!commit.ok) { toast(saveResultMessage(commit));return { add, upd, skip, saved: false }; }
    toast(`${label}：新增 ${add} 天，覆盖 ${upd} 天${skip ? `（跳过 ${skip} 条无效日期）` : ""}`);
    return { add, upd, skip, saved: true };
  } catch (error) {
    const issues = ["导入失败：" + error.message];toast(issues[0]);return { rejected: true, issues, saved: false };
  }
}

export function importJSON(file, toast, renderAll) {
  if (file.size > IMPORT_MAX_BYTES) { toast("文件超过 8 MB 上限，未导入"); return; }
  const reader = new FileReader();
  reader.onerror = () => toast("无法读取文件");
  reader.onload = () => importText(reader.result, toast, renderAll);
  reader.readAsText(file);
}
