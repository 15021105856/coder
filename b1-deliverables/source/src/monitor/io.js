import {
  DATA_STAMP, DATA_DATE, DATASET_META, FIELDS, store, state,
  loadBaselineLock, hydrateBaseline, windowStats, storage,
  sortedRecs, hrrNorm, applyImportState, saveResultMessage, buildRescueExportPayload,
} from "./core.js";
import { validateImportPayload, upsertIntoList, IMPORT_MAX_BYTES } from "../shared/records-io.js";
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
    version: 2,
    baseline: loadBaselineLock(),
    ...DATASET_META,
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

export function importJSON(file, toast, renderAll) {
  if (file.size > IMPORT_MAX_BYTES) { toast("文件超过 8 MB 上限，未导入"); return; }
  const reader = new FileReader();
  reader.onerror = () => toast("无法读取文件");
  reader.onload = () => {
    try {
      const raw = reader.result;
      const obj = JSON.parse(raw);
      const v = validateImportPayload(obj, { byteLength: file.size ?? String(raw).length });
      if (!v.list) {
        toast(v.issues[0] || "无法识别的文件结构");
        return;
      }
      if (v.issues.length) console.warn("[physio-log] 导入校验：", v.issues.join("；"));
      // 所有检查和派生先完成，再提交，非法输入不会先覆盖 data 后失败。
      const { recs, add, upd, skip } = upsertIntoList(state.recs, v.list);
      const nextDaily = v.daily ? mergeImportedDaily(store.dailyMeta, v.daily) : store.dailyMeta;
      const b = obj.baseline ? hydrateBaseline(obj.baseline) : null;
      if (b && typeof b.n !== "number") {
            const w = windowStats(recs, b.start, b.end, b.exclude);
            b.n = w ? w.n : 0;
      }
      const commit = applyImportState({ recs, dailyMeta: nextDaily, baseline: b || undefined });
      state.sel = null;
      renderAll();
      const extra = [skip ? `跳过 ${skip} 条无效日期` : "", v.issues.length ? "详见控制台" : ""].filter(Boolean).join("，");
      if (!commit.ok) {
        toast(saveResultMessage(commit) || "导入未能写入本机存储");
        return;
      }
      toast(`导入完成：新增 ${add} 天，覆盖 ${upd} 天${extra ? `（${extra}）` : ""}`);
    } catch (e) { toast("导入失败：" + e.message); }
  };
  reader.readAsText(file);
}
