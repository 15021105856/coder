# 个人训练系统 v7 · B1 本地存储契约与迁移

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

## 保存语义

| 状态 | 含义 |
|------|------|
| **ok** | `setItem(v2)` 成功且 **读回字符串与写入一致**；刷新后应读到同一逻辑快照。 |
| **failed** | 确认 **未** 写入 v2（或已回滚）；界面 **不得** 提示「已保存/完成」。 |
| **unknown** | 写入后 **无法读回确认**；保留内存中的编辑，提示导出，**不得** 假定磁盘已更新。 |

## 读取与异常

- 某键 `getItem` 抛错：记入 `readErrors`，界面 **如实说明无法读取该键**，不宣称已备份。
- 记录 JSON **整包损坏**：**不** 用 seed 覆盖 legacy 原键；`quarantine.legacyRecordsRaw` 保留原文；内存展示仍可按 seed 合并规则计算，但持久化时 **不把 seed-only 结果当作救援完成**（`persistRecords` 可为空数组 + quarantine）。
- 记录数组 **部分坏行**：救援可读行；坏行进入 `quarantine`，**不** 无声改写原文。
- **不** 在读取失败时自动 `setItem` 覆盖 legacy `records.v1`。

## 迁移

1. 若 v2 存在且可解析 → 直接加载，legacy 键 **不删除**。
2. 若 v2 不存在 → 从 legacy 键组装逻辑状态，按既有 **stamp / staleVer / seed 合并** 规则生成 `records`。
3. 尝试 **单次** 写入 v2；失败则 `migrationPending` + 内存/横幅提示，**legacy 键保持不变**。
4. 迁移中断后再次打开：仍从 legacy + 部分 v2 恢复，**不会** 形成两个同等权威的写入目标（仅 v2 可写）。

## 未保存编辑与导出

- `storage.memMode` / `storage.pendingCommit`：显示内存横幅；导出 JSON 始终从 **当前内存** 生成（含救援包字段 `buildRescueExportPayload`）。
- 救援导出为 **独立恢复材料**，不替代 B6 完整备份恢复产品能力。

## seed 合并规则（未改）

- 与 B0-R1 相同：同日期 seed 覆盖缓存；文件 DATA 旧于缓存 `dataDate` 时保留缓存并 `staleVer`；否则按 stamp 合并并 **可** 持久化合并结果到 v2（不再写 legacy 双键）。
