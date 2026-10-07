# 个人训练系统 v7 · 第一阶段审计报告

> **审计角色**：Principal Engineer / Chief Architect / Final Code Reviewer  
> **审计范围**：`/tmp/audit/src` 源码（只读，未修改任何项目文件）  
> **审计日期**：2026-10-07  
> **产品版本**：v7.0（`release.js`）/ package.json `7.0.0`  
> **结论先行**：系统骨架正确（单文件离线、手写 SVG、先校验后提交、可回滚发布），但距离商业级质量的主要差距在于：**用户编辑路径会静默破坏数据**、**工程链路不能从干净源码自证**、**事实分散且互相矛盾**。

---

## 目录

1. [发现清单](#一发现清单)
2. [明确 KEEP](#二明确-keep不应再动)
3. [Architectural Trade-offs](#三architectural-trade-offs标记不改)
4. [Commercial Quality Roadmap](#四commercial-quality-roadmap)
5. [三个最终结论](#五三个最终结论)

---

## 一、发现清单

每条发现格式：**ID · Severity · Location · Current Behavior · Problem · Evidence · Impact · Recommendation · Minimal Solution · Alternative · Complexity Cost · Regression Risk · Required Tests · Verdict**

---

### P0：数据安全与严重正确性

#### DATA-01 · P0 · 表单「载入并修正」会把 type / feel 静默写成 null

| 字段 | 内容 |
|---|---|
| **Location** | `src/monitor/views/source.js` 第 15 行、第 86 行 |
| **Current Behavior** | 载入已有记录时直接执行 `ctl.value = r[key]`。若值不在 `<select>` 选项内，浏览器将 select 置空，保存时写入 null。 |
| **Problem** | 现有数据集有 17 种 type 写法（如「有氧（两段，主跑口径）」「肩胸」「手臂＋深蹲」），**无一**在 `TYPE_OPTS` 中；另有 5 天 feel 为原话字符串而非 1–5 数字。 |
| **Evidence** | `TYPE_OPTS = ["有氧","阈值","间歇","背日","胸肩","腿日","球类","休息","其他"]`；`ctl.value = r && r[key] != null ? r[key] : ""`。实测：对 10-06、10-03 执行「载入→不改→保存」后 type 变为 null。 |
| **Impact** | 用户只想修正一个字段，却会丢失其他字段，且无提示。 |
| **Recommendation** | 载入时若值不在选项中，临时追加 `<option>` 保留原值；不要强行收敛为枚举。 |
| **Minimal Solution** | `loadIntoForm` 中对 select 判断「值不存在则追加 option 再赋值」，约 5 行。 |
| **Alternative** | type/feel 改为 `<input list>`（datalist）。 |
| **Complexity Cost** | 极低 |
| **Regression Risk** | Low |
| **Required Tests** | 对每行数据做「载入→保存」往返，断言记录不变（需 jsdom 或浏览器测试）。 |
| **Verdict** | **FIX** |

---

#### BUILD-01 · P0 · `check` 的下载页校验让数据更新链路陷入死锁

| 字段 | 内容 |
|---|---|
| **Location** | `scripts/check.mjs` 第 155–160 行 |
| **Current Behavior** | 只要 `download.html` 存在且与新数据不一致，即报错（err）。 |
| **Problem** | `download.html` 由 `pack` 末尾 `gen-download` 生成，而 `inject`/`build`/`test:update` 均先跑 `check`。数据一改就过不了 check，永远走不到重新生成下载页。 |
| **Evidence** | `if (!dl.includes(metaLine)) err("下载页", ...)`。实测：改数据后 check 报「download.html 与数据集不一致」，`test:update` 失败；手动先跑 `node scripts/gen-download.mjs` 后整条链路才通过。 |
| **Impact** | 核心「喂数据→出新文件」流程每次需人工绕过。 |
| **Recommendation** | 下载页一致性仅在 `check --release`（打包后）校验；日常 check 不校验。 |
| **Minimal Solution** | 放入 `if (RELEASE_MODE)` 分支，或降级为 warn。 |
| **Alternative** | 让 `inject`/`build` 在 check 前先执行 gen-download。 |
| **Complexity Cost** | 极低 |
| **Regression Risk** | Low |
| **Required Tests** | `verify-update` 加入「改数据→build 全绿」用例。 |
| **Verdict** | **FIX** |

---

#### TEST-01 · P0 · 干净克隆 `npm test` 必定失败，CI 与 `npm run build` 均不可自证

| 字段 | 内容 |
|---|---|
| **Location** | `tests/gen-download.test.js` 第 20–24 行；`.github/workflows/` |
| **Current Behavior** | 测试读取构建产物 `download/download.html`，硬编码断言当前指纹与天数。 |
| **Evidence** | `expect(html).toMatch(/02808fbb/)`、`/73 天/`。实测：干净 checkout 上 55 项中 1 项失败；`build` 首步即 `test`，整条构建链中断。 |
| **Impact** | CI 永远红；README「`npm ci && npm run build` 通过」与事实不符；每次更新数据须手工改测试。 |
| **Recommendation** | 单元测试不应依赖构建产物或当前数据。 |
| **Minimal Solution** | 测试中用临时目录 + 小型 fixture 调用 gen-download 渲染函数，断言占位符被替换、无残留 `{{`。 |
| **Alternative** | 移入 `check --release` 作为发布后校验。 |
| **Complexity Cost** | 低 |
| **Regression Risk** | Low |
| **Required Tests** | 修复后在全新 clone 跑 `npm ci && npm run build`。 |
| **Verdict** | **FIX** |

---

### P1

#### JS-01 · P1 · 粘贴导入后未转义字段插入 innerHTML（XSS）

| 字段 | 内容 |
|---|---|
| **Location** | `src/monitor/views/today.js` 第 109、118 行 |
| **Current Behavior** | `"入睡 " + r.bed`、`meta.sleep.wake_time`、`wm.time` 直接拼入 HTML。 |
| **Problem** | 数据来源为用户粘贴的 AI 输出，攻击面较窄，定为 P1。注入成功后可读写 localStorage 并伪造判定。 |
| **Evidence** | 实测：`bed` 含 `<img onerror>` 时脚本执行，`window.__xss='bed'`。 |
| **Impact** | 本地数据与判定可被篡改。 |
| **Recommendation** | 插入 HTML 的文本字段统一 `esc()`。 |
| **Minimal Solution** | 3 处加 `esc()`，并 grep 所有 `${r.`/`${meta.` 插值点。 |
| **Alternative** | 入口校验 bed/wake_time/time 为 `HH:MM`（可与 DATA-03 并做）。 |
| **Complexity Cost** | 极低 |
| **Regression Risk** | Low |
| **Required Tests** | 含 `<`、`"` 的 fixture 渲染 today，断言 DOM 无新元素。 |
| **Verdict** | **FIX** |

---

#### DATA-03 · P1 · 粘贴导入绕过 `validateImportPayload`

| 字段 | 内容 |
|---|---|
| **Location** | `source.js` 第 75 行；`records-io.js` `upsertIntoList` |
| **Current Behavior** | 文件导入走 `importJSON` 先校验；粘贴直接 `upsertRecords`，仅 `normalizeRec`。 |
| **Problem** | 同一数据两入口、两标准；非法日期/数值/超长字符串可经粘贴写入 localStorage。 |
| **Impact** | 缓存污染，下次 `loadRecords` 直接信任缓存。 |
| **Recommendation** | 粘贴路径复用 `validateImportPayload`。 |
| **Minimal Solution** | 第 75 行前调用校验，失败 toast 并 return。 |
| **Alternative** | 无 |
| **Complexity Cost** | 极低 |
| **Regression Risk** | Low |
| **Required Tests** | 粘贴非法 payload 断言 localStorage 未变。 |
| **Verdict** | **FIX** |

---

#### DATA-02 · P1 · 同日期 seed 胜出静默覆盖本地修正，文案却写「不会丢」

| 字段 | 内容 |
|---|---|
| **Location** | `src/shared/records-io.js` 第 13–18 行；`source.js` 第 35 行 |
| **Current Behavior** | `mergeRecordLists`：cached 先入 map，seed 再 `set` 覆盖同日期。 |
| **Problem** | 「本机新增不丢」对新增日期成立；对**已有日期**的修正在新文件发布后被覆盖。语义可接受，但未告知用户。 |
| **Evidence** | 文案：「本机新增的数据…按日期合并，不会丢。」 |
| **Impact** | 用户以为修正已持久，下次更新即丢失。 |
| **Recommendation** | 保留 seed 权威（见 Trade-off 2）；改文案；覆盖时 toast 告知条数。 |
| **Minimal Solution** | 改文案；`mergeRecordLists` 返回被覆盖日期列表。 |
| **Alternative** | 本地优先（不推荐，与 AI 数据集冲突）。 |
| **Complexity Cost** | 低 |
| **Regression Risk** | Low |
| **Required Tests** | records-io 测试「同日期冲突返回 overridden」。 |
| **Verdict** | **FIX** |

---

#### ERR-01 · P1 · 营养仅 `reported` 无 range 时页面崩溃（潜在）

| 字段 | 内容 |
|---|---|
| **Location** | `src/archive/main.js` 第 319 行；`src/monitor/views/today.js` 第 97 行 |
| **Current Behavior** | `nut.kcal_range.join`、`ns.protein_range.join` 无空值保护。 |
| **Problem** | 10-05 营养为 `{reported:true, estimated:false}` 无 range；`FUEL.meals.date` 指向该日时 `fuel()` 抛错，档案页中断。today 只检 `kcal_range` 未检 `protein_range`。 |
| **Impact** | 当前未触发，一次正常数据更新即可触发。 |
| **Minimal Solution** | 可选链，缺失输出「—」。 |
| **Alternative** | `validateDailyPayload` 要求 range 成对（可并做）。 |
| **Complexity Cost** | 极低 |
| **Regression Risk** | Low |
| **Required Tests** | 仅 `reported` 的 nutrition fixture 渲染 fuel/today 不抛错。 |
| **Verdict** | **FIX** |

---

#### JS-02 · P1 · 粒子文字 rAF 随 resize 叠加；光球/粒子文字不响应动效开关

| 字段 | 内容 |
|---|---|
| **Location** | `src/shared/fx.js` 第 266–274 行（mountParticleText）；mountOrb |
| **Current Behavior** | RO 回调内 `build(); draw()`，draw 末尾再调度 rAF，每次 resize 多一条循环。仅 mountParticleField 监听 `fx-toggle`。 |
| **Evidence** | 实测：初始每帧 2 次 draw，6 次 resize 后每帧 7 次；关再开 fx 后光球 rAF 24→0→12/s 冻结。 |
| **Impact** | 拖动/旋转后 CPU/电量倍增；动效开关行为不一致。 |
| **Minimal Solution** | RO 内 `cancelAnimationFrame(raf)` 再 draw；orb/text 各加 `fx-toggle` 监听。 |
| **Alternative** | 三组件共用约 15 行 start/stop 小函数（可选）。 |
| **Complexity Cost** | 低 |
| **Regression Risk** | Low |
| **Required Tests** | resize N 次后断言每帧回调次数不变。 |
| **Verdict** | **FIX** |

---

#### ARCH-01 · P1 · archive → monitor/charts → core 副作用依赖链

| 字段 | 内容 |
|---|---|
| **Location** | `src/archive/main.js` 第 7 行；`src/monitor/charts.js` 第 3 行；`core.js` 第 18、24 行 |
| **Current Behavior** | charts 从 core 导入 4 个纯函数；core 顶层 `readDataset()`、`structuredClone(DAILY_SEED)`。 |
| **Problem** | 档案页打包进 monitor 初始化，数据集解析校验两遍。 |
| **Evidence** | 产物含 `var j=se();…structuredClone(ye)`。 |
| **Impact** | 多余启动开销；monitor 加载失败连累 archive；charts 无法单测。 |
| **Minimal Solution** | charts 改从 `../shared/format.js`/`time.js` 导入，移入 `src/shared/charts.js`。 |
| **Alternative** | 只改 import 不移动文件。 |
| **Complexity Cost** | 极低 |
| **Regression Risk** | Low |
| **Required Tests** | archive 产物仅一次 `readDataset`；charts 可单独 import。 |
| **Verdict** | **FIX** |

---

#### SSOT-01 · P1 · 版本号与运行时版本各说各话

| 字段 | 内容 |
|---|---|
| **Location** | `release.js` `VERSION="v7.0"`；`package.json` `7.0.0`；`index.html`/`archive.html` 硬编码「v7」；维护规则「v7.0.2」；`ci.yml` Node 20 / `build.yml` Node 22；README ≥22.12；无 `engines` |
| **Problem** | vite 8.3.2 需 Node ≥20.19 或 ≥22.12；ci.yml 的 Node 20 不保证满足。 |
| **Impact** | 发版漏改；CI 与本地环境不一致。 |
| **Minimal Solution** | `release.js` 为唯一来源，HTML 构建注入；`engines` + `.nvmrc`；workflow 用 `node-version-file`。 |
| **Alternative** | check 交叉比对（治标不治本）。 |
| **Complexity Cost** | 低 |
| **Regression Risk** | Low |
| **Required Tests** | check 断言产物 HTML 版本等于 `VERSION`。 |
| **Verdict** | **FIX** |

---

#### BUILD-02 · P1 · 下载页「下载源码包」为死链

| 字段 | 内容 |
|---|---|
| **Location** | `download.template.html` 第 74 行；`gen-download.mjs` 第 43–46 行 |
| **Current Behavior** | `href="/{{sourceZip}}"`，无脚本生成 `RELEASE.sourceZip`。 |
| **Problem** | 假功能；`/` 绝对路径在 file:// 或子路径部署失效。 |
| **Minimal Solution** | `pack` 用 `git archive` 生成源码 zip + 相对路径；或删除按钮。 |
| **Alternative** | 同上 |
| **Complexity Cost** | 低 |
| **Regression Risk** | Low |
| **Required Tests** | `check --release` 断言链接文件存在。 |
| **Verdict** | **FIX** |

---

#### BUILD-03 · P1 · 两份 workflow 重叠且配置不一致

| 字段 | 内容 |
|---|---|
| **Location** | `.github/workflows/build.yml` 与 `ci.yml` |
| **Current Behavior** | Node 22 vs 20；仅 build.yml 装中文字体；触发分支不同。 |
| **Minimal Solution** | 合并：push/PR 跑 test+lint+build；tag 上传 release。 |
| **Alternative** | 保留两份共用 setup（不值得）。 |
| **Complexity Cost** | 极低 |
| **Regression Risk** | Low |
| **Required Tests** | GitHub 真实跑通一次。 |
| **Verdict** | **SIMPLIFY** |

---

#### SSOT-03 · P1 · 档案页/Word「动态数值 + 固定注解」

| 字段 | 内容 |
|---|---|
| **Location** | `archive/main.js` 第 118、169、170、383、487 行；`gen-docx.mjs` 第 175、227–228、387、495 行 |
| **Current Behavior** | 最长睡眠/跑量日期动态，注解「未听到闹钟」「两段合计」写死；「1:28:05」「北大346」网页与 docx 各一份。 |
| **Problem** | 数据更新后注解与事实不符，却显示得像事实。 |
| **Minimal Solution** | 注解按日期键入 `content.js`（如 `NOTES["2026-xx-xx"]`），取不到不显示；网页与 docx 共用。 |
| **Alternative** | 删除注解。 |
| **Complexity Cost** | 低 |
| **Regression Risk** | Low |
| **Required Tests** | derive 测试：最长日期变化后注解为空或匹配。 |
| **Verdict** | **FIX** |

---

#### DOC-01 · P1 · 文档与事实不一致

| 字段 | 内容 |
|---|---|
| **Location** | README 43 项；CHANGELOG/AI审阅说明 46/55 项；README 引用不存在的 `legacy/`、`docs/修复验收_*.md`；CHANGELOG「npm ci && npm run build 通过」 |
| **Impact** | 维护者与 AI 审阅者被误导。 |
| **Minimal Solution** | 删易变计数与「已通过」；删失效引用。 |
| **Alternative** | 脚本自动生成（不值得）。 |
| **Complexity Cost** | 极低 |
| **Regression Risk** | Low |
| **Required Tests** | check 断言 README 引用路径存在（可选）。 |
| **Verdict** | **FIX** |

---

#### TEST-04 · P1 · 关键路径无测试

| 字段 | 内容 |
|---|---|
| **Location** | `tests/` |
| **缺失** | 表单载入→保存往返；导出→导入往返；XSS 渲染；`loadRecords`/`loadDaily` 缓存迁移（stamp/staleVer/merge 三分支） |
| **Problem** | core 顶层副作用无法 import（ARCH-02）是根因之一。 |
| **Minimal Solution** | Vitest jsdom；`loadRecords` 3 分支；1 导出→导入；1 表单往返。 |
| **Alternative** | Playwright 两页打开+渲染冒烟。 |
| **Complexity Cost** | 中 |
| **Regression Risk** | Low |
| **Required Tests** | 本项即补测试。 |
| **Verdict** | **FIX** |

---

### P2

#### ARCH-02 · P2 · core.js 顶层副作用 + barrel 重导出

| 字段 | 内容 |
|---|---|
| **Location** | `src/monitor/core.js`（291 行） |
| **Current Behavior** | 加载即 `readDataset()`、克隆种子、算 stamp；转导出 shared 函数。 |
| **Problem** | 无法测试；依赖方向模糊；ARCH-01 根因。 |
| **Minimal Solution** | 初始化收进 `initState()` 由 `main.js` 调一次；删转导出，视图直引 shared。不建 service/repository。 |
| **Alternative** | 只删转导出。 |
| **Complexity Cost** | 中（约 8 文件改 import） |
| **Regression Risk** | Medium |
| **Required Tests** | TEST-04 loadRecords 用例。 |
| **Verdict** | **SIMPLIFY** |

---

#### ARCH-03 · P2 · fx.js 混入数据加载

| 字段 | 内容 |
|---|---|
| **Location** | `src/shared/fx.js` 第 311 行起 `readDataset` |
| **Minimal Solution** | 原样移到 `src/shared/dataset.js`，逻辑不改。 |
| **Complexity Cost** | 极低 |
| **Regression Risk** | Low |
| **Verdict** | **SIMPLIFY** |

---

#### JS-03 · P2 · 基线「未锁定/满28天自动锁定」为死代码

| 字段 | 内容 |
|---|---|
| **Location** | `loadBaselineLock` 永不 null；`maybeAutoLock`、today/trend 未锁定文案；data「恢复预填」文案不准 |
| **Minimal Solution** | 确认产品「基线永远锁定」→ 删未锁定分支与文案；改「恢复为内置参考期基线」。 |
| **Verdict** | **SIMPLIFY** |

---

#### JS-04 · P2 · 时长格式化可能输出「1 h 60 min」

| 字段 | 内容 |
|---|---|
| **Location** | `format.js` 第 24、28 行：`Math.round(m % 60)` 先于取整 |
| **Minimal Solution** | 先 `m = Math.round(m)` 再拆时分；三函数共用。 |
| **Verdict** | **FIX** |

---

#### JS-05 · P2 · 本地时间与 UTC 混用

| 字段 | 内容 |
|---|---|
| **Location** | `trend.js` 175–176、185 行；`charts.js` 134、338 行 |
| **Minimal Solution** | 统一 `getUTC*` 或从 `r.d` 字符串切片。 |
| **Required Tests** | `TZ=America/New_York` 周分组测试。 |
| **Verdict** | **FIX** |

---

#### ERR-02 · P2 · 空值渲染为 NaN% / null ms

| 字段 | 内容 |
|---|---|
| **Location** | `archive/main.js` 212 行（`c.dur`）、70 行（`L.hw`） |
| **Minimal Solution** | 空值「—」，宽度 0。 |
| **Verdict** | **FIX** |

---

#### DATA-04 · P2 · 删记录不删 dailyMeta

| 字段 | 内容 |
|---|---|
| **Location** | `src/monitor/views/data.js` |
| **Minimal Solution** | 删除时提示是否删补充数据，或一并删除。 |
| **Verdict** | **FIX** |

---

#### SSOT-04 · P2 · 基线与坐标轴数字散落

| 字段 | 内容 |
|---|---|
| **Location** | `docs.js` n=14/4.4417/0.0935；`check.mjs` 窗口 2026-08-08；体重轴 monitor 59.5/63、archive/docx 59.8–62.8 |
| **Minimal Solution** | 文案读 `DATASET._baseline`；轴域 min/max+留白取整 0.5。 |
| **Verdict** | **FIX** |

---

#### TEST-02 · P2 · 测试绑源码文本或当前数据

| 字段 | 内容 |
|---|---|
| **Location** | `chart-uid.test`、`gen-download.test`、`derive.test`（18 引文、kcal_range 耦合） |
| **Minimal Solution** | 改行为测试 + fixture。 |
| **Verdict** | **SIMPLIFY** |

---

#### CSS-01 · P2 · 关键文字对比度不足

| 令牌 | 背景 | 对比度 | 用途 |
|---|---|---|---|
| `--faint` | 浅/深 | 2.76 / 2.78 | 坐标轴 |
| `--warm` #f59f00 | 白 | 2.13 | 越界/警示 |
| `--cyan` | 浅 | 2.77 | 标签 |
| `--mint` | 浅 | 2.68 | 标签 |

浅色 `.hi` 已修正；`.orb-st.out`、`.t-val.is-mark`、`.tl-el.out`、`.verify.bad` 仍用 `--warm`。

| **Minimal Solution** | 浅色主题 `--warm-text` 给上述 4 选择器 |
| **Verdict** | **FIX** |

---

#### CSS-02 · P2 · 输入框 15px 触发 iOS 聚焦缩放

| **Minimal Solution** | 移动端断点 font-size 16px |
| **Verdict** | **FIX** |

---

#### DOC-02 · P2 · 维护规则双份副本且版本错

| **Location** | `系统维护规则v7.md` 与 `v3_0.md` 相同，均写 v7.0.2 |
| **Minimal Solution** | 删 v3_0；版本引用 release.js 或不写 |
| **Verdict** | **SIMPLIFY** |

---

### P3（摘要表）

| ID | 问题 | 最小方案 | Risk | Verdict |
|---|---|---|---|---|
| JS-06 | `runTotalKg` 返回公里；strength 重复；training.js 薄包装 | 改名 `runTotalKm`；删包装 | Low | SIMPLIFY |
| JS-07 | history 搜索破坏实体；每键全量重渲 | 先高亮再转义；120ms 防抖 | Low | FIX |
| JS-08 | `HRR_BAND_ENABLED:false` 关闭功能 | 有数据再定 | Low | DEFER |
| JS-09 | `#dsBannerCount`、`.reveal` 死代码 | 删除 | Low | SIMPLIFY |
| JS-10 | `esc` 不转义 `'` | 加一行 replace | Low | FIX |
| SSOT-05 | 趋势标签与常量 T 重复 | 标签由 T 拼接 | Low | FIX |
| ARCH-04 | derive 注释「纯函数」但 import content | 只改注释 | Low | KEEP |
| DATA-05 | 导出 JSON data+records 重复 307KB | 确认导入后删其一，保留兼容读 | Medium | DEFER |
| CSS-03 | 26 种 font-size、6 断点、56 hex、10 !important | 6–8 级字号、2–3 断点、hex→var | Medium | SIMPLIFY |
| CSS-04 | 图表仅 role=img | aria-label 摘要即可 | Low | DEFER |
| CSS-05 | monitor 无 print | 档案页为打印载体 | — | DEFER |
| DOC-03 | README 动态数据段；注释与 stamp 盐值存疑 | 删动态段；改注释 | Low | FIX |

---

## 二、明确 KEEP（不应再动）

| 模块 | 理由 |
|---|---|
| `scripts/publish-files.mjs` 同目录 rename + 回滚 | 原子发布正确，有测试 |
| `inject-data.mjs` 暂存→校验→发布 | 设计正确；BUILD-01 修好后可用 |
| `importJSON` 先校验后提交 + `validateImportPayload` | 应推广到粘贴路径的范本 |
| `mergeDailyValue` 三方合并 + 原型污染防护 | 正确且有测试 |
| `readDataset` fail-closed + 明确 fatal 提示 | 对完整性正确，勿改「尽量显示」 |
| `schema.js`、`isDate`、UTC time、`validate-dataset` 32 字段 | 小而清晰 |
| `history.js` `parseHistory` + 焦点陷阱 | 职责清楚 |
| `section-data.js`、`archive/html.js` | 纯函数易读 |
| 手写 SVG 图表（不引图表库） | 匹配单文件/离线/体积 |
| derive/check 基线复算、BUILD_META、预期 stamp | 数据一致性防线 |
| HarmonyOS 视觉、glass、reduced-motion | 产品身份 |
| 网页 SVG + docx PNG 双渲染 | 见 Trade-off 3 |

---

## 三、Architectural Trade-offs（标记，不改）

1. **单文件 HTML 交付** — 字体拉丁子集、数据内嵌、无懒加载；为有意识代价，勿为多文件而拆。
2. **seed 权威、本地补充** — 无同步时最简单可预期；问题在告知（DATA-02），非规则本身。
3. **网页 + Word 双图表渲染** — docx 需 PNG(resvg)，网页需 SVG；共享 derive/section-data 已是合理边界。
4. **content.js 叙述手写** — 「有温度档案」的产品代价；避免动态数值+固定注解错配（SSOT-03），勿全自动叙述。

---

## 四、Commercial Quality Roadmap

### Sprint 0：事实一致性与工程卫生

- BUILD-01 check 死锁
- TEST-01 干净克隆测试
- BUILD-03 合并 workflow
- SSOT-01 版本/Node/engines
- BUILD-02 源码包死链
- DOC-01、DOC-02、DOC-03

**验收**：全新 clone `npm ci && npm run build` 全绿；改数据后 `npm run inject` 全绿。

### Sprint 1：Reliability

- DATA-01 表单抹值
- DATA-03、JS-01 粘贴校验与转义
- ERR-01、ERR-02 空值崩溃
- DATA-02 覆盖提示
- JS-02 rAF/动效开关
- JS-04 时长格式
- JS-05 时区
- DATA-04 删除联动

### Sprint 2：Code Architecture

- ARCH-01 charts → shared
- ARCH-03 readDataset 出 fx.js
- ARCH-02 initState + 删转导出
- SSOT-03、SSOT-04、SSOT-05 单一事实来源

### Sprint 3：Testing

- TEST-04 jsdom：loadRecords 三分支、导出→导入、表单往返、XSS fixture
- TEST-02 行为测试 + fixture
- 可选 Playwright 冒烟

### Sprint 4：UI/CSS 克制简化

- CSS-01 对比度
- CSS-02 iOS 输入
- CSS-03 字号/断点/hex
- CSS-04 图表 aria

### Sprint 5：Simplification Pass

- JS-03 基线死代码
- JS-06 命名/重复/training 包装
- JS-09 死 DOM/CSS
- `!important` 清理
- DATA-05 导出去重（确认后）

---

## 五、三个最终结论

### 1. 距离顶级商业代码质量最大的 5 个差距

1. **用户编辑路径静默破坏数据**（DATA-01、DATA-03）— 修正时丢字段，商业产品最不可接受。
2. **工程链路不能从干净源码自证**（TEST-01、BUILD-01、BUILD-03）— CI 红、数据更新死锁。
3. **事实多来源且矛盾**（SSOT-01、SSOT-03、SSOT-04、DOC-01）— 版本、Node、基线、坐标轴、注解、测试数。
4. **测试覆盖形状而非行为**（TEST-02、TEST-04）— 危险路径无测，部分测源码正则。
5. **模块边界被副作用依赖打穿**（ARCH-01、ARCH-02）— 档案页双倍初始化，core 不可测。

### 2. 已经足够好、不应再动

单文件离线构建；手写 SVG；`publishFiles` 原子发布；`inject` 暂存发布；`importJSON` 先校验；`mergeDailyValue`；数据集 fail-closed + stamp/BUILD_META；`schema.js`、`section-data.js`、`parseHistory`；HarmonyOS 视觉与 reduced-motion。**抵制「再抽象一层」。**

### 3. 如果只能做 10 项修改（收益 / 风险 / 工作量）

| 序 | ID | 改动概要 | 约行数 |
|---|---|---|---|
| 1 | BUILD-01 | 下载页校验仅 `--release` | 1 |
| 2 | DATA-01 | select 载入保留原值 | 5 |
| 3 | TEST-01 | gen-download 测 fixture | 小文件 |
| 4 | DATA-03 + JS-01 | 粘贴校验 + 3 处 esc | ~10 |
| 5 | ERR-01 | 营养 range 可选链 | 2 |
| 6 | JS-02 | rAF 取消 + fx-toggle | ~15 |
| 7 | ARCH-01 | charts → shared | 2 import + 移文件 |
| 8 | SSOT-01 + BUILD-03 | 版本统一 + 合并 CI | 配置 |
| 9 | SSOT-03 | 注解进 content.js 按日期 | 低 |
| 10 | DOC-01 | 删漂移文档声明 | 文档 |

**前 5 项约 30 行可消除全部 P0 与主要数据风险。**

---

## 附录：审计环境与复现说明

- **源码路径**：解压至 `/tmp/audit/src`
- **构建产物**：与用户提供的成品逐字节一致（忽略 BUILD_META 注释）
- **浏览器实测**：表单 type 抹除、XSS（bed 字段）、fx rAF 叠加与开关
- **命令复现**：干净 clone `npm test` 失败；改数据后 `check`/`test:update` 失败；先 `gen-download` 后全链路通过
- **截图**（若需对照 UI）：`/opt/cursor/artifacts/screenshots/` 下 monitor/archive 深浅色与移动端截图

---

*本报告为第一阶段只读审计，未修改用户项目源码，未提供 patch。*
