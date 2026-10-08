/* 档案各章节的派生数据：网页版与 Word 版共用，避免两处各算一遍、日后改漏。 */
import { dayMs } from "../shared/time.js";
import { strengthTotalKg } from "../shared/daily.js";

export function workoutStats(daily, workout) {
  const ses = daily[workout.date]?.sessions?.[0] || {};
  const nSets = (k) => workout.sets.reduce((s, ex) => s + ex[k].length, 0);
  const maxKg = Math.max(...workout.sets.flatMap((ex) => [...ex.warm, ...ex.work]));
  return {
    ses,
    maxKg,
    formalLabel: `${nSets("work")} + ${nSets("warm")} 热身`,
    srcLine: `_daily.sessions（${workout.date}）与当日 flag`,
  };
}

export function phaseBar(PHASES) {
  return PHASES.spans.map(([a, b], i) => ({
    a, b, i,
    days: (dayMs(b) - dayMs(a)) / 864e5 + 1,
    flex: (dayMs(b) - dayMs(a)) / 864e5 + 1,
    isLast: i === PHASES.spans.length - 1,
    label: PHASES.labels[i],
  }));
}

export function chartExtents(recs, pad = 432e5) {
  if (!recs.length) return { t0: Date.now() - 7 * 864e5, t1: Date.now(), mon0: null };
  const t0 = dayMs(recs[0].d) - pad, t1 = dayMs(recs.at(-1).d) + pad;
  const mon0 = recs.find((r) => new Date(dayMs(r.d)).getUTCDay() === 1)?.d ?? null;
  return { t0, t1, mon0 };
}

export function elPos(el, baseline) {
  if (el == null) return "none";
  if (el < baseline.outl[0] || el > baseline.outl[1]) return "out";
  if (el < baseline.band[0] || el > baseline.band[1]) return "edge";
  return "in";
}

export { strengthTotalKg };

/** 有范围但无单点值时保留范围；完全未估算时显示缺值。 */
export function nutritionSummary(record) {
  const nutrition = record.daily?.nutrition || {};
  const value = (single, range, unit) => Number.isFinite(single) ? `${single} ${unit}`
    : Array.isArray(range) && range.length === 2 && range.every(Number.isFinite) ? `${range.join("–")} ${unit}` : "未估算";
  return `${value(record.kcal, nutrition.kcal_range, "kcal")} · 蛋白 ${value(record.pro, nutrition.protein_range, "g")}（估算）`;
}

/** 日数由数据集计算，避免下次更新时目录仍停留在旧日数。 */
export function chaptersForDays(chapters, days) {
  return chapters.map((c) => c.id === "rings" ? { ...c, zh: `${days} 天年轮` } : c);
}

/** 最新摘要的标题、距离和时长必须使用同一种（主课/多课）口径。 */
export function latestTrainingSummary(record) {
  const meta = record.daily || {};
  const sessions = meta.sessions || [];
  if (sessions.length < 2) return { title: record.type || "训练未报告", tsec: record.tsec ?? null, runKm: null };
  const allRuns = sessions.every((s) => s.kind === "run");
  const complete = (key) => sessions.every((s) => Number.isFinite(s[key]));
  const sum = (key) => sessions.reduce((n, s) => n + s[key], 0);
  const totals = meta.day_totals || {};
  return {
    title: allRuns ? `${sessions.length} 段跑步` : "多课训练",
    tsec: Number.isFinite(totals.training_tsec) ? totals.training_tsec : complete("tsec") ? sum("tsec") : null,
    runKm: allRuns ? Number.isFinite(totals.run_km) ? totals.run_km : complete("km") ? sum("km") : null : null,
  };
}
