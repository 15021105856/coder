import { test, expect } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { dataStamp } from "../../src/shared/stamp.js";

const DATASET = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../../data/训练数据集.json"), "utf8"),
);
const DATA_STAMP = dataStamp(DATASET);
const MONITOR = resolve(import.meta.dirname, "../../release/训练监测系统_v7.html");
test.skip(!existsSync(MONITOR), "需要先 npm run build:monitor 生成成品 HTML");
const UNIQUE = { d: "2099-06-01", el: 77, type: "browser-test" };

test.describe("训练监测系统成品 HTML · 持久化路径", () => {
  test("R01: 坏行缓存刷新后仍保留独有记录", async ({ page }) => {
    await page.goto("/训练监测系统_v7.html");
    await page.waitForSelector("#verBadge");
    await page.evaluate(({ UNIQUE, DATA_STAMP, dsDate }) => {
      localStorage.setItem(
        "physio-log.records.v1",
        JSON.stringify([UNIQUE, null]),
      );
      localStorage.setItem(
        "physio-log.data-version",
        JSON.stringify({ s: DATA_STAMP, d: dsDate }),
      );
      localStorage.removeItem("physio-log.app-state.v2");
    }, { UNIQUE, DATA_STAMP, dsDate: DATASET._meta?.data_through });
    await page.reload();
    await page.waitForSelector("#verBadge");
    const count = await page.evaluate(() => {
      const raw = localStorage.getItem("physio-log.records.v1");
      const v2 = localStorage.getItem("physio-log.app-state.v2");
      const hasUnique = (list) => list?.some?.((r) => r?.d === "2099-06-01");
      let v2Has = false;
      if (v2) {
        try {
          v2Has = hasUnique(JSON.parse(v2).records);
        } catch {
          v2Has = false;
        }
      }
      return { legacyRaw: raw, v2Has };
    });
    expect(count.legacyRaw).toContain("2099-06-01");
    expect(count.v2Has).toBe(true);
    await expect(page.locator("#storRecoverBanner.on, #memBanner.on").first()).toBeVisible();
  });
});
