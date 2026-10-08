/** 从模板与数据集生成根目录 download.html（npm run build / pack / inject 自动调用） */
import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dataStamp } from "../src/shared/stamp.js";
import { VERSION, RELEASE } from "../src/shared/release.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_TEMPLATE = resolve(ROOT, "download.template.html");

export function fmtSize(bytes) {
  if (bytes == null) return null;
  if (bytes < 1024) return `约 ${bytes} B`;
  return `约 ${Math.round(bytes / 1024)} KB`;
}

export function buildDownloadMeta(ds) {
  const days = ds.data?.length || 0;
  const through = ds.data?.map((r) => r.d).sort().at(-1) || "—";
  const stamp = dataStamp(ds);
  return {
    days,
    through,
    stamp,
    metaLine: `数据截止 ${through} · ${days} 天 · 指纹 ${stamp}`,
  };
}

export function defaultZipSize(name, root = ROOT) {
  const downloadDir = resolve(root, "download");
  for (const p of [resolve(root, name), resolve(downloadDir, name)]) {
    if (existsSync(p)) {
      const label = fmtSize(statSync(p).size);
      return `${label}（${name}）`;
    }
  }
  return "打包后生成";
}

/** @param {object} ds 数据集
 *  @param {{ root?: string, templatePath?: string, version?: string, zipSize?: (name: string) => string }} [opts] */
export function renderDownloadHtml(ds, opts = {}) {
  const root = opts.root ?? ROOT;
  const templatePath = opts.templatePath ?? DEFAULT_TEMPLATE;
  const version = opts.version ?? VERSION;
  const zipSize = opts.zipSize ?? ((name) => defaultZipSize(name, root));
  const { days, through, stamp } = buildDownloadMeta(ds);
  const versionShort = version.replace(/^v/, "");

  return readFileSync(templatePath, "utf8")
    .replaceAll("{{version}}", version)
    .replaceAll("{{versionShort}}", versionShort)
    .replaceAll("{{dataThrough}}", through)
    .replaceAll("{{dataDays}}", String(days))
    .replaceAll("{{dataStamp}}", stamp)
    .replaceAll("{{zipBundle}}", RELEASE.zipBundle)
    .replaceAll("{{sourceZip}}", RELEASE.sourceZip)
    .replaceAll("{{monitorFile}}", RELEASE.monitor)
    .replaceAll("{{zipBundleSize}}", zipSize(RELEASE.zipBundle))
    .replaceAll("{{sourceZipSize}}", zipSize(RELEASE.sourceZip));
}

export function writeDownloadHtml(outPath, ds, opts = {}) {
  const html = renderDownloadHtml(ds, opts);
  writeFileSync(outPath, html);
  return html;
}

function main() {
  const dataPath = resolve(ROOT, process.argv[2] || "data/训练数据集.json");
  const ds = JSON.parse(readFileSync(dataPath, "utf8"));
  const { metaLine } = buildDownloadMeta(ds);
  writeDownloadHtml(resolve(ROOT, "download.html"), ds);
  console.log(`✓ download.html（${metaLine.replace(/^数据截止 /, "").replace(/ · 指纹 /, " · ")}）`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main();
}
