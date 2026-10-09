/**
 * B1-R2 file:// regression (Playwright). Asserts review scenarios; `completed` ≠ pass.
 */
const fs = require("fs");
const path = require("path");
const assert = require("assert/strict");
const { chromium } = require(path.resolve(__dirname, "../source/node_modules/playwright"));

const root = __dirname;
const sourceRoot = path.resolve(root, "../source");
const ds = JSON.parse(fs.readFileSync(path.join(sourceRoot, "data/训练数据集.json"), "utf8"));
const K = {
  r: "physio-log.records.v1",
  v: "physio-log.data-version",
  d: "physio-log.daily",
  b: "physio-log.baseline.v1",
  app: "physio-log.app-state.v2",
};
const row = (d, extra = {}) =>
  Object.fromEntries(ds._fields.map((k) => [k, k === "d" ? d : extra[k] ?? null]));
const unique = row("2099-06-01", { el: 77, flag: "ONLY-LOCAL" });
const newrow = row("2099-06-02", { el: 78, note: "PENDING" });
const version = JSON.stringify({ s: "02808fbb", d: "2026-10-06" });
const goodSnap = {
  format: 2,
  dataStamp: "02808fbb",
  dataDate: "2026-10-06",
  records: [...ds.data, unique],
  daily: { stamp: "02808fbb", date: "2026-10-06", seed: ds._daily, data: ds._daily },
  baseline: null,
};

const productDir = path.join(root, "product");
const evidenceDir = path.join(root, "evidence");
fs.mkdirSync(productDir, { recursive: true });
fs.mkdirSync(evidenceDir, { recursive: true });

const monitorSrc = path.join(sourceRoot, "release/训练监测系统_v7.html");
fs.copyFileSync(monitorSrc, path.join(productDir, "训练监测系统_v7.html"));

function buildUpdatedSeedHtml() {
  const html = fs.readFileSync(monitorSrc, "utf8");
  const embedded = JSON.parse(
    html.match(/<script type="application\/json" id="dataset">\s*([\s\S]*?)\s*<\/script>/)[1],
  );
  if (!embedded.data.some((r) => r.d === "2026-10-07")) {
    const last = structuredClone(embedded.data.at(-1));
    last.d = "2026-10-07";
    last.el = (last.el ?? 80) + 1;
    embedded.data.push(last);
    embedded._meta = { ...embedded._meta, data_through: "2026-10-07", last_updated: "2026-10-07" };
  }
  const body = JSON.stringify(embedded).replace(/<\//g, "<\\/");
  const out = html.replace(
    /(<script type="application\/json" id="dataset">)[\s\S]*?(<\/script>)/,
    (_, a, z) => `${a}\n${body}\n${z}`,
  );
  fs.writeFileSync(path.join(root, "updated-seed.html"), out);
}

buildUpdatedSeedHtml();

let browser;
const results = [];

async function fresh(init = {}, fault = {}, file = "product/训练监测系统_v7.html") {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    timezoneId: "Asia/Shanghai",
    reducedMotion: "reduce",
  });
  const p = await ctx.newPage();
  p.setDefaultTimeout(8000);
  p.errs = [];
  p.on("pageerror", (e) => p.errs.push(e.message));
  p.on("dialog", (d) => d.accept());
  const cdp = await ctx.newCDPSession(p);
  await cdp.send("Page.enable");
  const seedScript = await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
    source:
      "localStorage.clear();for(const [k,v] of Object.entries(" +
      JSON.stringify(init) +
      "))localStorage.setItem(k,v);",
  });
  await p.addInitScript(({ init, fault }) => {
    const read = Storage.prototype.getItem;
    const write = Storage.prototype.setItem;
    const remove = Storage.prototype.removeItem;
    window.qaRaw = (k) => read.call(localStorage, k);
    window.qaFault = read.call(sessionStorage, "qa-disable-fault") ? {} : fault;
    window.qaWrote = false;
    Storage.prototype.getItem = function (k) {
      if (
        this === localStorage &&
        (window.qaFault.get === k || (window.qaFault.readback === k && window.qaWrote))
      ) {
        throw new DOMException("QA read denied " + k, "SecurityError");
      }
      return read.call(this, k);
    };
    Storage.prototype.setItem = function (k, v) {
      if (
        this === localStorage &&
        (window.qaFault.set === k || (window.qaFault.probe && k.startsWith("__physio_probe_")))
      ) {
        throw new DOMException("QA quota " + k, "QuotaExceededError");
      }
      const r = write.call(this, k, v);
      if (k === "physio-log.app-state.v2") window.qaWrote = true;
      return r;
    };
    Storage.prototype.removeItem = function (k) {
      if (this === localStorage && window.qaFault.removeProbe && k.startsWith("__physio_probe_")) {
        throw new DOMException("QA remove denied", "SecurityError");
      }
      return remove.call(this, k);
    };
  }, { init, fault });
  await p.goto("file://" + root + "/" + file);
  await cdp.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: seedScript.identifier });
  await p.waitForTimeout(150);
  return { p, ctx };
}

