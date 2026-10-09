# 更新日志

本文件记录「个人训练系统 v7」交付物与源码的主要变更。版本号见 `src/shared/release.js` 中的 `VERSION`。

## 2026-10-07 · DeepSeek 清单收尾（版本仍 v7.0）

- **P0-1**：`package-lock.json` 与 `package.json` 对齐为 7.0.0
- **P1-1**：`RELEASE.zipBundle` / `sourceZip` 纳入 `release.js`；`pack.mjs` 不再硬编码 v7 文件名
- **P1-2**：`download.template.html` + `npm run gen-download`；`check.mjs` 校验下载页与数据集一致；`pack` 同步 `download/`
- **P1-3**：`svg-charts.mjs` 的 `md` 重命名为 `msToDay`
- **P1-4**：`scripts/ranges.mjs` + `tests/check-range.test.js`
- **P2**：`history.js` 统一 `format.js` 的 `esc`；eslint 忽略 `download/`、`docs/`；补 sessions 同 start 合并单测
- **完美主义收尾**：`charts.js` 按容器 WeakMap 命名 SVG id；`pack` 在 zip 生成后二次 `gen-download` 刷新下载页体积；新增 chart-uid / gen-download 单测（55 项）；`npm ci && npm run build` 本地 CI 模拟通过

## 2026-10-07 · 录入10月5日、6日（版本仍v7.0）

- 正式数据更新至10月6日，共73天，指纹 `02808fbb`；历史记录与固定基线保留。
- 录入两日晨间、体成分、饮食，以及10月5日完全休息、10月6日两段跑；逐课与全天汇总分别保存。
- 同步网页档案与Word；营养范围和未估算状态分别展示，不将空值显示成数值。
- 46项单元测试、lint、构建、一致性校验和离线网页实测通过；Word渲染为35页并逐页核验。详见 `docs/更新验收_2026-10-07.md`。

## 2026-10-05 · Codex 修复验收（实际版本仍 v7.0）

数据保持 71 天 / 2026-10-04 / `dfb22656`。下方 v7.0.1 / v7.0.2 为上传候选原日志标题，不代表本次升级版本；其中“商业质量闭环”“原子打包”“CI 已运行”等旧声明不能替代本次验收。

- 分离源检查与产物检查，修复数据更新被旧 release 阻断；增加独立更新集成测试。
- 严格执行 8 MB 上限；补充层与基线全量校验后提交；主动导入显式覆盖，缓存升级规则保留。
- 恢复 10-04 的个人资料、饮食、最新三夜与测量记录；共用全天训练摘要 9.92 km / 55:41。
- 内嵌数据错误先显示提示；null 根节点、null 行及非法 JSON 在两个页面实测无运行异常。
- 修复 Word 封面、短表和卡片分页；全部 35 页渲染核验。
- 打包生成新 ZIP；暂存验证后逐文件发布，捕获失败回滚；保留回滚失败备份，不宣称断电事务。
- 补齐真实 `.github/workflows/build.yml`；本地构建通过，未声称远程 CI 已运行。
- 验收：43 项单元测试、lint、build、test:update、Chromium 常规及异常路径；详见 docs/修复验收_2026-10-05.md。


---

## v7.0.2 · 2026-10-05

**数据：71 天（2026-07-26 → 2026-10-04）· 指纹 `dfb22656`**

### 商业质量闭环

- **摘要同步**：`ABSTRACT.latest` 更新至 10 月 4 日；`npm run check` 校验摘要日期与数据末行一致
- **inject 修复**：`npm run inject` 同步更新 `__EXPECTED_STAMP__` 与 BUILD_META，不再误报指纹不符
- **原子打包**：新增 `npm run pack`；`npm run build` / `inject` 末尾自动同步 `release/` → `download/` → 根目录 zip
- **导入加固**：JSON 导入校验结构、8MB 上限、无效日期统计；`_daily` 深合并（`mergeDailyStore`）
- **运行时容错**：内嵌 dataset JSON 解析失败时页顶提示，避免白屏
- **XSS**：今日视图 session 详情字段统一转义
- **测试**：新增 `records-io`、`validate-dataset` 单测（合计 30 项）
- **CI**：GitHub Actions 在 push/PR 时跑完整 `npm run build`
- **常量集中**：localStorage 键名 `records` / `baseline` / `dataVersion` 纳入 `STORAGE_KEYS`

### 10 月 4 日数据

- 合并上传包 71 天数据集（含 10-04 两段跑、体重 60.65 kg 等）
- `CHAIN.rows` 补 10-04；`META.through` 更新；训练年轮天数随 `derive` 动态显示

---

## v7.0.1 · 2026-10-05

**数据：70 天（→ 2026-10-03）· 指纹 `55797dff`**

### P0 · 交付与一致性（DeepSeek 审查清单）

- **P0-1**：`check.mjs` 深度比对 `data/训练数据集.json` 与两份 release HTML 的 `data` / `_daily`
- **P0-2**：构建注入 `window.__RELEASE__`、`window.__EXPECTED_STAMP__`；HTML 头部 BUILD_META 注释
- **P0-3**：README / 维护规则补充「须从源码 `npm run build`」与源码交付说明

### P1 · 运行时与引文

- **P1-1**：18 条 VOICES 全部 `snapshot: true`；未匹配引文在第 05 章页内可见提示区
- **P1-2**：`validateDataset()` 启动自检 → `#dsBanner` + 控制台表格
- **P1-3**：BUILD_META 注释（commit / stamp / 日期）替代 sourcemap

### P2 · 体验与无障碍

- 图表 `ResizeObserver` + `requestAnimationFrame` 二次测量
- `#hist` 对话框焦点陷阱扩展（textarea / tabindex / 焦点逃出）
- `#toast`、banner、`#histN` 增加 `aria-live`
- 移动端长表格 / 引文区关闭 `backdrop-filter` 以减轻掉帧
- `release.js` 集中 `NS` / `SUBJECT` / `STORAGE_KEYS`

---

## v7.0.0 · 2026-10-04

**初版 v7 交付**

### 界面

- 训练监测系统：鸿蒙粒子光感风格（aurora、粒子场、磨砂玻璃）
- 个人训练档案：00–09 章 + 附录 A–D，编辑式排版与交互图表

### 工程

- 源码结构：`src/shared`、`src/monitor`、`src/archive`、`scripts/`、`tests/`
- 单文件离线 HTML + Word 同构构建链（Vite + vitest + ESLint）
- 共享层：schema、UTC 日期、`_daily` 合并、数据指纹（FNV-1a）
- 档案与 Word 共用 `content.js` / `derive.js`
- 附录 D 内嵌《训练历史存档.md》全文检索

### 交付物（5 文件）

| 文件 | 说明 |
| --- | --- |
| `训练监测系统_v7.html` | 监测单文件 |
| `个人训练档案_v7.html` | 档案单文件 |
| `个人训练档案_v7.docx` | Word 版 |
| `训练数据集.json` | 唯一数值来源 |
| `系统维护规则v7.md` | 维护规则 |

---

## 升级说明

- **从 v6 改名文件**：须重新构建，勿只改文件名；互跳链接由 `release.js` 注入
- **指纹变更**：更新数据后指纹会变；本机 localStorage 缓存按 stamp 判断是否合并
- **只改数据**：`npm run inject`（含 check + stamp + pack）
- **改代码或档案文字**：`npm run build`
