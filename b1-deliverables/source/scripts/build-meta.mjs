/** 构建 / inject 共用的 BUILD_META 与 runtime 注入块 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { RELEASE, VERSION } from "../src/shared/release.js";
import { dataStamp } from "../src/shared/stamp.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATASET = resolve(ROOT, "data/训练数据集.json");

export function buildMeta(datasetPath = DATASET) {
  let commit = "unknown";
  try { commit = execSync("git rev-parse --short HEAD", { encoding: "utf8", cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { /* no git */ }
  const built = new Date().toISOString().slice(0, 10);
  const ds = JSON.parse(readFileSync(datasetPath, "utf8"));
  const stamp = dataStamp(ds);
  return { commit, built, stamp, VERSION, RELEASE };
}

export function buildMetaComment(meta) {
  return `<!-- built from src/ @ ${meta.built} · ${meta.VERSION} · commit=${meta.commit} · stamp=${meta.stamp} -->`;
}

export function runtimeInjectScript(meta) {
  return `<script>window.__RELEASE__=${JSON.stringify(meta.RELEASE)};window.__EXPECTED_STAMP__=${JSON.stringify(meta.stamp)};</script>`;
}

/** 更新已构建 HTML 中的 BUILD_META 与 __EXPECTED_STAMP__ */
export function patchHtmlMeta(html, meta) {
  const comment = buildMetaComment(meta);
  const runtime = runtimeInjectScript(meta);
  let out = html;
  if (/<!-- built from src\/ @/.test(out)) {
    out = out.replace(/<!-- built from src\/ @[^>]+ -->/, comment);
  } else if (out.includes("<!--BUILD_META-->")) {
    out = out.replace("<!--BUILD_META-->", comment);
  }
  if (/<script>window\.__RELEASE__=/.test(out)) {
    out = out.replace(/<script>window\.__RELEASE__=[\s\S]*?<\/script>/, runtime);
  } else if (out.includes("<!--RUNTIME_INJECT-->")) {
    out = out.replace("<!--RUNTIME_INJECT-->", runtime);
  }
  if (!out.includes(`window.__EXPECTED_STAMP__=${JSON.stringify(meta.stamp)}`)) throw new Error("缺少运行时注入标记，请 npm run build");
  return out;
}
