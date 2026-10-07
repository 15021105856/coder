# B0 执行报告：构建与更新验证流程修复

**日期**：2026-10-07  
**范围**：R11 / B0（仅构建、检查、下载页生成、更新验证）  
**基线**：证据包 `source/`（SHA-256 与原始 v7 源码 ZIP 一致）  
**判定**：**PASS**

---

## 1. 原始失败与复现证据

### 1.1 冷构建测试失败（TEST-01 / R11）

**环境**：`/tmp/b0-work/src`，无 `release/`、`download/`、`download.html`

```bash
npm ci && npm test
# 退出码 1
# tests/gen-download.test.js:21 expect(existsSync('../download/download.html')).toBe(true) → false
# 54 passed | 1 failed (55 total)
```

**根因**：`gen-download.test.js` 依赖已生成的 `download/download.html`，并硬编码活跃指纹 `02808fbb` 与 `73 天`。

### 1.2 源检查与下载页依赖环（BUILD-01 / R11）

**复现**：

```bash
node scripts/gen-download.mjs          # 生成匹配 02808fbb 的 download.html
# 修改 data/训练数据集.json 末行 pro+=1 → 指纹变为 16ea7073
npm run check
# 退出码 1
# ✗ [下载页] download.html 与数据集不一致（期望：…指纹 16ea7073）
```

**根因**：`scripts/check.mjs` 在**源检查**阶段校验既有 `download.html`，而 `inject` / `build` / `test:update` 均先跑 `check`，数据更新被阻断。

### 1.3 更新集成验证失效

**复现**（修复前，`test:update` 依赖宿主已有 `release/` 且被下载页检查阻断）：

```bash
npm run test:update
# 退出码非 0；或需先手工 gen-download / 预置 release
```

---

## 2. 修改文件、原因与调用顺序变化

| 文件 | 变更 | 原因 |
|---|---|---|
| `scripts/gen-download.mjs` | 导出 `buildDownloadMeta`、`renderDownloadHtml`、`defaultZipSize`、`writeDownloadHtml` | 测试可调用生成器，不依赖既有产物 |
| `tests/gen-download.test.js` | 用 fixture 数据集行为测试；`defaultZipSize` 双路径测试 | 移除对 `download/download.html` 与硬编码指纹的依赖 |
| `scripts/check.mjs` | 源检查不再校验 `download.html`；`--release` 校验 release HTML + 根目录 `download.html`；`--published` 额外校验 `download/download.html`；staging inject 跳过下载页 | 解开依赖环，保留产物门禁 |
| `scripts/pack.mjs` | 发布 `download/download.html` 后执行 `check --release --published` | 完整发布集合的最终一致性验证 |
| `scripts/verify-update.mjs` | 隔离副本不含 `release/`；先冷启动 `build`；从输入推导指纹；验证 build/inject 双路径 | 独立集成验证，不依赖宿主预置产物 |

### 调用顺序（修复后）

**`npm run build`**

```
test → lint → check（仅源）
→ build:monitor / build:archive / docx
→ gen-download（生成根 download.html）
→ check:release（release HTML + 根 download.html）
→ pack（gen-download → check:release → 发布 → gen-download → 发布 download/ → check:release --published）
```

**`npm run inject`**

```
check（仅源）→ 暂存注入 → check:release（staging，跳过下载页）
→ 发布 release → pack（含 --published 终检）
```

**`npm run test:update`**

```
隔离副本（无 release/download）→ 冷启动 build
→ 改源数据 → check 通过 / check:release 拒绝旧产物
→ build 更新 → inject 路径 → 终检；临时目录销毁，宿主数据不变
```

---

## 3. 测试如何检测原始缺陷

| 缺陷 | 检测方式 |
|---|---|
| 冷构建依赖既有产物 | `renderDownloadHtml(FIXTURE)` 断言元数据与占位符；不再读取 `download/download.html` |
| 硬编码指纹 | 期望从 `dataStamp(FIXTURE)` 推导 |
| zip 双路径 | `defaultZipSize` 在临时目录实测根目录与 `download/` |
| 源/产物检查分离 | 改数据后 `npm run check` 退出 0；`check:release` 退出 1 |
| 更新链路 | `verify-update.mjs` 冷启动 build + 双次 pro 修改 + inject 失败/成功 + ZIP 成员 |

---

## 4. 验收结果

### A. 干净首次构建 ✅

**副本**：`/tmp/b0-work/clean-a`（从 evidence/source 复制修复后脚本，无 release/download）

| 命令 | 退出码 | 结果 |
|---|---:|---|
| `npm ci` | 0 | 179 依赖 |
| `npm test` | 0 | **55/55** |
| `npm run lint` | 0 | 无 error |
| `npm run check` | 0 | 源检查通过（无 download.html） |
| `npm run build` | 0 | 完整构建与 pack 成功 |

### B. 真实数据更新 ✅

| 步骤 | 退出码 | 关键结果 |
|---|---:|---|
| `npm run test:update` | 0 | 隔离副本冷启动 build；指纹随 pro 变化；HTML/ZIP/download 一致；基线 n=14 不变；宿主 `data/训练数据集.json` 与 evidence 逐字节相同 |
| inject 失败场景 | — | 缺 archive 时 monitor/docx 未被覆盖 |
| ZIP 陈旧成员 | — | inject 后 zip 仅 5 成员，无 `stale.txt` |

**说明**：本轮交付 ZIP 使用**原始训练数据**（指纹 `02808fbb`，73 天），非合成测试数据。

### C. 检查仍能发现错误 ✅

| 场景 | 命令 | 退出码 |
|---|---|---:|
| 根 `download.html` 指纹被篡改 | `node scripts/check.mjs --release` | **1** |
| `download/download.html` 指纹被篡改 | `node scripts/check.mjs --release --published` | **1** |

### D. 范围检查 ✅

- 测试：**55 项**全部通过（数量未预设，实际 55）
- 单文件 / 离线交付：Vite singlefile 构建未改
- 原始数据、基线、冻结历史：**未修改**
- 未实施 B1–B9
- 变更文件：**6 个**（5 脚本/测试 + 运行时生成的 download.html 不在源码包内）

---

## 5. 交付物

| 文件 | 说明 |
|---|---|
| `个人训练系统_源码_v7_B0.zip` | 修复后完整源码（无 node_modules / release / download / zip） |
| `个人训练系统_v7_B0_build.zip` | 原始数据下的完整交付包 |
| `B0.diff` | 相对 evidence/source 的 unified diff |
| `B0_执行报告.md` | 本文件 |

路径：`/opt/cursor/artifacts/b0-deliverables/`

---

## 6. 未验证项与遗留风险

| 项 | 说明 |
|---|---|
| GitHub Actions 远端 runner | 未在本轮触发 |
| Node 20 / 22 矩阵 | 本轮使用 Node 22.14.0 |
| Safari / 真机 | 未测 |
| BUILD-02 源码包死链 | 属 B9，不在 B0 |
| R12/R13 发布集合混代 / 坏 Word | 属 B7，不在 B0 |
| `check:release` 与 `--published` 文档 | 未改 README（B0 允许相关文档，本轮 diff 仅脚本/测试） |

---

## 7. B0 判定

**PASS** — 本轮 B0 全部验收完成并通过。

B0 PASS 仅表示构建与更新验证流程已修复，**不代表**整个 v7 已满足可靠性发布门槛（B1–B9 仍待实施）。
