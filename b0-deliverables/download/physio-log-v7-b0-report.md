# 个人训练系统 v7 · B0 修复报告

**批次**：B0（R11 · 构建与更新验证流程）  
**日期**：2026-10-07  
**依据**：《个人训练系统_v7_交叉裁决与修复路线_2026-10-07.md》  
**基线**：证据包 `source/`（与原始 v7 源码 ZIP 逐字节一致）  
**判定**：**PASS**

---

## 摘要

本轮仅修复工程门禁中的三个已确认问题：**冷构建依赖既有产物**、**源检查与下载页生成形成依赖环**、**更新集成验证失效**。未改动训练数据、固定基线、产品行为或 UI。

修复后，从没有 `release/`、`download/`、`download.html` 的干净源码副本出发，可完整执行：

```bash
npm ci && npm test && npm run lint && npm run check && npm run build
```

数据更新后，`npm run inject` 与 `npm run test:update` 也能在隔离环境中自证通过，且不会污染原始数据文件。

---

## 1. 修复前的问题

### 1.1 冷构建在测试阶段失败

| 项 | 内容 |
|---|---|
| **现象** | 干净 clone 执行 `npm test` 时 54/55 通过，1 项失败 |
| **报错** | `tests/gen-download.test.js`：`download/download.html` 不存在 |
| **根因** | 测试读取尚未生成的构建产物，并硬编码当前数据指纹 `02808fbb` 与 `73 天` |
| **影响** | `npm run build` 第一步即失败，CI 无法从干净源码自证 |

### 1.2 源检查与下载页形成死锁

| 项 | 内容 |
|---|---|
| **现象** | 修改 `data/训练数据集.json` 后，`npm run check` 失败 |
| **报错** | `✗ [下载页] download.html 与数据集不一致` |
| **根因** | `check.mjs` 在源检查阶段要求既有 `download.html` 已匹配新数据，但下载页要在后续 `gen-download` / `pack` 才生成 |
| **影响** | `build`、`inject`、`test:update` 均被阻断，每次更新需手工先跑 `gen-download` |

### 1.3 更新集成验证不可用

| 项 | 内容 |
|---|---|
| **现象** | `npm run test:update` 失败或依赖宿主已预置 `release/` |
| **根因** | 集成脚本假设宿主已有旧产物，且被上述下载页检查拦截 |
| **影响** | 无法在隔离副本中验证「改数据 → 重建 → 注入 → 打包」完整链路 |

---

## 2. 修复方案

### 2.1 设计原则

1. **源检查只依赖源输入**（数据集、历史、schema、基线复算等）
2. **产物检查放在生成之后**（release HTML、download.html）
3. **测试从输入推导期望**，不硬编码活跃数据指纹
4. **不删除有效断言**，不把行为测试降级为源码字符串匹配

### 2.2 检查命令分层

| 命令 | 职责 |
|---|---|
| `npm run check` | 仅校验源数据与叙述一致性，**不要求** `download.html` 存在 |
| `npm run check:release` | 校验 release HTML 与根目录 `download.html`（生成后） |
| `node scripts/check.mjs --release --published` | 额外校验 `download/download.html`（pack 发布完成后） |

inject 暂存阶段（`PHYSIO_RELEASE_DIR` 指向 staging）跳过下载页检查，由后续 `pack` 做终检。

### 2.3 修改文件清单

| 文件 | 变更说明 |
|---|---|
| `scripts/gen-download.mjs` | 导出 `buildDownloadMeta`、`renderDownloadHtml`、`defaultZipSize` 等函数，供测试直接调用 |
| `tests/gen-download.test.js` | 用 fixture 数据集测试生成器行为；用临时目录测试 zip 双路径查找 |
| `scripts/check.mjs` | 源/产物检查分离；新增 `--published`；staging inject 跳过下载页 |
| `scripts/pack.mjs` | 发布 `download/download.html` 后执行 `--release --published` 终检 |
| `scripts/verify-update.mjs` | 隔离副本冷启动 `build`；从输入推导指纹；覆盖 build + inject 双路径 |

**未修改**：训练数据、基线、Vite 配置、前端业务代码、版本号、对外交付文件名。

---

## 3. 修复后的调用顺序

### `npm run build`

```
test → lint → check（源）
  → build:monitor / build:archive / docx
  → gen-download
  → check:release
  → pack（gen-download → check:release → 发布 → 同步 download/ → check:release --published）
```

### `npm run inject`

