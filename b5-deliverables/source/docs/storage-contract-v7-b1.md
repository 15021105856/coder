# 个人训练系统 v7 · B1–B1-R4 本地存储契约与迁移

## 权威读源

- **运行时唯一权威**：`physio-log.app-state.v2`（`STORAGE_KEYS.appState`）中的 **format 2 逻辑快照**。
- **legacy 键**（`records.v1`、`daily`、`baseline.v1`、`data-version`）仅在 **尚无可用 v2** 时只读参与迁移；**新代码不再写入** 这些键（与旧版 HTML 并发写入的完整方案留待 B3）。
- **主题 / 动效**（`theme`、`fx`）仍为独立键，不在本批快照内。

## 逻辑快照内容（单次完整提交）

一次 **保存成功** 必须原子写入同一 JSON，包含：

| 字段 | 含义 |
|------|------|
| `format` | 固定 `2` |
| `dataStamp` / `dataDate` | 与内嵌数据集 stamp 规则一致，供 stale 判定 |
| `records` | 全部训练日记录（归一化后） |
| `daily` | `{ stamp, date, seed, data }`，与旧 `daily.v1` 结构兼容 |
| `baseline` | 用户锁定基线对象或 `null` |
| `quarantine` | 可选：legacy 原文、逐行解析错误、读键失败摘要 |
| `savedAt` | ISO 时间 |

## 结构校验（B1-R2）

`parseSnapshot` 在 `format === 2` 之后必须校验：

- `records` 为 **数组**（否则视为 **结构损坏**，保留 `corruptAppStateRaw`，禁止 commit 覆盖）。
- `daily` 若存在：`daily.data` 为 plain object。
- `baseline` 若存在：plain object。

**合法空**：`records: []` 且结构校验通过 → 内存与导出均为 0 条，**不得**用内嵌 seed 自动重填。

**部分坏行**：数组内 null / 不可解析行 → 救援可读行，坏行进入 `quarantine`；界面与导出须可见。

## 保存语义

| 状态 | 含义 |
|------|------|
| **ok** | `setItem(v2)` 成功且 **读回字符串与写入一致**；刷新后应读到同一逻辑快照。 |
| **failed** | 确认 **未** 写入 v2（或已回滚）；界面 **不得** 提示「已保存/完成」。 |
| **unknown** | 写入后 **无法读回确认**；保留内存中的编辑，提示导出，**不得** 假定磁盘已更新。 |

## 提交意图（B1-R2，取代无条件并集）

- **内存 `records` 即用户意图**（删除、导入、编辑后的列表）；commit **不得**在写入前与磁盘记录做日期并集把已删行加回。
- **`overlayAuthorityOnCommit`**：仅在启动时 v2 **暂时不可读**（`authorityOverlayOnCommit`）且内存 daily/baseline 仍为 seed 占位时，从 **仍保留在磁盘上的可读 v2** 补回 daily/baseline，并与内存 records 一并提交；补回后清除 overlay 标志。
- **`corruptAuthority`**：损坏权威快照时 **拒绝** commit，仅内存编辑 + 救援导出。

## 读取与异常

- **可读 / 可写分离**：`probeWrite()` 失败只影响写入，**不**阻止读取已有 v2 / legacy。
- 诊断性 `snapshot()` **不得**因单键 `getItem` 失败而抛错（与浏览器 localStorage 行为一致）。
- 某键 `getItem` 抛错：记入 `readErrors`，界面 **如实说明无法读取该键**，不宣称已备份。
- **损坏的 v2 原文**：进入 `quarantine.corruptAppStateRaw`，**禁止**自动用 seed 覆盖该键；`corruptAuthority` 时拒绝 commit。
- 记录 JSON **整包损坏**：**不** 用 seed 覆盖 legacy 原键；`quarantine.legacyRecordsRaw` 保留原文。
- **不** 在读取失败时自动 `setItem` 覆盖 legacy `records.v1`。

## 迁移

1. 若 v2 存在且 **结构合法** → 直接加载；legacy 键 **不删除**。
2. 若 v2 不存在 → 从 legacy 键组装逻辑状态，按 **stamp / staleVer / seed 合并** 规则生成 `records`。
3. **迁移阻断（B1-R2）**：legacy 键 **存在** 但 daily 或 baseline **不可读** → **不** 写入 v2（`migration-blocked`），legacy 原文保留；故障解除后下次启动再迁移。
4. 尝试 **单次** 写入 v2；失败则 `migrationPending` + 内存/横幅提示，**legacy 键保持不变**。

## seed 合并与 daily（B1-R2）

- **v2 合法空** `records: []`：**不**触发 seed 持久化回填。
- **种子更新**（内嵌 DATA 新于快照）：合并 records 时，daily 使用 **`mergeDailyStore(新 DAILY_SEED, 快照 data, 快照 seed)`**，**禁止**整份替换为 `DAILY_SEED` 导致本地-only 日期丢失。

## 未保存编辑与导出

- `storage.memMode` / `storage.pendingCommit` / `!writeOk`：显示内存或只读横幅。
- **菜单「导出 JSON」** 合并 `buildRescueExportPayload`：`quarantine`、`readErrors`、`storage` 摘要随文件下载。
- 救援导出为 **独立恢复材料**，不替代 B6 完整备份恢复产品能力。

## seed 合并规则（records，未改算法）

- 与 B0-R1 相同：同日期 seed 覆盖缓存；文件 DATA 旧于缓存 `dataDate` 时保留缓存并 `staleVer`；否则按 stamp 合并并 **可** 持久化合并结果到 v2（不再写 legacy 双键）。

## B1-R4 消费与恢复约束（优先于上面的旧实现说明）

- 正常读取与权威暂时不可读后的恢复共用消费/种子迁移步骤。先从真实快照生成安全状态并按既有规则升级，再应用显式用户意图；只在完整迁移后登记新指纹。
- `records` 意图按日期记录新增/替换/删除；`daily` 导入另存实际输入的递归 patch，未提供的字段保留，数组整体替换。不能把占位 seed 的整天数据当作用户编辑。
- 多次未成功保存的 daily patch 累积，成功保存后清空。显式清除基线保持 null，不从磁盘恢复旧锁定。
- 所有存储来源的日期、数组成员、数值与基线经过同一消费边界。legacy daily 在三方合并前先验证，坏 seed 同样不能进入索引合并。
- quarantine 先归一化再合并；错误数组不能直接 spread 未检查的值。
- 清理的 day / field / row 原值连同来源路径和原因进入 `dailyStructureIssues`；异常 v2 另以 `originalSnapshots` 保存原始字符串。旧键及解析失败的版本原文保留。成功 commit 继续携带救援材料，不默默丢弃。
- 内存降级适配器明确 `persistent:false`、稳定复用，并保留访问失败原因。它不能通过自身 probe 或读回把编辑宣称为本机持久保存；恢复真实访问后仍按未知权威的恢复流程合并。
- 版本元数据区分缺失、可读有效、不可读、不可解析。存在但不可读/不可解析时，启动及显式提交均阻断迁移；可读旧 records 保留作工作状态和救援导出，不按未知版本用 seed 替代同日旧值。
- 以上不改变有效元数据下的 records seed 优先规则，不涵盖 B3 并发写入协议与 B6 完整备份恢复。
