import { describe, it, expect } from "vitest";
import { VERSION, RELEASE } from "../src/shared/release.js";

describe("release", () => {
  it("当前版本为 v7", () => {
    expect(VERSION).toBe("v7.0");
    expect(RELEASE.monitor).toBe("训练监测系统_v7.html");
    expect(RELEASE.archive).toBe("个人训练档案_v7.html");
    expect(RELEASE.docx).toBe("个人训练档案_v7.docx");
    expect(RELEASE.rules).toBe("系统维护规则v7.md");
    expect(RELEASE.zipBundle).toBe("个人训练系统_v7.zip");
    expect(RELEASE.sourceZip).toBe("个人训练系统_源码_v7.zip");
  });
});
