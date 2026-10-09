/** 存储消费边界：隔离不可消费值，同时保存路径、原因和原值。 */
import { isDate } from "./schema.js";
import { plainObject, validateDailyPayload, validImportedBaseline } from "./payload-validation.js";

export function validateBaselineValue(b) {
  if (b == null) return { ok: true, value: null };
  return validImportedBaseline(b)
    ? { ok: true, value: structuredClone(b) }
    : { ok: false, reason: "baseline-invalid" };
}

export function sanitizeDailyMeta(dailyMeta, quarantineOut, source = "daily.data") {
  const out = {};
  const issue = (kind, path, raw, extra = {}) => quarantineOut?.push({ kind, source, path, raw: structuredClone(raw), ...extra });
  if (!plainObject(dailyMeta)) {
    if (dailyMeta != null) issue("daily-not-object", source, dailyMeta);
    return out;
  }
  for (const [d, day] of Object.entries(dailyMeta)) {
    if (!isDate(d)) { issue("daily-key", `${source}.${d}`, day, { key: d }); continue; }
    if (!plainObject(day)) { issue("daily-day", `${source}.${d}`, day, { date: d }); continue; }
    const clean = structuredClone(day);
    for (const key of ["sessions", "weight"]) {
      if (!Object.hasOwn(clean, key)) continue;
      const value = clean[key];
      if (!Array.isArray(value)) {
        issue(`daily-${key}`, `${source}.${d}.${key}`, value, { date: d });
        delete clean[key];
        continue;
      }
      clean[key] = value.filter((row, index) => {
        const errors = validateDailyPayload({ [d]: { [key]: [row] } });
        if (!errors.length) return true;
        issue(`daily-${key}-row`, `${source}.${d}.${key}[${index}]`, row, { date: d, index, errors });
        return false;
      });
    }
    for (const key of ["nutrition", "sleep", "day_totals", "hrr"]) {
      if (!Object.hasOwn(clean, key)) continue;
      const errors = validateDailyPayload({ [d]: { [key]: clean[key] } });
      if (errors.length) {
        issue(`daily-${key}`, `${source}.${d}.${key}`, clean[key], { date: d, errors });
        delete clean[key];
      }
    }
    out[d] = clean;
  }
  return out;
}

export function normalizeQuarantine(q) {
  if (q == null) return null;
  if (!plainObject(q)) return { quarantineInvalid: structuredClone(q) };
  const out = structuredClone(q);
  for (const key of ["recordErrors", "badRows", "readErrors", "dailyStructureIssues", "originalSnapshots"]) {
    if (out[key] != null && !Array.isArray(out[key])) {
      const raw = out[key];
      out[key] = [{ reason: `${key}-not-array`, raw }];
    }
  }
  return out;
}

export function validateSnapshotForCommit(snapshot) {
  if (!snapshot || ![2, 3].includes(snapshot.format)) return { ok: false, reason: "format" };
  if (!Array.isArray(snapshot.records) || snapshot.records.some((r) => !plainObject(r) || !isDate(r.d))) {
    return { ok: false, reason: "records-invalid" };
  }
  const b = validateBaselineValue(snapshot.baseline);
  if (!b.ok) return { ok: false, reason: b.reason };
  if (snapshot.daily != null && (!plainObject(snapshot.daily) || validateDailyPayload(snapshot.daily.data).length)) {
    return { ok: false, reason: "daily-invalid" };
  }
  return { ok: true };
}
