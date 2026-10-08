# 当前数据状态

截至2026-10-06，共73天，指纹`02808fbb`，版本仍为v7.0。10月5日和6日已按用户授权录入；主跑距离差异与营养缺值说明见数据集及维护规则。

# 训练监测系统 v7 · 个人训练档案 v7

**本项目依赖 `npm run build` 从源码生成交付物。** `release/` 下的 HTML 是构建产物；日常改数据或逻辑后请跑完整构建，不要手改 release 内嵌 JSON。

一份《训练数据集.json》，三份同步的交付物：

| 文件 | 说明 |
| --- | --- |
| `release/训练监测系统_v7.html` | 鸿蒙粒子光感风格的监测系统。单文件、离线可用，包含今日、趋势、来源、数据、口径五个视图，支持导入导出 |
| `release/个人训练档案_v7.html` | 档案交互版。编辑式排版，共 00–09 章加附录 A–D；日历、周量、HRV 曲线等图表由内嵌数据集实时生成；附录 D 内嵌《训练历史存档.md》全文，可按目录浏览和全文检索 |
| `release/个人训练档案_v7.docx` | 档案 Word 版，可打印、可批注。正文、数字、表图编号与网页版一致 |

三份文件读取同一份 `data/训练数据集.json`。尾页的「数据指纹」（FNV-1a，公式沿用 v5）用于识别 `data` / `_daily` 的版本；基线、字段和元数据另由 `check:release` 逐项比较。指纹不能替代人工叙述校验。

**版本与交付文件名**统一在 `src/shared/release.js` 维护；改版本只改该文件后重新构建。

## 数据完整性约定

- `data` 保留原 32 字段，`_daily` 为可选补充，不改历史日期和原始值。
- Elite 参考期锁定为 2026-08-08 至 08-23，排除 08-16、08-17，n=14。网页档案在打开时、Word 版在生成时，都会按原始 `el` 值复算 μ/σ，并与锁定值比对。
- 「身体说的话」引文以 `snapshot: true` 快照保存原文；非快照条目仍做子串校验，未匹配项会在第 05 章可见提示区列出。
- 表、图按出现顺序自动编号，网页版和 Word 版使用同一规则（当前共 16 张表、7 幅图）。

- 《训练历史存档.md》是冻结材料，构建时原文嵌入档案网页版附录 D；Word 版只放说明页，不重复排印全文。

## 本地运行

需要 Node.js 22.12 或更高版本，系统安装 zip / unzip；Linux 生成 Word 图表时需有中文字体。

```bash
npm install
npm run dev          # http://localhost:47321/ 是监测系统，/archive.html 是档案
npm test             # 单元测试（schema、派生、合并、指纹等）
npm run lint         # ESLint 静态检查
```

## 构建交付物

```bash
npm run build        # test + lint + check + HTML + Word + pack → release/、download/、*.zip
npm run check        # 只校验源数据与人工叙述，不要求旧产物已同步
npm run check:release # 构建后严格比较两份 HTML 与源数据的完整 payload
npm run test:update  # 在临时副本中实测修改数据后的 build / inject、失败保护及 ZIP
npm run pack         # 校验 release → 完整暂存 ZIP → 逐文件发布
npm run build:monitor
npm run build:archive
npm run docx         # 只重新生成 Word 版
```

## 只更新数据

更新 `data/训练数据集.json`（或历史存档）后，不必重新构建：

```bash
npm run check        # 更新前自检：结构、格式、范围、基线复算、引文、档案手写内容是否跟上
npm run inject       # 先自检，再把新数据和历史存档写入 release/ 两个 HTML 的内嵌块，并重新生成 Word 版
```

`npm run build` 和 `npm run inject` 都会先跑源自检，生成后再严格校验产物，出现 ✗ 时中止。注入时两份 HTML 与 Word 先在暂存目录生成，校验通过才替换。打包生成新 ZIP，不更新旧 ZIP，以免遗留陈旧成员。发布使用同目录 rename，捕获失败时回滚；不宣称跨多个文件的断电事务。档案里哪些文字需要随数据手动更新、监测系统本机缓存的注意事项，见 `docs/系统维护规则v7.md`（交付副本；仓库内 `docs/系统维护规则v3_0.md` 内容同步）。

## 目录

```
data/训练数据集.json         唯一数值来源
data/训练历史存档.md         冻结的旧版叙述，构建时嵌入档案附录 D
data/legacy-daily-seed.json  旧版 _daily 缓存识别快照（勿随数据更新）
docs/系统维护规则v7.md       维护规则（交付副本）
src/shared/release.js        交付文件名与 VERSION 常量（改版本只改此处）
src/shared/                  共享层：schema、UTC 日期、训练分类、格式化、合并、指纹
src/monitor/                 监测系统（core.js 算法 + views/ 视图模块）
src/archive/content.js       档案正文，网页版与 Word 版共用
src/archive/derive.js        由数据集派生全部数值（纯函数）
src/archive/section-data.js  章节共享派生（workoutStats、phaseBar、chartExtents）
src/archive/html.js          档案网页 HTML 拼装与表图编号
src/archive/history.js       附录 D 历史存档解析与阅读器
scripts/docx/                Word 版主题、原语、编号（gen-docx.mjs 调用）
scripts/gen-docx.mjs         Word 版章节装配入口
scripts/check.mjs            更新前自检（从 shared/schema 读取 FIELDS）
scripts/inject-data.mjs      只替换数据与历史存档、不重新构建
tests/                       Vitest 单元测试
legacy/                      v5 原始文件，留作对照
```

## 说明

- 监测系统的 localStorage 键名和数据指纹算法与 v5 相同，旧缓存可以直接沿用。
- 页面右上角可以切换深色和浅色主题；粒子动效可在菜单中关闭，系统开启「减少动态效果」时会自动停用。
- 档案网页版可直接打印或另存为 PDF，打印时会自动展开所有折叠内容并切换为浅色版式。
- Word 版的中文字体指定为微软雅黑；在没有该字体的系统上，Word 会自动替换为系统中文字体。

## 2026-10-05 修复验收

正式数据仍为 71 天、截止 2026-10-04、指纹 `dfb22656`，固定 Elite 基线与冻结历史未改。

- 43 项单元测试、lint、完整 build 和 `test:update` 通过。
- Chromium 实测：多课、周量、体重图、导入导出及刷新、明暗主题、移动布局、历史检索和网页互跳；超限和非法导入无部分写入；异常内嵌数据有明确提示。
- 主动 JSON 导入：提供的字段覆盖本机值，未提供的字段保留，数组整体替换（空数组可清空）。新文件启动时的三方缓存升级继续沿用原语义。
- 恢复 10 月 4 日共享叙述与最新三夜；摘要保留全天 9.92 km / 55:41，主跑另列。
- DOCX 已渲染并检查全部 35 页；封面、短表及卡片分页已修复。
- `.github/workflows/build.yml` 已补齐，CI 调用完整构建；未在远程 GitHub 上实际运行。
- 用户手机与本机 Word / WPS 未实测。具体记录见 `docs/修复验收_2026-10-05.md`。
