import { icon } from "../../shared/icons.js";
import { DATASET_META, esc } from "../core.js";

const $ = (s, r = document) => r.querySelector(s);

export function renderDocs() {
  const M = DATASET_META;
  const cards = [
    ["shield", "记录与解释", "本页描述数据变化，不生成训练处方。日常体感与实际表现需结合考虑；缺测不等于正常或休息，普通记录说明不等于异常。"],
    ["target", "固定参考期", "Elite参考期为2026-08-08至08-23，排除08-16、08-17，n=14。lnRMSSD均值4.4417、样本标准差0.0935。日常新增数据不自动改变参考期；手动锁定操作由使用者决定。原始数据保留与统计排除是两件事。"],
    ["trend", "趋势规则", "7日滚动均值至少需要3个有效值。只有连续日历日存在当日晨测且滚动均值低于参考带，才累计连续天数；缺测打断计数。RMSSD和睡眠心率方向只作描述，不能单独确定疲劳或测量污染。"],
    ["watch", "测量口径", "华为夜间HRV和Elite晨起值分开。手动一分钟HRR显示原始下降bpm并附归一化百分比，自动两分钟值不混入。计时起点未明确的记录单独说明。功率只记录、不解读。"],
    ["scale", "体重与营养", "体重图只使用已结构化的上午记录，晚间保留但不混入。7日均值显示样本数；采集条件未确认时不冒充标准空腹趋势。热量和蛋白为估算，应结合当日范围。"],
    ["layers", "文件与多课", "可导入训练数据集的data结构及旧版records导出。JSON导出含32字段、固定参考期和_daily补充记录。主课字段与已知全天合计分开，周跑量优先用显式全天值；未完成全历史迁移的周总量可能不完整。"],
  ];
  const list = (arr) => `<ul>${(arr || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
  $("#view-docs").innerHTML = `
    <div class="sec-head"><span class="eyebrow">§6 阈值与口径 · Methods</span><span class="note">规则来自《训练数据集.json》与档案第 07、08 章</span></div>
    <div class="doc-grid">${cards.map(([ic, h, p]) => `<article class="doc glass lit rise"><span class="doc-ic">${icon(ic)}</span><h3>${h}</h3><p>${p}</p></article>`).join("")}</div>
    <div class="grid-2 doc-lists">
      <article class="doc glass"><h3>录入纪律</h3>${list(M._entry_discipline)}</article>
      <article class="doc glass"><h3>格式规则</h3>${list(M._format_rules)}</article>
    </div>
    <article class="doc glass wide"><h3>校准说明</h3>${list(M._calibration_notes)}</article>
    <article class="doc glass wide"><h3>32 字段定义</h3><div class="fields">${Object.entries(M._field_definitions || {}).map(([k, v]) => `<div><code>${k}</code><span>${esc(v)}</span></div>`).join("")}</div></article>`;
}
