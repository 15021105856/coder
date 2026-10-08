# 个人训练系统 v7 · B0-R1 返工修复报告

**日期**：2026-10-08  
**依据**：独立复核 `physio-v7-b0-review-2026-10-08.md`  
**范围**：B0-A01、B0-A02（不进入 B1）  
**判定**：**PASS**（针对返工项）

---

## 1. 复核结论与返工原因

首轮 B0 已通过冷构建与正常更新路径，但自动验收存在两处漏检：

| ID | 问题 | 后果 |
|---|---|---|
| **B0-A01** | `checkDownloadHtml` 在文件缺失时直接 `return` | 删除 `download.html` 后 `--release` 仍退出 0 |
| **B0-A02** | `test:update` 未解包 ZIP、未校验 Word 新指纹 | ZIP 内 JSON 被篡改、Word 保留旧指纹时测试仍成功 |

---

## 2. 返工内容

### 2.1 B0-A01：必需下载页缺失必须失败

- 抽出 `scripts/check-download.mjs`，支持 `required: true`。
- `npm run check:release`：**必须**存在且匹配根 `download.html`。
- `node scripts/check.mjs --release --published`：**必须**存在且匹配 `download/download.html`。
- 源检查 `npm run check` 仍不依赖任何生成物。
- inject staging（`PHYSIO_RELEASE_DIR`）仍跳过下载页，避免 pack 前误报。

**回归测试**：`tests/check-download-gate.test.js`（7 项）

### 2.2 B0-A02：test:update 全量交付校验

- 新增 `scripts/delivery-verify.mjs`：
  - 解包根 ZIP 与 `download/` 下 ZIP；
  - 比对 HTML 内嵌 dataset、JSON **完整对象**、DOCX 内 `word/document.xml` 中的**动态指纹**；
  - 校验 `release/`、`download/` 副本及两个 download 页元数据行。
- `verify-update.mjs` 在 bootstrap、build 成功、inject 成功后各调用一次 `verifyFullDelivery`。
- 隔离副本 filter **排除**根 `download.html`，保证每次冷启动真实。

---

## 3. 修改文件

| 文件 | 说明 |
|---|---|
| `scripts/check-download.mjs` | 新增，下载页检查逻辑 |
| `scripts/delivery-verify.mjs` | 新增，交付物全量校验 |
| `scripts/check.mjs` | 调用 check-download，必需文件缺失报错 |
| `scripts/verify-update.mjs` | 全量校验 + 排除 download.html |
| `tests/check-download-gate.test.js` | 新增，门禁行为测试 |
| `docs/B0-R1修复说明.md` | 简要说明 |

首轮 B0 已改文件（`gen-download.mjs`、`pack.mjs`、`gen-download.test.js`）保持首轮语义，未扩大范围。

---

## 4. 验收结果

**环境**：Linux，Node.js **v22.14.0**（复核方使用 v24.19.0 的结果未在本机复测）

| 验收 | 命令 / 方式 | 退出码 |
|---|---|:---:|
| 单元测试 | `npm test` | 0（**62/62**） |
| Lint | `npm run lint` | 0 |
| 源检查 | `npm run check`（无 download 产物） | 0 |
| 冷构建 | 空产物目录 `npm run build` | 0 |
| 更新集成 | `npm run test:update` | 0 |
| 缺根 download | `check --release` | **1** |
| 缺 published download | `check --release --published` | **1** |
| 源检查 + 坏 download | `npm run check` | 0 |
| ZIP JSON 故障注入 | 篡改 pack 后 `test:update` | **1** |

原始 `data/训练数据集.json` 与证据包 **逐字节一致**；交付 ZIP 由未修改真实数据生成。

---

## 5. 未验证

- GitHub Actions 远端 runner  
- Node 20 / 24 矩阵  
- Safari / 真机  
- B1–B9 产品缺陷  

---

## 6. 结论

**B0-R1 PASS** — 复核指出的两项自动验收缺陷已修复并有测试/日志支撑。  
**仍不代表**全 v7 可靠性放行；B1 数据读写边界尚未实施。
