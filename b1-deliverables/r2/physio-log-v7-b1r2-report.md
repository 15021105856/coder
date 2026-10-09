# 个人训练系统 v7 · B1-R2 返工报告

日期：2026-10-09  
**说明：本报告为开发方自测与交付说明，不声称独立验收 PASS。**

基线：B1-R1 源码（独立验收 REWORK，报告 `physio-v7-b1r1-review-2026-10-09.md`）→ 本分支 `b1-deliverables/source`。

## 四组阻断项回应

| ID | 根因（B1-R1） | B1-R2 修复 | 验证 |
|----|---------------|------------|------|
| B1R1-A01 | 写入前 `reconcileMemoryWithAuthority` 记录并集；合法空 v2 被 seed 回填 | 去掉无条件并集；`resolveRecordsForSeedMerge` 对 `origin:"v2"` 且 `records:[]` 标记 `validEmpty`；commit 以内存 records 为准 | 单测 A01×2；file:// `delete-row-B1R2`、`empty-valid-v2-B1R2` |
| B1R1-A02 | 种子合并时整份 `DAILY_SEED` 替换 daily | `mergeDailyForSeedUpdate` + `mergeDailyStore` 三方合并 | 单测 A02；file:// `seed-update-drops-local-daily` |
| B1R1-A03 | legacy 组件不可读仍写 v2；authority 不可读恢复只并 records | `legacyMigrationBlocked`（`listKeys`+不可读）；`loadAuthorityUnreadable` + `overlayAuthorityOnCommit` 补全 disk records/daily/baseline 再提交 | 单测 A03×3；file:// legacy 迁移阻断与 authority 重试 |
| B1R1-A04 | 非数组 `records` 当可用 v2；静默覆盖 | `validateSnapshotStructure` → corrupt 路径；保留 `corruptAppStateRaw`；`corruptAuthority` 拒绝 commit | 单测 A04；file:// `invalid-v2-records-shape`、`v2-null-row` |

契约：`source/docs/storage-contract-v7-b1.md`（增补 B1-R2 状态机、overlay、合法空、迁移阻断）。

## 门禁（实际运行）

| 命令 | 退出码 | 备注 |
|------|--------|------|
| npm ci | 0 | Node v22.14.0 |
| npm test | 0 | **80/80**（+7 项 B1-R2 相关） |
| npm run lint | 0 | 既有 warning，无 error |
| npm run check | 0 | 数据集 73 天 · 02808fbb |
| npm run build | 0 | 含 test/lint/check/发布 |
| npm run test:update | 0 | 隔离冷 build + inject |

## file:// 回归（Playwright bundled Chromium）

脚本：`b1-deliverables/b1r2-evidence/regression-b1r2.cjs`（对 `release/训练监测系统_v7.html` 与 `updated-seed.html`）。  
结果见 `b1r2-evidence/evidence/regression-results.json`（`pass: true` 为断言通过，非仅 `completed`）。

## 交付物

| 文件 | 说明 |
|------|------|
| `physio-log-v7-b1r2-source.zip` | 可冷构建源码（含锁文件、测试、契约） |
| `physio-log-v7-b1r2-product.zip` | 本轮 build 的 `个人训练系统_v7.zip` |
| `B1R2-vs-B1R1.diff` | 相对 B1-R1 提交 `352b1dc` 的实现差异 |
| `physio-log-v7-b1r2-evidence.zip` | 回归脚本、结果 JSON、命令日志、导出样本 |

## 未覆盖边界

- 损坏 v2 的字段组合未穷尽（仅覆盖 review 反例及 records 类型错误）。
- B3 并发写 legacy、B6 完整备份恢复未实现。
- 未改真实训练数据集字节内容（build 仍 73 天主数据；测试用 2099-* 隔离日期）。
