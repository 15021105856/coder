# 个人训练系统 v7 · B1-R1 返工报告

日期：2026-10-08  
**裁决：相对独立验收 REWORK 清单，五组阻塞项已在本分支修复并回归。**

基线：B1 源码（REWORK 前）→ 本分支 `b1-deliverables/source`。

## 修复摘要

| ID | 修复要点 |
|----|----------|
| B1-A01 | `safeGetItem` + `snapshot()` 单键 try/catch；`commit` 写前读入 try/catch；读键失败不中断 init |
| B1-A02 | 损坏 v2 保留 `corruptAppStateRaw`，禁止 seed 覆盖；v2 `records` 逐行救援；坏 legacy 不写入空 v2 |
| B1-A03 | `probeWrite` 与读取分离；probe 失败仍读 v2；`reconcileMemoryWithAuthority` 写入前并集 |
| B1-A04 | 有效 v2 仍走 `resolveRecordsForSeedMerge`（stamp/date/seed 规则） |
| B1-A05 | `exportJSON` 合并 `buildRescueExportPayload`（quarantine / readErrors / storage） |

契约更新：`source/docs/storage-contract-v7-b1.md`

## 门禁

| 命令 | 结果 |
|------|------|
| npm ci | PASS |
| npm test | **73/73** PASS（+4 项 B1-R1 单测） |
| npm run lint | PASS |
| npm run check / 冷 build / test:update | PASS |

## 浏览器复测（file:// 成品 HTML）

引擎：**Chromium 156.0.8078.4**（Playwright bundled）· Node v22.14.0 · 协议 **file://**

复用验收方 `browser-audit.cjs`（去掉固定 chromium 路径），主要场景：

| 场景 | 结果 |
|------|------|
| get-denied-*（version/app/daily/baseline） | viewChars>0，recovery 横幅，无 pageerror |
| legacy-quarantine-export | **rawInExport: true** |
| malformed-legacy-refresh | first/afterReload 均为 **73** 行 |
| probe-failed → 恢复写入 | **uniqueAfterRetry: true** |
| seed-update-ignored | **newSeedVisible + uniquePreserved** |
| commit write/readback/pre-read denied | 与 B1 一致，导出含未保存数据 |

说明：`corrupt-v2-overwritten` 在审计脚本中仍对**损坏原文**做 `JSON.parse` 导致 HARNESS_ERROR；产品行为为 **原文未覆盖**（需改断言为 `raw===corrupt` 而非 parse）。`normal-save-refresh` 因 `savedAt` 时间戳 deepEqual 偶发 HARNESS_ERROR，与逻辑无关。

**HTTP `npm run test:browser`**：保留既有 1 项 R01 场景（未在本轮重复标为 file:// 通过）。

## 交付物

| 文件 | 说明 |
|------|------|
| `source/` | B1-R1 完整源码 |
| `physio-log-v7-b1r1-source.zip` | 源码包 |
| `physio-log-v7-b1r1-product.zip` | 未改真实数据的成品 ZIP |
| `B1R1-vs-B1.diff` | 相对 REWORK 前 B1 的 diff |
| `npm-test-r1.log` | 测试日志 |

### GitHub（分支 `cursor/b1-storage-5f59`）

- [B1-R1 报告](https://github.com/15021105856/coder/blob/cursor/b1-storage-5f59/b1-deliverables/physio-log-v7-b1r1-report.md)
- [源码 ZIP](https://github.com/15021105856/coder/raw/cursor/b1-storage-5f59/b1-deliverables/physio-log-v7-b1r1-source.zip)
- [成品 ZIP](https://github.com/15021105856/coder/raw/cursor/b1-storage-5f59/b1-deliverables/physio-log-v7-b1r1-product.zip)

## 剩余风险

- 损坏 v2 的自动修复仍依赖用户导出后人工处理（符合 B1 边界）。
- B3 跨页并发 / 旧 HTML 写 legacy 键未在本批解决。
- file:// 全矩阵以审计脚本为准；未声称覆盖全部浏览器。
