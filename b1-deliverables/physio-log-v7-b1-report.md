# 个人训练系统 v7 · B1 批次交付报告（R01 / R04 / R17）

基线：**B0-R1 独立验收通过源码**（`physio-log-v7-b0r1-source.zip`）。

## 范围

| 项 | 内容 |
|----|------|
| R01 | 坏缓存（独有正常行 + null/坏行）不丢行、不 silent 覆盖 legacy 原键 |
| R04 | 完整提交；分键半快照与假「已保存」消除 |
| R17 | 读键异常可完成初始化、明确提示、可导出可用数据 |

未改：内嵌真实训练数据、固定基线、历史档案、训练算法、科学解释、产品版本号与视觉交互。

## 存储契约

见源码 `docs/storage-contract-v7-b1.md`（权威键 `physio-log.app-state.v2`、ok/failed/unknown、迁移与 quarantine）。

## 测试与日志

| 门禁 | 结果 |
|------|------|
| `npm ci` | 已在 `/tmp/b1-work/src` 执行 |
| `npm test` | **69/69 PASS** → `npm-test.log` |
| `npm run lint` | PASS（仅 verify-update 既有 unused 警告） |
| `npm run check` / `check:release` | PASS |
| 冷 `npm run build` | PASS |
| `npm run test:update` | PASS |
| `npm run test:browser` | **1/1 PASS** → `playwright-test.log` |

### 原版失败（Vitest 内嵌 B0-R1 逻辑副本）

`tests/helpers/b0r1-legacy-storage.js` + `tests/storage-b1.test.js` 中 **「B0-R1 baseline failures」** 三节：

- R01：null 行导致整表解析失败 → 独有日期从结果集中消失且 legacy 键被 seed 合并覆盖。
- R04：`daily` 写入抛错 → `records`/`data-version` 已写入、`daily` 缺失。
- R17：`data-version` 的 `getItem` 抛错 → `legacyLoadRecords` 直接 throw。

### 修复后

同文件 **「B1 fixed storage」** 断言：救援独有行、legacy raw 不变、单键 commit 失败无 v2、读版本键失败仍可加载记录、v2 刷新往返一致。

## 浏览器验证环境

| 项 | 说明 |
|----|------|
| 浏览器 | Chromium **Headless Shell 156**（Playwright bundled） |
| 运行方式 | `npx serve release` → `http://127.0.0.1:4173` |
| 被测文件 | `release/训练监测系统_v7.html`（`npm run build:monitor` 产物） |
| `file://` | **未在本环境执行自动化**；file 协议下 localStorage 行为因浏览器而异，需人工 smoke |

集成用例：预置 legacy 坏行缓存 → 打开成品页 → reload → 断言 legacy 原文仍含独有日期且 v2 快照含该记录，并出现恢复/内存相关横幅。

## 产品行为变化（用户可见）

1. 本地数据优先写入 **单一 v2 快照**；保存失败或未确认时 **不会** toast「已保存/完成」。
2. 解析异常时顶部 **`storRecoverBanner`** 说明读键/救援状态；内存模式横幅在 `pendingCommit` 时也会显示。
3. 首次从 v1 迁移成功后 **不删除** legacy 键（旧 HTML 只读共存，完整并发方案留 B3）。

## 交付物（本目录）

| 文件 | 说明 |
|------|------|
| `source/` | 完整源码树 |
| `physio-log-v7-b1-source.zip` | 源码打包 |
| `physio-log-v7-b1-product.zip` | 未改数据指纹的成品 ZIP（与 B0 相同构建链） |
| `B1-vs-B0R1.diff` | 相对 B0-R1 全量 diff |
| `docs/storage-contract-v7-b1.md` | 契约（在 source 内） |
| `npm-test.log` / `playwright-test.log` | 测试原始输出 |

## 剩余问题

- B3：跨标签页 / 旧版 HTML 写 legacy 键与 v2 并发。
- B6：完整备份恢复产品能力（本批救援导出仅为独立材料）。
- `file://` 自动化未覆盖。
