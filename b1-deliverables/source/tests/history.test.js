import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseHistory, dayPattern, countMatches } from "../src/archive/history.js";

const md = readFileSync(resolve(import.meta.dirname, "../data/训练历史存档.md"), "utf8");
const H = parseHistory(md);

describe("parseHistory", () => {
  it("解析冻结时点与统计", () => {
    expect(H.frozen).toBe("2026-10-02");
    expect(H.stats.chapters).toBeGreaterThan(10);
    expect(H.blocks.some((b) => b.kind === "table")).toBe(true);
  });

  it("dayPattern 匹配两种日期写法", () => {
    const text = "9/9 正文 9月9日标题";
    expect(countMatches(text, dayPattern("2026-09-09"))).toBe(2);
  });
});
