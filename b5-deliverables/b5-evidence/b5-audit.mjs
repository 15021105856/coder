/**
 * B5 file:// checks against the built monitor HTML.
 * completed is not pass; each case sets pass from localStorage, reload, and downloaded JSON.
 */
import playwright from "../source/node_modules/playwright/index.js";

const { chromium } = playwright;
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { stabilizeDailyMeta } from "../source/src/shared/entity-id.js";
import { dataStamp } from "../source/src/shared/stamp.js";
import { lastDataDate } from "../source/src/shared/time.js";

const root = dirname(fileURLToPath(import.meta.url));
const source = resolve(root, "../source");
const html = resolve(source, "release/训练监测系统_v7.html");
const outDir = resolve(root, "evidence");
mkdirSync(outDir, { recursive: true });
const ds = JSON.parse(readFileSync(resolve(source, "data/训练数据集.json"), "utf8"));
const ctx = {
  SEED: ds.data,
  DAILY_SEED: ds._daily,
  DATA_STAMP: dataStamp(ds),
  DATA_DATE: lastDataDate(ds.data) || "—",
};
const KEY = "physio-log.app-state.v2";
const APP = "physio-log.app-state.v3";
const day = "2099-08-01";
const results = [];

function sessions(rows) {
  return stabilizeDailyMeta({ [day]: { sessions: rows, vendor: { keep: true } } }).dailyMeta;
}
function snap(dailyMeta, records = ds.data) {
  return JSON.stringify({
    format: 3,
    dataStamp: ctx.DATA_STAMP,
    dataDate: ctx.DATA_DATE,
    records,
    daily: { stamp: ctx.DATA_STAMP, date: ctx.DATA_DATE, seed: ctx.DAILY_SEED, data: dailyMeta },
    baseline: null,
    savedAt: "2099-01-01T00:00:00.000Z",
  });
}

async function open(browser, init) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: "Asia/Shanghai" });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", (dialog) => dialog.accept());
  const cdp = await context.newCDPSession(page);
  await cdp.send("Page.enable");
  const seed = await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `localStorage.clear();localStorage.setItem(${JSON.stringify(APP)}, ${JSON.stringify(init)});`,
  });
  await page.goto("file://" + html);
  await cdp.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: seed.identifier });
  await page.waitForTimeout(250);
  return { context, page, errors };
}

async function paste(page, daily, record) {
  await page.locator('[data-view=source]').click();
  const payload = { data: record ? [record] : [], _daily: daily };
  await page.locator("#pasteBox").fill(JSON.stringify(payload));
  await page.locator("#pasteBtn").click();
  await page.waitForTimeout(400);
}

async function download(page, id) {
  const wait = page.waitForEvent("download");
  await page.locator("#menuBtn").click();
  await page.locator('[data-act="export"]').click();
  const file = await wait;
  const text = readFileSync(await file.path(), "utf8");
  writeFileSync(resolve(outDir, id + "-export.json"), text);
  return JSON.parse(text);
}

async function stored(page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)), APP);
}

async function run(id, fn) {
  try {
    const result = await fn();
    results.push({ id, status: "completed", pass: !!result.pass, result });
  } catch (error) {
    results.push({ id, status: "HARNESS_ERROR", pass: false, error: String(error.stack || error) });
  }
  writeFileSync(resolve(outDir, "b5-results.json"), JSON.stringify(results, null, 2));
  console.log(id, results.at(-1).pass ? "PASS" : results.at(-1).status);
}

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const baseDaily = sessions([
  { kind: "run", start: "18:00", km: 1, name: "A" },
  { kind: "run", start: "18:00", km: 2, name: "B" },
  { kind: "run", start: "18:00", km: 3, name: "C" },
]);
const weights = stabilizeDailyMeta({
  [day]: {
    weight: [
      { time: "09:00", kg: 60, period: "morning" },
      { time: "09:00", kg: 61, period: "evening" },
    ],
  },
}).dailyMeta;

await run("three-same-start", async () => {
  const { context, page, errors } = await open(browser, snap(baseDaily));
  const edited = structuredClone(baseDaily);
  edited[day].sessions[1].km = 9;
  await paste(page, { [day]: { sessions: edited[day].sessions } }, { d: "2099-08-02", el: 70 });
  const saved = await stored(page);
  await page.reload();
  const again = await stored(page);
  const exported = await download(page, "three-same-start");
  const kms = again.daily.data[day].sessions.map((s) => s.km);
  const ids = again.daily.data[day].sessions.map((s) => s.eid);
  await context.close();
  return {
    pass: kms.join() === "1,9,3" && new Set(ids).size === 3 && ids[1] === baseDaily[day].sessions[1].eid
      && exported._daily[day].sessions[1].km === 9 && errors.length === 0 && saved.daily.data[day].vendor.keep === true,
    kms, ids, errors,
  };
});

