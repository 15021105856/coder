/* _daily 补充层：跑量与力量容量的统一口径（监测 / 档案 / 导出共用） */

export function runTotalKg(record, meta) {
  const t = meta?.day_totals?.run_km;
  return Number.isFinite(t) ? t : record?.km;
}

export function strengthTotalKg(record, meta) {
  const sessions = meta?.sessions?.filter((x) => x.kind === "strength") || [];
  const values = sessions.map((x) => x.vol).filter(Number.isFinite);
  if (values.length) return values.reduce((a, b) => a + b, 0);
  return record?.vol;
}

/** 监测系统：带 scope 说明的结构化结果 */
export function strengthTotalDetail(record, meta) {
  const sessions = meta?.sessions?.filter((x) => x.kind === "strength") || [];
  const values = sessions.map((x) => x.vol).filter(Number.isFinite);
  if (values.length) {
    return {
      value: values.reduce((a, b) => a + b, 0),
      n: values.length,
      scope: values.length === sessions.length ? "已报告力量课合计" : "已知课容量小计",
    };
  }
  return { value: record?.vol ?? null, n: null, scope: "历史原字段" };
}
