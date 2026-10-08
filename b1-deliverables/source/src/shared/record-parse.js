/** 从缓存 JSON 数组解析记录：逐行救援，保留坏行原文索引 */
import { normalizeRec } from "./records-io.js";

export function parseRecordsArray(arr) {
  if (!Array.isArray(arr)) {
    return {
      records: [],
      errors: [{ index: -1, reason: "not-array" }],
      badRows: [{ index: -1, raw: arr }],
    };
  }
  const records = [];
  const errors = [];
  const badRows = [];
  for (let i = 0; i < arr.length; i++) {
    const row = arr[i];
    if (row == null || typeof row !== "object" || Array.isArray(row)) {
      errors.push({ index: i, reason: "invalid-row" });
      badRows.push({ index: i, raw: row });
      continue;
    }
    try {
      records.push(normalizeRec(row));
    } catch (e) {
      errors.push({ index: i, reason: e?.message || "normalize-failed" });
      badRows.push({ index: i, raw: row });
    }
  }
  return { records, errors, badRows };
}

export function parseRecordsRaw(jsonText) {
  if (jsonText == null || jsonText === "") {
    return { records: [], errors: [], badRows: [], parseError: null };
  }
  try {
    const arr = JSON.parse(jsonText);
    const parsed = parseRecordsArray(arr);
    return { ...parsed, parseError: null, raw: jsonText };
  } catch (e) {
    return {
      records: [],
      errors: [{ index: -1, reason: "json-parse" }],
      badRows: [],
      parseError: e?.message || "json-parse",
      raw: jsonText,
    };
  }
}
