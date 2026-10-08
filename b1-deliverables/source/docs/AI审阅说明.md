# 个人训练系统 v7 · 外部 AI 审阅说明

发给 DeepSeek、GLM、ChatGPT 等模型时，**请把本文件放在附件最前面**，并在对话开头粘贴下方「开场白」。

---

## 开场白（复制粘贴）

```
请审阅「个人训练系统 v7」的源码，不是 release 里打包后的 HTML。

必读：附件中的 docs/AI审阅说明.md。

要点：
1. 交付物是两个离线单文件 HTML，但逻辑在 src/ 与 scripts/ 维护；release/*.html 是 Vite 构建产物，minify 后会出现重复函数名，不能据此判断「未模块化」。
2. 当前版本 v7.0，数据 73 天（至 2026-10-06），指纹 02808fbb。
3. 已有 ESLint、Vitest（46 项单测）、check.mjs / check:release、GitHub Actions build.yml。
4. 这是个人离线工具，不要按 SaaS / 微服务 / PWA / 云同步标准评判。
5. 请区分：源码缺陷 vs 交付形态取舍 vs 数据模型历史债（flag 长文本、feel 双类型等）。

审阅后请按 P0/P1/P2 列出，并注明每条依据的具体文件路径。
```

---

## 1. 项目是什么

| 层级 | 路径 | 作用 |
| --- | --- | --- |
| **源码（审阅对象）** | `src/`、`scripts/`、`tests/` | 真实逻辑与测试 |
| **数据真源** | `data/训练数据集.json` | 32 字段 + `_daily` 补充层 |
| **构建产物（勿当源码审）** | `release/*.html`、`release/*.docx` | 内嵌 JSON + minify  bundle，供用户双击离线使用 |
| **成品 zip** | `个人训练系统_v7.zip` | 5 个散文件，给终端用户，不是给 AI 审架构的首选 |

**设计取舍**：监测与档案各生成一个单文件 HTML（含 base64 字体、内嵌数据集），换取「无需服务器、U 盘/手机可开」。源码已通过 `src/shared/` 共享模块，打包后看起来像两份重复代码是正常现象。

---

## 2. 当前版本快照（2026-10-07）

| 项目 | 值 |
| --- | --- |
| 版本号 | `v7.0`（见 `src/shared/release.js`） |
| 数据 | 73 天 · 2026-07-26 → 2026-10-06 |
| 指纹 | `02808fbb` |
| 参考期基线 | n=14 · lnRMSSD μ=4.4417 · σ=0.0935 |
| 单测 | 55 项（17 个 test 文件） |
| 构建 | `npm run build` = test + lint + check + HTML + docx + gen-download + check:release + pack |
| pack 收尾 | zip 生成后二次 `gen-download`，刷新下载页体积并同步 `download/download.html` |
| 只改数据 | `npm run inject` |
| 变更记录 | `CHANGELOG.md` · `docs/更新验收_2026-10-07.md` |

---

## 3. 请审什么 / 不要审什么

### ✅ 请审

- `src/shared/` — schema、指纹、校验、合并、导入导出
- `src/monitor/` — 监测视图、localStorage、基线锁定
- `src/archive/` — 档案派生、content 手写层、history 阅读器
- `scripts/check.mjs`、`scripts/inject-data.mjs`、`scripts/verify-update.mjs`、`scripts/pack.mjs`
- `tests/` — 单测覆盖与缺口
- `.github/workflows/build.yml` — CI 是否完整
- `docs/系统维护规则v7.md` — 操作规则是否与实际命令一致

### ❌ 不要作为主要依据

- `release/训练监测系统_v7.html`、`release/个人训练档案_v7.html` 内的 minify 代码（函数名如 `O`/`Xe`/`W` 是打包器产物）
- 用「HTML 里有两套 fnv1a」推断「未抽 shared 模块」
- `legacy/` — 仅 v5 对照，非现行代码
- `node_modules/`、`package-lock.json`
- 要求上 TypeScript / 微服务 / 用户系统 / 云备份（见维护规则「明确不应引入」）

### ⚠️ 已知取舍（不是漏做）

| 现象 | 说明 |
| --- | --- |
| `feel` 允许 number 与 string | 历史兼容：1–5 分或原话，见 `check.mjs` |
| `flag` 可达千字 | 叙述 + 事件 + 口径混写，结构化查询非当前目标 |
| `history.js` 内局部 `esc` | 与 `format.js` 有小重复，P2 卫生项 |
| SVG `UID` 递增 | 图表重绘 id 增长，长期会话 P2 |
| 四字重 HarmonyOS 字体内嵌 | 离线必需，体积换零依赖 |
| `commit=unknown` | 非 git 环境构建时 BUILD_META 无 commit，非功能缺陷 |

