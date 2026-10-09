/* 由《训练数据集.json》派生档案所需的全部数值。纯函数、无 DOM：网页版与 Word 版共用。 */
import { CHAIN, VOICES, FUEL } from "./content.js";
import { dayMs } from "../shared/time.js";
import { typeCat, CAT_LABEL, runTotal, strengthTotal } from "../shared/training.js";
import { fmtDurEn, fmtDurZh, fmtMinZh, md, mdZh, weekday, pad2 } from "../shared/format.js";

export { dayMs, pad2, md, mdZh, weekday, fmtDurEn, fmtDurZh, fmtMinZh, typeCat, CAT_LABEL };

export function derive(ds) {
  const recs = (ds.data || []).slice().sort((a, b) => (a.d < b.d ? -1 : 1));
  const daily = ds._daily || {};
  const byD = new Map(recs.map((r) => [r.d, r]));
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const cats = recs.map((r) => typeCat(r.type));
  const count = (...ks) => cats.filter((c) => ks.includes(c)).length;

  const runKms = recs.map((r) => runTotal(r, daily)).filter((v) => Number.isFinite(v) && v > 0);
  const vols = recs.map((r) => strengthTotal(r, daily)).filter(Number.isFinite);
  const durs = recs.map((r) => r.dur).filter(Number.isFinite);
  const longest = recs.filter((r) => r.dur != null).reduce((a, r) => (!a || r.dur > a.dur ? r : a), null);
  const longestRun = recs.reduce((a, r) => {
    const k = runTotal(r, daily);
    return Number.isFinite(k) && (!a || k > a.km) ? { d: r.d, km: k } : a;
  }, null);

  const stats = {
    days: recs.length,
    first: recs[0]?.d, last: recs.at(-1)?.d,
    runDays: count("run", "mix"),
    runKmDays: runKms.length,
    runKm: runKms.reduce((a, b) => a + b, 0),
    strengthDays: count("str", "mix"),
    restDays: count("rest"),
    unreported: count("none"),
    totalVol: vols.reduce((a, b) => a + b, 0),
    sleepAvg: mean(durs),
    hwAvg: mean(recs.map((r) => r.hw).filter(Number.isFinite)),
    elN: recs.filter((r) => r.el != null).length,
    longestSleep: longest ? { d: longest.d, dur: longest.dur } : null,
    longestRun,
  };

  const B = ds._baseline || {};
  const ex = new Set(B.excluded || []);
  const refSamples = recs.filter((r) => r.el != null && r.d >= B.window_start && r.d <= B.window_end)
    .map((r) => ({ d: r.d, el: r.el, excluded: ex.has(r.d), reason: B.excluded_reason?.[r.d] || null }));
  const inc = refSamples.filter((x) => !x.excluded).map((x) => Math.log(x.el));
  const mu = mean(inc);
  const sd = inc.length > 1 ? Math.sqrt(inc.reduce((a, v) => a + (v - mu) ** 2, 0) / (inc.length - 1)) : null;
  const baseline = {
    start: B.window_start, end: B.window_end, n: B.n, mean: B.lnRMSSD_mean, sd: B.lnRMSSD_sd,
    band: B.normal_band_ms, outl: B.outlier_lines_ms, excluded: B.excluded || [], reasons: B.excluded_reason || {},
    check: { n: inc.length, mean: mu, sd },
  };

  const weeks = [];
  if (recs.length) {
    const t0 = dayMs(recs[0].d), t1 = dayMs(recs.at(-1).d);
    const dow0 = (new Date(t0).getUTCDay() + 6) % 7;
    let wk = new Array(dow0).fill(null);
    for (let t = t0; t <= t1; t += 86400000) {
      const d = new Date(t).toISOString().slice(0, 10), r = byD.get(d);
      wk.push(r ? { d, cat: typeCat(r.type), type: r.type, km: runTotal(r, daily), vol: strengthTotal(r, daily), dur: r.dur, hw: r.hw, el: r.el } : { d, cat: "gap" });
      if (wk.length === 7) { weeks.push(wk); wk = []; }
    }
    if (wk.length) weeks.push(wk.concat(new Array(7 - wk.length).fill(null)));
  }
  const weekly = weeks.map((w) => {
    const cells = w.filter((c) => c && c.cat !== "gap");
    const km = cells.map((c) => c.km).filter((v) => Number.isFinite(v) && v > 0);
    const vol = cells.map((c) => c.vol).filter(Number.isFinite);
    const first = w.find(Boolean);
    return { start: first?.d, km: km.reduce((a, b) => a + b, 0), vol: vol.reduce((a, b) => a + b, 0), n: cells.length };
  });

  const chain = recs.slice(-14).map((r) => ({
    d: r.d, cat: typeCat(r.type), dur: r.dur, hw: r.hw, el: r.el, shr: r.shr, deep: r.deep, rem: r.rem,
    km: runTotal(r, daily), vol: strengthTotal(r, daily), ...(CHAIN.rows[r.d] || { train: r.type || "—", tag: "", note: "" }),
  }));

  const weights = Object.entries(daily).flatMap(([d, m]) => (m.weight || []).map((w) => ({
    d, time: w.time, kg: w.kg, bf: w.body_fat_pct, period: w.period, confirmed: !!w.protocol_confirmed,
  }))).sort((a, b) => (a.d + a.time < b.d + b.time ? -1 : 1));

  const sleep3 = FUEL.sleep.days.map((d) => {
    const r = byD.get(d) || {}, s = daily[d]?.sleep || {};
    return { d, dur: r.dur, deep: s.deep_min, rem: s.rem_min, light: s.light_min, hw: r.hw, shr: r.shr, score: s.score };
  });

  const voices = [], voiceMissing = [];
  for (const v of VOICES) {
    const r = byD.get(v.d);
    if (v.snapshot) {
      voices.push({ ...v, type: r?.type, cat: r ? typeCat(r.type) : undefined });
      continue;
    }
    const src = r && (v.src === "feel" ? r.feel : r.flag);
    if (typeof src === "string" && src.includes(v.q)) voices.push({ ...v, type: r.type, cat: typeCat(r.type) });
    else voiceMissing.push(v);
  }

  const last = recs.at(-1);
  return {
    recs, daily, stats, baseline, refSamples, weeks, weekly, chain, weights, sleep3, voices, voiceMissing,
    latest: last ? { ...last, daily: daily[last.d] || {} } : null,
    lastEl: [...recs].reverse().find((r) => r.el != null) || null,
    series: {
      el: recs.filter((r) => r.el != null).map((r) => ({ d: r.d, y: r.el })),
      hw: recs.filter((r) => r.hw != null).map((r) => ({ d: r.d, y: r.hw })),
    },
    meta: ds._meta || {},
  };
}
