/** 下载页产物检查（供 check.mjs 与单测使用） */
import { existsSync, readFileSync } from "node:fs";

/**
 * @param {string} path
 * @param {string} label
 * @param {string} downloadMetaLine
 * @param {{ required?: boolean, err: (layer: string, msg: string) => void, ok?: (msg: string) => void }} opts
 */
export function checkDownloadHtmlAt(path, label, downloadMetaLine, opts) {
  const { required = false, err, ok = () => {} } = opts;
  if (!existsSync(path)) {
    if (required) err("下载页", `缺少必需文件：${label}（${path}）`);
    return;
  }
  const dl = readFileSync(path, "utf8");
  if (!dl.includes(downloadMetaLine)) err("下载页", `${label} 与数据集不一致（期望：${downloadMetaLine}）`);
  else ok(`✓ ${label} 与数据集一致`);
}
