/** 从单文件 HTML 中提取 id="dataset" 内嵌 JSON（与构建/embed 格式一致） */
import { readFileSync } from "node:fs";

const RE = /<script type="application\/json" id="dataset">\s*([\s\S]*?)\s*<\/script>/;

export function parseDatasetFromHtml(html) {
  const m = RE.exec(html);
  if (!m) throw new Error("HTML 中找不到 <script id=\"dataset\"> 块");
  return JSON.parse(m[1].replace(/\\\//g, "/"));
}

export function readDatasetFromHtml(path) {
  return parseDatasetFromHtml(readFileSync(path, "utf8"));
}

/** 比较两份数据集的关键字段（data + _daily） */
export function datasetPayloadEqual(a, b) {
  return JSON.stringify(a.data) === JSON.stringify(b.data)
    && JSON.stringify(a._daily ?? null) === JSON.stringify(b._daily ?? null)
    && JSON.stringify(a._baseline ?? null) === JSON.stringify(b._baseline ?? null)
    && JSON.stringify(a._fields ?? null) === JSON.stringify(b._fields ?? null)
    && JSON.stringify(a._meta ?? null) === JSON.stringify(b._meta ?? null);
}