async function state(p) {
  return p.evaluate(
    (K) => ({
      viewChars: document.querySelector("#view-today").textContent.length,
      recovery: document.querySelector("#storRecoverBanner").textContent,
      toast: document.querySelector("#toast").textContent,
      raw: qaRaw(K.app),
      legacy: qaRaw(K.r),
    }),
    K,
  );
}

async function exp(p, id) {
  const wait = p.waitForEvent("download");
  await p.locator("#menuBtn").click();
  await p.locator('[data-act="export"]').click();
  const d = await wait;
  const raw = fs.readFileSync(await d.path(), "utf8");
  fs.writeFileSync(path.join(evidenceDir, id + "-export.json"), raw);
  return JSON.parse(raw);
}

async function imp(p) {
  await p.locator("#fileInput").setInputFiles({
    name: "qa.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ data: [newrow], _daily: { [newrow.d]: { sessions: [{ kind: "run", km: 5 }] } } }),
    ),
  });
  await p.waitForTimeout(200);
}

function expectCase(id, fn) {
  return async () => {
    try {
      const result = await fn();
      const pass = assertCase(id, result);
      results.push({ id, status: "completed", result, pass });
    } catch (e) {
      results.push({ id, status: "HARNESS_ERROR", error: String(e.stack || e) });
    }
    fs.writeFileSync(path.join(evidenceDir, "regression-results.json"), JSON.stringify(results, null, 2));
    console.log(id, results.at(-1).pass ?? results.at(-1).status);
  };
}

function assertCase(id, r) {
  switch (id) {
    case "delete-row-B1R2":
      return r.uniqueStillStored === false && r.uniqueAfterReload === false;
    case "empty-valid-v2-B1R2":
      return r.records === 0;
    case "seed-update-drops-local-daily":
      return (
        r.recordPreserved &&
        r.localDailyInExport?.sessions?.[0]?.km === 7.77 &&
        r.localDailyInStorage?.sessions?.[0]?.km === 7.77 &&
        r.newSeed
      );
    case "legacy-daily-read-denied-migration":
      return (
        !r.createdAuthorityDespiteReadFailure &&
        r.legacyRawPreserved &&
        r.afterRecoveryDaily?.sessions?.[0]?.km === 7.77
      );
    case "authority-read-denied-retry-drops-daily-baseline":
      return (
        r.initialAuthorityPreserved &&
        r.recordRescued &&
        r.dailyAfterRetry?.sessions?.[0]?.km === 7.77 &&
        r.baselineAfterRetry?.n === 14
      );
    case "invalid-v2-records-shape":
      return r.rawPreserved && r.originalInRescue && r.corruptFlag;
    case "v2-null-row":
      return r.recoveryMentionsQuarantine && r.exportHasBadRows;
    default:
      return false;
  }
}

