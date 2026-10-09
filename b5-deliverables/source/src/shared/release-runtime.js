/** 浏览器端读取构建注入的交付常量；开发模式回退到 release.js 默认值 */
import { RELEASE } from "./release.js";

export function getRelease() {
  const injected = typeof window !== "undefined" ? window.__RELEASE__ : null;
  return injected && typeof injected === "object" ? { ...RELEASE, ...injected } : RELEASE;
}

export function getMonitorHref() {
  return import.meta.env?.DEV ? "/" : getRelease().monitor;
}

export function getArchiveHref() {
  return import.meta.env?.DEV ? "/archive.html" : getRelease().archive;
}

export function checkExpectedStamp(actual) {
  const expected = typeof window !== "undefined" ? window.__EXPECTED_STAMP__ : null;
  if (expected && expected !== actual) {
    console.warn(`[physio-log] 内嵌数据集指纹 ${actual} 与构建预期 ${expected} 不符，请使用最新构建产物`);
    return false;
  }
  return true;
}

export { RELEASE, VERSION } from "./release.js";