```
check（源）→ 暂存注入 → check:release（staging，跳过下载页）
  → 发布 release → pack（含 --published 终检）
```

### `npm run test:update`

```
复制隔离副本（无 release/download）
  → 冷启动 build
  → 修改源数据 → check 通过 / check:release 拒绝旧产物
  → build 更新 → inject 路径验证
  → 销毁临时目录（宿主数据不变）
```

---

## 4. 验收结果

### 4.1 干净首次构建

环境：无 `release/`、`download/`、`download.html` 的隔离副本；Node 22.14.0；原 lockfile。

| 命令 | 退出码 | 结果 |
|---|:---:|---|
| `npm ci` | 0 | 179 个依赖 |
| `npm test` | 0 | **55 / 55** 通过 |
| `npm run lint` | 0 | 无 error |
| `npm run check` | 0 | 源检查通过 |
| `npm run build` | 0 | 完整构建与打包成功 |

### 4.2 真实数据更新

| 验证项 | 结果 |
|---|---|
| `npm run test:update` | 退出码 0 |
| 隔离副本冷启动 build | 通过 |
| 修改 `pro` 后指纹变化 | 从输入自动推导，无需手改测试 |
| release HTML / ZIP / download.html 数据一致 | 通过 |
| inject 失败时不部分写入 | monitor / docx 保持旧内容 |
| inject 成功后 ZIP 无陈旧成员 | 5 个文件，无 `stale.txt` |
| 固定基线 `_baseline` | 未变（n=14） |
| 宿主 `data/训练数据集.json` | 与 evidence 基线逐字节相同 |

### 4.3 产物检查仍能发现错误

| 注入故障 | 检查命令 | 退出码 |
|---|---|:---:|
| 篡改根目录 `download.html` 指纹 | `node scripts/check.mjs --release` | **1** |
| 篡改 `download/download.html` 指纹 | `node scripts/check.mjs --release --published` | **1** |

### 4.4 范围确认

- 单文件 HTML、离线交付能力：**保留**
- 原始训练记录、冻结历史、科学判定口径：**未改**
- B1–B9（数据完整性、UI、发布混代等）：**未实施**
- 实际测试数量：**55 项**（非预设值）

---

## 5. 测试如何覆盖原始缺陷

| 原始缺陷 | 对应检测 |
|---|---|
| 测试依赖既有 `download/download.html` | `renderDownloadHtml(FIXTURE)` 不读磁盘产物 |
| 硬编码 `02808fbb` / `73 天` | 期望由 `dataStamp(FIXTURE)` 与 `buildDownloadMeta` 推导 |
| 源检查阻断数据更新 | 改数据后 `check` 仍通过，`check:release` 拒绝旧产物 |
| 更新链路不可自证 | `verify-update.mjs` 在空产物目录完成冷启动 build + inject |

---

## 6. 交付物

路径：`/workspace/b0-deliverables/`

| 文件 | 说明 |
|---|---|
| `个人训练系统_源码_v7_B0.zip` | 修复后源码（含 lockfile；无 node_modules / release / download / zip） |
| `个人训练系统_v7_B0_build.zip` | 原始数据下的完整交付包（指纹 `02808fbb`，73 天） |
| `B0.diff` | 相对 evidence/source 的 unified diff |
| `B0_执行报告.md` | 含命令输出的详细执行记录 |
| `个人训练系统_v7_B0修复报告.md` | 本文件 |

---

## 7. 遗留项（不在 B0 范围）

| 编号 | 说明 | 计划批次 |
|---|---|---|
| BUILD-02 | 下载页「源码包」按钮为死链 | B9 |
| R12 | build/inject 中断导致交付集合混代 | B7 |
| R13 | 坏 Word / 旧 JS 通过发布门禁 | B7 |
| R01–R10 | 数据读写、表单抹值、备份恢复等 | B1–B6 |
| CI 远端 runner | 本轮未触发 GitHub Actions | — |

---

## 8. 结论

### B0 判定：**PASS**

构建与更新验证流程已修复并通过全部本轮验收。

### 重要说明

**B0 PASS 仅表示工程门禁（干净构建、数据更新、产物一致性检查）已可用**，不代表整个 v7 已具备面向真实用户的可靠性放行条件。交叉裁决报告中的数据完整性、编辑契约、备份恢复、发布混代等问题（B1–B9）仍待后续批次实施。

### 建议下一步

按交叉裁决路线：**B1（R01 + R04 + R17 · 读写与恢复边界）**。

---

*报告生成于 Cloud Agent 实施环境；原始训练数据未被修改。*
