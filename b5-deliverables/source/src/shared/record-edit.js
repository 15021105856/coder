/** 单日表单只修改与载入显示值不同的字段；陈旧草稿不产生覆盖记录。 */
import { isDate } from "./schema.js";
import { normalizeRec } from "./normalize-rec.js";
import { validateImportPayload } from "./records-io.js";

export function editRecord({ date, base, current, shown, values, kinds }) {
  if (!isDate(date)) return { ok: false, reason: "invalid", issues: ["请选择有效日期"] };
  if (JSON.stringify(base ?? null) !== JSON.stringify(current ?? null)) {
    return { ok: false, reason: "stale" };
  }
  const record = base ? structuredClone(base) : { d: date };
  record.d = date;
  for (const [key, kind] of Object.entries(kinds)) {
    const raw = values[key];
    if (raw === shown[key]) continue;
    if (raw === "" || (["num", "numi", "selfeel"].includes(kind) && raw.trim() === "")) {
      record[key] = null;
    } else if (["num", "numi", "selfeel"].includes(kind)) {
      const n = Number(raw);
      if (!Number.isFinite(n)) return { ok: false, reason: "invalid", issues: [`${key} 应为有限数字`] };
      record[key] = n;
    } else {
      record[key] = raw;
    }
  }
  const payload = { data: [record] };
  const valid = validateImportPayload(payload, { byteLength: new TextEncoder().encode(JSON.stringify(payload)).byteLength });
  if (!valid.list) return { ok: false, reason: "invalid", issues: valid.issues };
  const normalized = normalizeRec(record);
  return { ok: true, record: normalized, changed: JSON.stringify(normalized) !== JSON.stringify(base ?? null) };
}