await run("same-time-weights", async () => {
  const { context, page, errors } = await open(browser, snap(weights));
  const edited = structuredClone(weights);
  edited[day].weight[1].kg = 70;
  await paste(page, { [day]: { weight: edited[day].weight } }, { d: "2099-08-02", el: 70 });
  const again = await stored(page);
  await context.close();
  return {
    pass: again.daily.data[day].weight.map((w) => w.kg).join() === "60,70"
      && again.daily.data[day].weight[0].eid === weights[day].weight[0].eid && errors.length === 0,
    errors,
  };
});

await run("reorder-edit-reload-export", async () => {
  const { context, page, errors } = await open(browser, snap(baseDaily));
  const [a, b, c] = baseDaily[day].sessions;
  const reordered = [structuredClone(c), { ...b, km: 8 }, structuredClone(a)];
  await paste(page, { [day]: { sessions: reordered } }, { d: "2099-08-02", el: 70 });
  await page.reload();
  const again = await stored(page);
  const exported = await download(page, "reorder");
  await context.close();
  const ids = again.daily.data[day].sessions.map((s) => s.eid);
  return {
    pass: ids.join() === [c.eid, b.eid, a.eid].join() && again.daily.data[day].sessions[1].km === 8
      && exported._daily[day].sessions.map((s) => s.eid).join() === ids.join() && errors.length === 0,
    ids, errors,
  };
});

async function editAndSave(page, mutator) {
  return page.evaluate(async (source) => {
    const fn = new Function("daily", source);
    fn(globalThis.__physio.daily());
    return globalThis.__physio.persist();
  }, mutator);
}

await run("two-pages-different-entities", async () => {
  const context = await browser.newContext({ timezoneId: "Asia/Shanghai" });
  await context.addInitScript((payload) => {
    if (!sessionStorage.getItem("b5-seeded")) {
      localStorage.clear();
      localStorage.setItem("physio-log.app-state.v3", payload);
      sessionStorage.setItem("b5-seeded", "1");
    }
  }, snap(baseDaily));
  const a = await context.newPage();
  const b = await context.newPage();
  await Promise.all([a.goto("file://" + html), b.goto("file://" + html)]);
  await a.waitForFunction(() => globalThis.__physio?.daily);
  await b.waitForFunction(() => globalThis.__physio?.daily);
  const [left, right] = await Promise.all([
    editAndSave(a, `daily["${day}"].sessions[0].km = 11`),
    editAndSave(b, `daily["${day}"].sessions[2].name = "from-b"`),
  ]);
  const again = await stored(a);
  const rows = again.daily.data[day].sessions;
  await context.close();
  return {
    pass: left.ok !== false && right.ok !== false && rows[0].km === 11 && rows[2].name === "from-b" && rows[1].km === 2,
    left, right, kms: rows.map((s) => s.km), names: rows.map((s) => s.name),
  };
});

await run("delete-versus-edit-conflict", async () => {
  const context = await browser.newContext({ timezoneId: "Asia/Shanghai" });
  await context.addInitScript((payload) => {
    localStorage.clear();
    localStorage.setItem("physio-log.app-state.v3", payload);
  }, snap(baseDaily));
  const a = await context.newPage();
  const b = await context.newPage();
  a.on("dialog", (d) => d.accept());
  b.on("dialog", (d) => d.accept());
  await Promise.all([a.goto("file://" + html), b.goto("file://" + html)]);
  await a.waitForTimeout(200);
  const edited = structuredClone(baseDaily);
  edited[day].sessions[0].km = 15;
  await paste(a, { [day]: { sessions: [] } }, { d: "2099-08-05", el: 73 });
  const before = await stored(b);
  await paste(b, { [day]: { sessions: edited[day].sessions } }, { d: "2099-08-06", el: 74 });
  const toast = await b.locator("#toast").textContent();
  const after = await stored(a);
  const exported = await download(b, "conflict-draft");
  await context.close();
  return {
    pass: after.daily.data[day].sessions.length === 0 && toast.includes("未保存")
      && exported._daily[day].sessions[0].km === 15,
    toast, stored: after.daily.data[day].sessions.length,
  };
});

await run("illegal-eid-does-not-overwrite", async () => {
  const bad = structuredClone(baseDaily);
  bad[day].sessions.push({ ...bad[day].sessions[0] });
  const { context, page, errors } = await open(browser, snap(bad));
  const original = await page.evaluate((key) => localStorage.getItem(key), APP);
  await paste(page, { [day]: { sessions: [{ kind: "run", start: "18:00", km: 99 }] } }, { d: "2099-08-07", el: 75 });
  const after = await page.evaluate((key) => localStorage.getItem(key), APP);
  const toast = await page.locator("#toast").textContent();
  await context.close();
  return { pass: original === after && toast.includes("未") && errors.length === 0, toast };
});

await browser.close();
const failed = results.filter((item) => !item.pass);
console.log(JSON.stringify({ total: results.length, passed: results.length - failed.length, failed: failed.map((item) => item.id) }, null, 2));
if (failed.length) process.exitCode = 1;
