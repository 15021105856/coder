// Export schema is independent from the product version (v7 / 7.0.0).
export const EXPORT_SCHEMA_VERSION = 2;
export function validateImportSchema(obj) {
  if (Array.isArray(obj)) return [];
  const issues = [];
  for (const key of ["version", "schemaVersion"]) {
    if (!Object.hasOwn(obj, key)) continue;
    const v = obj[key];
    if (!Number.isInteger(v) || v < 1) issues.push(`${key} 必须是有效的数据导出格式版本`);
    else if (v > EXPORT_SCHEMA_VERSION) issues.push(`数据导出格式版本 ${v} 高于当前支持的 ${EXPORT_SCHEMA_VERSION}，未导入`);
  }
  if (obj.version != null && obj.schemaVersion != null && obj.version !== obj.schemaVersion) issues.push("数据导出格式版本标记不一致");
  if (Object.hasOwn(obj, "format")) issues.push("权威存储快照不是合并导入文件，请使用「导出 JSON」生成的文件");
  return issues;
}
