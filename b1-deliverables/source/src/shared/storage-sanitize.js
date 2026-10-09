/** 运行时消费的存储结构校验与隔离（B1-R3 A04） */
const plainObject = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const isDate = (d) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);

export function validateBaselineValue(b) {
  if (b == null) return { ok: true, value: null };
  if (!plainObject(b)) return { ok: false, reason: "baseline-not-object" };
  if (typeof b.mean !== "number" || typeof b.sd !== "number") return { ok: false, reason: "baseline-numeric" };
  if (typeof b.start !== "string" || typeof b.end !== "string") return { ok: false, reason: "baseline-range" };
  return { ok: true, value: b };
}

export function sanitizeDailyMeta(dailyMeta, quarantineOut) {
  if (!dailyMeta || !plainObject(dailyMeta)) return {};
  const out = {};
  for (const [d, day] of Object.entries(dailyMeta)) {
    if (!isDate(d)) {
      quarantineOut?.push({ kind: "daily-key", key: d });
      continue;
    }
    if (day == null || !plainObject(day)) {
      quarantineOut?.push({ kind: "daily-day", date: d });
      continue;
    }
    const clean = { ...day };
    if (clean.sessions != null && !Array.isArray(clean.sessions)) {
      quarantineOut?.push({ kind: "daily-sessions", date: d });
      delete clean.sessions;
    } else if (Array.isArray(clean.sessions)) {
      clean.sessions = clean.sessions.filter((s) => s != null && plainObject(s));
    }
    if (clean.weight != null && !Array.isArray(clean.weight)) {
      quarantineOut?.push({ kind: "daily-weight", date: d });
      delete clean.weight;
    }
    out[d] = clean;
  }
  return out;
}

export function normalizeQuarantine(q) {
  if (!q || !plainObject(q)) return null;
  const out = { ...q };
  if (out.recordErrors != null && !Array.isArray(out.recordErrors)) {
    out.recordErrors = [{ reason: "recordErrors-not-array", value: out.recordErrors }];
  }
  if (out.badRows != null && !Array.isArray(out.badRows)) {
    out.badRows = [{ reason: "badRows-not-array" }];
  }
  return out;
}

export function validateSnapshotForCommit(snapshot) {
  if (!snapshot || snapshot.format !== 2) return { ok: false, reason: "format" };
  if (!Array.isArray(snapshot.records)) return { ok: false, reason: "records-not-array" };
  const b = validateBaselineValue(snapshot.baseline);
  if (!b.ok) return { ok: false, reason: b.reason };
  if (snapshot.daily != null && (!plainObject(snapshot.daily) || !plainObject(snapshot.daily.data))) {
    return { ok: false, reason: "daily-invalid" };
  }
  return { ok: true };
}
