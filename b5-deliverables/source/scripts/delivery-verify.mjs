/** 校验最终交付物与源数据集一致（HTML / JSON / DOCX / ZIP / 下载页） */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { parseDatasetFromHtml, datasetPayloadEqual } from "./dataset-from-html.mjs";
import { buildDownloadMeta } from "./gen-download.mjs";
import { dataStamp } from "../src/shared/stamp.js";
import { RELEASE } from "../src/shared/release.js";

const ZIP_MEMBERS = [RELEASE.monitor, RELEASE.archive, RELEASE.docx, "训练数据集.json", RELEASE.rules];

export function readZipText(zipPath, member) {
  return execFileSync("unzip", ["-p", zipPath, member], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

export function readZipBytes(zipPath, member) {
  return execFileSync("unzip", ["-p", zipPath, member], { maxBuffer: 64 * 1024 * 1024 });
}

export function listZipMembers(zipPath) {
  return execFileSync("unzip", ["-Z1", zipPath], { encoding: "utf8" })
    .trim()
    .split("\n")
    .filter(Boolean);
}

export function assertDocxContainsStamp(docxPath, stamp) {
  execFileSync("unzip", ["-tqq", docxPath]);
  const xml = readZipText(docxPath, "word/document.xml");
  assert(xml.includes(stamp), `${docxPath} 未包含预期数据指纹 ${stamp}`);
}

export function assertDocxBufferContainsStamp(buf, stamp, label = "DOCX") {
  const dir = mkdtempSync(resolve(tmpdir(), "physio-docx-"));
  try {
    const p = resolve(dir, "probe.docx");
    writeFileSync(p, buf);
    assertDocxContainsStamp(p, stamp);
  } catch (e) {
    throw new Error(`${label}: ${e.message}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function assertJsonDatasetEquals(actual, expected, label) {
  assert.deepEqual(actual, expected, `${label} 完整 JSON 与源数据不一致`);
}

export function assertHtmlDatasetEquals(html, expected, label) {
  assert(
    datasetPayloadEqual(parseDatasetFromHtml(html), expected),
    `${label} 内嵌 data/_daily/_baseline/_fields/_meta 与源数据不一致`,
  );
}

export function assertZipDelivery(zipPath, ds, stamp, label = zipPath) {
  const members = listZipMembers(zipPath);
  assert.equal(members.length, 5, `${label} ZIP 成员数应为 5，实际 ${members.length}`);
  assert(!members.includes("stale.txt"), `${label} ZIP 仍含 stale.txt`);
  for (const name of ZIP_MEMBERS) assert(members.includes(name), `${label} ZIP 缺少 ${name}`);

  const zipJson = JSON.parse(readZipText(zipPath, "训练数据集.json"));
  assertJsonDatasetEquals(zipJson, ds, `${label} / 训练数据集.json`);

  assertHtmlDatasetEquals(readZipText(zipPath, RELEASE.monitor), ds, `${label} / ${RELEASE.monitor}`);
  assertHtmlDatasetEquals(readZipText(zipPath, RELEASE.archive), ds, `${label} / ${RELEASE.archive}`);

  assertDocxBufferContainsStamp(readZipBytes(zipPath, RELEASE.docx), stamp, `${label} / ${RELEASE.docx}`);
}

/**
 * @param {string} root 项目根目录
 * @param {object} ds 期望源数据集对象
 * @param {string} [stage] 日志标签
 */
export function verifyFullDelivery(root, ds, stage = "delivery") {
  const stamp = dataStamp(ds);
  const { metaLine } = buildDownloadMeta(ds);

  for (const name of [RELEASE.monitor, RELEASE.archive]) {
    const p = resolve(root, "release", name);
    assert(existsSync(p), `${stage}: 缺少 release/${name}`);
    assertHtmlDatasetEquals(readFileSync(p, "utf8"), ds, `${stage} release/${name}`);
  }

  const releaseJsonPath = resolve(root, "release", "训练数据集.json");
  assert(existsSync(releaseJsonPath), `${stage}: 缺少 release/训练数据集.json`);
  assertJsonDatasetEquals(JSON.parse(readFileSync(releaseJsonPath, "utf8")), ds, `${stage} release/训练数据集.json`);

  const releaseDocx = resolve(root, "release", RELEASE.docx);
  assert(existsSync(releaseDocx), `${stage}: 缺少 release/${RELEASE.docx}`);
  assertDocxContainsStamp(releaseDocx, stamp);

  for (const folder of ["download"]) {
    for (const name of [RELEASE.monitor, RELEASE.archive, "训练数据集.json", RELEASE.docx]) {
      const p = resolve(root, folder, name);
      assert(existsSync(p), `${stage}: 缺少 ${folder}/${name}`);
      if (name.endsWith(".html")) assertHtmlDatasetEquals(readFileSync(p, "utf8"), ds, `${stage} ${folder}/${name}`);
      else if (name.endsWith(".json")) assertJsonDatasetEquals(JSON.parse(readFileSync(p, "utf8")), ds, `${stage} ${folder}/${name}`);
      else if (name.endsWith(".docx")) assertDocxContainsStamp(p, stamp);
    }
  }

  for (const rel of [RELEASE.zipBundle, `download/${RELEASE.zipBundle}`]) {
    const zp = resolve(root, rel);
    assert(existsSync(zp), `${stage}: 缺少 ${rel}`);
    assertZipDelivery(zp, ds, stamp, `${stage} ${rel}`);
  }

  for (const rel of ["download.html", "download/download.html"]) {
    const p = resolve(root, rel);
    assert(existsSync(p), `${stage}: 缺少 ${rel}`);
    assert(readFileSync(p, "utf8").includes(metaLine), `${stage}: ${rel} 未包含 ${metaLine}`);
  }
}