(async () => {
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });

  await expectCase("delete-row-B1R2", async () => {
    const { p, ctx } = await fresh({ [K.app]: JSON.stringify(goodSnap) });
    await p.locator('[data-view=data]').click();
    await p.locator('.del[data-d="2099-06-01"]').click();
    const s = await state(p);
    const a = JSON.parse(s.raw);
    await p.reload();
    const b = JSON.parse((await state(p)).raw);
    const o = {
      toast: s.toast,
      uniqueStillStored: a.records.some((r) => r.d === unique.d),
      uniqueAfterReload: b.records.some((r) => r.d === unique.d),
      errors: p.errs,
    };
    await ctx.close();
    return o;
  })();

  await expectCase("empty-valid-v2-B1R2", async () => {
    const { p, ctx } = await fresh({
      [K.app]: JSON.stringify({
        ...goodSnap,
        records: [],
        daily: { ...goodSnap.daily, data: {} },
      }),
    });
    const e = await exp(p, "empty-B1R2");
    const o = { records: e.data.length, errors: p.errs };
    await ctx.close();
    return o;
  })();

  await expectCase("seed-update-drops-local-daily", async () => {
    const current = structuredClone(goodSnap);
    current.daily.data[unique.d] = {
      sessions: [{ kind: "run", start: "18:00", km: 7.77 }],
      note: "LOCAL-DAILY-ONLY",
    };
    const { p, ctx } = await fresh({ [K.app]: JSON.stringify(current) }, {}, "updated-seed.html");
    const e = await exp(p, "seed-daily");
    const stored = JSON.parse((await state(p)).raw);
    const o = {
      recordPreserved: e.data.some((r) => r.d === unique.d),
      localDailyInExport: e._daily[unique.d] ?? null,
      localDailyInStorage: stored.daily.data[unique.d] ?? null,
      newSeed: e.data.some((r) => r.d === "2026-10-07"),
      errors: p.errs,
    };
    await ctx.close();
    return o;
  })();

  await expectCase("legacy-daily-read-denied-migration", async () => {
    const daily = {
      stamp: "02808fbb",
      date: "2099-06-01",
      seed: ds._daily,
      data: { ...ds._daily, [unique.d]: { sessions: [{ kind: "run", start: "18:00", km: 7.77 }] } },
    };
    const raw = JSON.stringify(daily);
    const { p, ctx } = await fresh(
      { [K.r]: JSON.stringify(goodSnap.records), [K.v]: version, [K.d]: raw },
      { get: K.d },
    );
    const first = await state(p);
    await p.evaluate(() => sessionStorage.setItem("qa-disable-fault", "1"));
    await p.reload();
    await p.waitForFunction(
      () => localStorage.getItem("physio-log.app-state.v2")?.includes("2099-06-01"),
      null,
      { timeout: 10000 },
    );
    const e = await exp(p, "migration-daily");
    const o = {
      createdAuthorityDespiteReadFailure: !!first.raw,
      legacyRawPreserved: (await p.evaluate((k) => qaRaw(k), K.d)) === raw,
      afterRecoveryDaily: e._daily[unique.d] ?? null,
      recoveryBanner: (await state(p)).recovery,
      errors: p.errs,
    };
    await ctx.close();
    return o;
  })();

  await expectCase("authority-read-denied-retry-drops-daily-baseline", async () => {
    const current = structuredClone(goodSnap);
    current.daily.data[unique.d] = { sessions: [{ kind: "run", start: "18:00", km: 7.77 }] };
    current.baseline = { start: "2026-08-08", end: "2026-08-23", n: 14, mean: 4.55, sd: 0.1, locked: true };
    const original = JSON.stringify(current);
    const { p, ctx } = await fresh({ [K.app]: original }, { get: K.app });
    const before = await state(p);
    await p.evaluate(() => {
      window.qaFault = {};
    });
    await imp(p);
    await p.waitForTimeout(400);
    const after = await state(p);
    const a = JSON.parse(after.raw);
    const o = {
      initialAuthorityPreserved: before.raw === original,
      recordRescued: a.records.some((r) => r.d === unique.d),
      dailyAfterRetry: a.daily.data[unique.d] ?? null,
      baselineAfterRetry: a.baseline,
      toast: after.toast,
      errors: p.errs,
    };
    await ctx.close();
    return o;
  })();

  await expectCase("invalid-v2-records-shape", async () => {
    const original = JSON.stringify({ ...goodSnap, records: { recoverable: unique } });
    const { p, ctx } = await fresh({ [K.app]: original });
    const s = await state(p);
    const e = await exp(p, "invalid-v2-shape");
    const o = {
      rawPreserved: s.raw === original,
      originalInRescue: Boolean(e.quarantine?.corruptAppStateRaw?.includes("ONLY-LOCAL")),
      corruptFlag: e.storage?.corruptAuthority === true,
      records: e.data.length,
      errors: p.errs,
    };
    await ctx.close();
    return o;
  })();

  await expectCase("v2-null-row", async () => {
    const snap = structuredClone(goodSnap);
    snap.records = [unique, null];
    const { p, ctx } = await fresh({ [K.app]: JSON.stringify(snap) });
    const s = await state(p);
    const e = await exp(p, "v2-null-row");
    const o = {
      recoveryMentionsQuarantine: /quarantine|救援|解析/.test(s.recovery),
      exportHasBadRows: (e.quarantine?.badRows?.length || e.quarantine?.recordErrors?.length || 0) > 0,
      errors: p.errs,
    };
    await ctx.close();
    return o;
  })();

  await browser.close();
  const failed = results.filter((x) => !x.pass && x.status === "completed");
  fs.writeFileSync(path.join(evidenceDir, "regression-results.json"), JSON.stringify(results, null, 2));
  if (failed.length) {
    console.error("FAILED:", failed.map((x) => x.id));
    process.exitCode = 1;
  } else {
    console.log("All B1-R2 regression cases passed.");
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