---

## 4. 我要发送哪些文件

### 模型不支持 zip 时

**不要发 zip。** 在文件管理器中打开源码目录，**多选下列文件/文件夹**上传；或连 Git 仓库（最佳）。

### 档位 A · 最小（约 15 个文件，适合「快速扫一眼」）

```
docs/AI审阅说明.md
README.md
CHANGELOG.md
package.json
src/shared/release.js
src/shared/schema.js
src/shared/stamp.js
src/shared/validate-dataset.js
src/shared/daily-merge.js
src/shared/records-io.js
scripts/check.mjs
scripts/inject-data.mjs
tests/stamp.test.js
tests/validate-dataset.test.js
tests/daily-merge.test.js
tests/derive.test.js
```

### 档位 B · 标准（推荐，覆盖架构审阅）

在档位 A 基础上**追加整文件夹**（拖拽文件夹即可）：

```
src/shared/          （整个文件夹）
src/monitor/         （整个文件夹）
src/archive/         （整个文件夹，content.js 较大可单独发）
scripts/             （整个文件夹，含 check / pack / verify-update / gen-docx）
tests/               （整个文件夹）
.github/workflows/build.yml
eslint.config.js
vite.config.js
vitest.config.js
data/训练数据集.json   （审数据模型时必带）
docs/系统维护规则v7.md （审流程/文档一致性时带）
```

### 档位 C · 完整源码（模型附件上限够用时）

发送 **`个人训练系统_源码_v7.zip` 解压后的全部内容**，但：

- **排除** `node_modules/`
- **排除** `release/`（或仅作对照，标明「构建产物」）
- **排除** `legacy/`、`download/`、根目录 `*.zip`

### 档位 D · 只审数据 / 只审成品行为（非代码审）

| 目的 | 发送 |
| --- | --- |
| 核对数值、录入纪律 | `data/训练数据集.json` + `docs/系统维护规则v7.md` |
| 看档案叙述 | `release/个人训练档案_v7.html` 或 `.docx` + JSON |
| 看监测交互 | `release/训练监测系统_v7.html` + JSON |
| 用户使用 | `个人训练系统_v7.zip` 解压后的 5 个散文件 |

---

## 5. 请审阅者执行的自检命令

若环境有 Node.js 20+：

```bash
npm ci
npm test          # 期望 46 passed
npm run lint
npm run check     # 源数据自检
npm run build     # 完整构建（可选，耗时较长）
```

无 Node 时：至少阅读 `tests/` 与 `scripts/check.mjs`，不要仅扫 HTML。

---

## 6. 希望审阅者输出的格式

请按以下模板回复：

```markdown
## 总体结论
（1 段，基于 src/ 而非 release HTML）

## P0 · 必须修
- [文件路径:行号] 问题 … | 依据 …

## P1 · 建议修
…

## P2 · 可选
…

## 已存在但可能被误判为缺失的项
（如：shared 模块、单测、baseline 校验、ESLint、CI 配置）

## 明确不应做的建议
（如：微服务、强制 TS、拆成多页在线应用）
```

---

## 7. 常见误判对照表

| 外部报告说法 | 实际情况 |
| --- | --- |
| 无 ESLint | 有 `eslint.config.js`，`npm run lint` |
| 无单测 | `tests/` 46 项 Vitest |
| 无 schema 校验 | `validate-dataset.js` + `check.mjs` 四层校验 |
| 未模块化 | `src/shared` + monitor/archive 分目录；单文件 HTML 是交付形态 |
| 档案不校验 _baseline | 最新 `validate-dataset.js` 已校验，见 `tests/validate-dataset.test.js` |
| 无 CI | `.github/workflows/build.yml` 存在，远程是否跑通见 CHANGELOG |
| 无依赖管理 | `package.json` + lock 文件 |

---

## 8. 联系上下文

- 维护规则：`docs/系统维护规则v7.md`
- 最近验收：`docs/更新验收_2026-10-07.md`
- 工程修复记录：`docs/修复验收_2026-10-05.md`

*本说明随 v7 源码更新；改构建链或测试数量时请同步修订 §2 与 §4。*
