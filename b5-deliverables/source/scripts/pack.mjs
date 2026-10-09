/** 校验交付、准备完整 ZIP，再逐文件发布；可捕获失败回滚。 */
import { cpSync, mkdirSync, rmSync, readFileSync, mkdtempSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { RELEASE } from "../src/shared/release.js";
import { publishFiles } from "./publish-files.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = resolve(ROOT, process.argv[2] || "data/训练数据集.json");
const RELEASE_DIR = resolve(ROOT, "release");
const DOWNLOAD_DIR = resolve(ROOT, "download");

execFileSync(process.execPath, [resolve(ROOT, "scripts/gen-download.mjs"), DATA], { stdio: "inherit" });
execFileSync(process.execPath, [resolve(ROOT, "scripts/check.mjs"), DATA, "--release"], { stdio: "inherit" });

const staging = mkdtempSync(resolve(ROOT, ".pack-"));
const names = [RELEASE.monitor, RELEASE.archive, RELEASE.docx, "训练数据集.json", RELEASE.rules];
try {
  const payload = resolve(staging, "payload");
  mkdirSync(payload);
  for (const name of names.slice(0, 3)) cpSync(resolve(RELEASE_DIR, name), resolve(payload, name));
  cpSync(DATA, resolve(payload, "训练数据集.json"));
  cpSync(resolve(ROOT, "docs", RELEASE.rules), resolve(payload, RELEASE.rules));
  const zip = resolve(staging, "bundle.zip");
  execFileSync("zip", ["-q", "-j", zip, ...names], { cwd: payload });
  execFileSync("unzip", ["-tqq", zip]);
  const lastDay = JSON.parse(readFileSync(DATA, "utf8")).data.at(-1).d.replace(/-/g, "");
  const zipStem = RELEASE.zipBundle.replace(/\.zip$/i, "");
  const zipMain = resolve(ROOT, RELEASE.zipBundle);
  const zipDated = resolve(ROOT, `${zipStem}_${lastDay}.zip`);
  publishFiles([
    ...names.map((n) => [resolve(payload, n), resolve(DOWNLOAD_DIR, n)]),
    [resolve(payload, "训练数据集.json"), resolve(RELEASE_DIR, "训练数据集.json")],
    [resolve(payload, RELEASE.rules), resolve(RELEASE_DIR, RELEASE.rules)],
    [zip, zipMain],
    [zip, zipDated],
    [zip, resolve(DOWNLOAD_DIR, RELEASE.zipBundle)],
  ]);
  execFileSync(process.execPath, [resolve(ROOT, "scripts/gen-download.mjs"), DATA], { stdio: "inherit" });
  publishFiles([
    [resolve(ROOT, "download.html"), resolve(DOWNLOAD_DIR, "download.html")],
  ]);
  execFileSync(process.execPath, [resolve(ROOT, "scripts/check.mjs"), DATA, "--release", "--published"], { stdio: "inherit" });
  console.log(`✓ 已校验并发布 5 个交付文件、download.html 及 ZIP：${zipMain}`);
} finally {
  rmSync(staging, { recursive: true, force: true });
}
