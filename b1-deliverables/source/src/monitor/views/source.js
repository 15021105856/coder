import { icon } from "../../shared/icons.js";
import { state, pad2, upsertRecords } from "../core.js";

const $ = (s, r = document) => r.querySelector(s);

const ENTRY_GROUPS = [
  { legend: "睡眠 / HRV", ic: "moon", fields: [["bed", "入睡时刻", "text", "00:14"], ["dur", "睡眠时长 min", "numi", "455"], ["deep", "深睡 %", "numi", "30"], ["rem", "REM %", "numi", "9"], ["cont", "深睡连续性", "numi", "85"], ["wake", "觉醒次数", "numi", "2"], ["shr", "睡眠平均HR bpm", "numi", "49"], ["hw", "夜间HRV·华为 ms", "numi", "110"], ["el", "晨起RMSSD·Elite ms", "num", "80.2"]] },
  { legend: "训练", ic: "run", fields: [["type", "类型", "seltype", ""], ["shoe", "鞋款", "selshoe", ""], ["km", "距离 km", "num", "9.48"], ["pace", "配速 m:ss", "text", "6:32"], ["hr", "平均心率 bpm", "numi", "141"], ["hrmax", "峰值心率 bpm", "numi", "170"], ["pw", "功率 W", "numi", "174"], ["load", "手表负荷", "numi", "51"], ["tsec", "训练时长 s", "numi", "3556"], ["rec", "恢复时间 h", "numi", "10"], ["ats", "有氧训练压力", "num", "2.5"], ["hrr0", "HRR起始 bpm", "numi", "161"], ["hrr1", "HRR·1分钟末 bpm", "numi", "125"]] },
  { legend: "跑姿（仅跑步日）", ic: "shoe", fields: [["gct", "触地时间 ms", "numi", "236"], ["cad", "步频 spm", "numi", "179"], ["vo", "垂直振幅 cm", "num", "9.2"], ["bal", "左右平衡·左 %", "num", "50.2"]] },
  { legend: "力量（仅力量日）", ic: "dumbbell", fields: [["vol", "总容量 kg", "numi", "3483"]] },
  { legend: "营养", ic: "bowl", fields: [["pro", "蛋白 g", "numi", "107"], ["kcal", "热量 kcal", "numi", "2750"]] },
  { legend: "主观 / 标记", ic: "flag", fields: [["feel", "主观感受 1–5", "selfeel", ""], ["flag", "记录说明", "text", "记录来源、条件或特殊事件"], ["note", "备注", "textarea", ""]] },
];
const SHOE_OPTS = ["Adios 9", "React", "飞电6C", "Kinvara 13", "其他"];
const TYPE_OPTS = ["有氧", "阈值", "间歇", "背日", "胸肩", "腿日", "球类", "休息", "其他"];

let toast = () => {};
let renderAll = () => {};
let switchView = () => {};

export function bindSource({ toast: t, renderAll: r, switchView: s }) {
  toast = t;
  renderAll = r;
  switchView = s;
}

export function renderSource() {
  const el = $("#view-source");
  const t = new Date(), todayS = t.getFullYear() + "-" + pad2(t.getMonth() + 1) + "-" + pad2(t.getDate());
  el.innerHTML = `
    <div class="sec-head"><span class="eyebrow">§4 数据来源 · Data Source</span><span class="note">唯一真源：《训练数据集.json》</span></div>
    <div class="flow glass">
      ${[["watch", "手表 / Elite 截图发给 Claude"], ["data", "Claude 更新《训练数据集.json》"], ["spark", "替换页面内嵌数据或重新构建"], ["check", "打开新文件即完成同步"]].map(([ic, t], i) => `<div class="flow-step"><span class="fs-node">${icon(ic)}<b>${pad2(i + 1)}</b></span><span>${t}</span></div>`).join("")}
    </div>
    <div class="callout glass"><b>主路径不需要在这里录入任何东西。</b>本页的粘贴导入和手工录入是补充路径：给「文件还没重新生成、但今天的数据想先看判定」这种时间差用的。本机新增的数据在下次打开新文件时按日期合并，不会丢。</div>
    <div class="panel glass">
      <div class="p-head"><span class="p-title">粘贴导入 · 让 Claude 直接吐一段 JSON</span><span class="p-val">同日覆盖 · 其余保留</span></div>
      <div class="paste-body">
        <p class="note">把截图发给 Claude 时说一句「按 physio-log 记录格式输出 JSON 数组」，把回复粘到这里。字段名见下方手工录入表单的括号内。</p>
        <textarea id="pasteBox" class="mono" placeholder='[{"d":"${todayS}","el":80.2,"shr":49,...}]'></textarea>
        <div class="form-actions"><button class="btn primary" id="pasteBtn">解析并合并</button><span class="note" id="pasteMsg"></span></div>
      </div>
    </div>
    <details class="entry glass">
      <summary><span class="plus"></span>手工录入 / 修正单日数据<span class="note">补充路径，展开使用</span></summary>
      <form id="entryForm" novalidate>
        <div class="f-head">
          <div><label for="f-d">日期</label><input type="date" id="f-d" value="${state.sel || todayS}" required></div>
          <span class="mark-chip" id="editChip" hidden>正在覆盖已有记录</span>
          <span class="note">选择已有日期会载入该日数据以便修正。空字段 = 未测量，不参与统计。</span>
        </div>
        ${ENTRY_GROUPS.map((g) => `<fieldset><legend>${icon(g.ic, "ic-xs")}${g.legend}</legend><div class="f-grid">
          ${g.fields.map(([key, label, kind, ph]) => {
            const id = "f-" + key;
            let ctl;
            if (kind === "seltype") ctl = `<select id="${id}"><option value="">—</option>${TYPE_OPTS.map((o) => `<option>${o}</option>`).join("")}</select>`;
            else if (kind === "selshoe") ctl = `<select id="${id}"><option value="">—</option>${SHOE_OPTS.map((o) => `<option>${o}</option>`).join("")}</select>`;
            else if (kind === "selfeel") ctl = `<select id="${id}"><option value="">—</option>${[1, 2, 3, 4, 5].map((o) => `<option>${o}</option>`).join("")}</select>`;
            else if (kind === "textarea") ctl = `<textarea id="${id}"></textarea>`;
            else ctl = `<input id="${id}" type="text" inputmode="${kind === "numi" ? "numeric" : kind === "num" ? "decimal" : "text"}" placeholder="${ph}">`;
            return `<div class="f-cell${kind === "textarea" ? " f-wide" : ""}"><label for="${id}">${label}<span class="faint"> (${key})</span></label>${ctl}</div>`;
          }).join("")}</div></fieldset>`).join("")}
        <div class="form-actions"><button type="submit" class="btn primary">保存本日记录</button><button type="button" class="btn" id="clearForm">清空表单</button></div>
      </form>
    </details>`;

  $("#pasteBtn").onclick = () => {
    const box = $("#pasteBox"), msg = $("#pasteMsg");
    let txt = box.value.trim();
    if (!txt) { msg.textContent = "空的。"; return; }
    txt = txt.replace(/^```(json)?/i, "").replace(/```$/, "").trim();
    try {
      let obj = JSON.parse(txt);
      if (!Array.isArray(obj)) obj = [obj];
      const { add, upd, saved } = upsertRecords(obj, toast);
      if (add + upd === 0) { msg.textContent = "没有可识别的记录（每条需含 d: YYYY-MM-DD）。"; return; }
      box.value = ""; msg.textContent = ""; state.sel = null;
      renderAll();
      if (saved) toast("合并完成：新增 " + add + " 天，覆盖 " + upd + " 天");
    } catch (e) { msg.textContent = "JSON 解析失败：" + e.message; }
  };
  const form = $("#entryForm"), dateInput = $("#f-d"), chip = $("#editChip");
  function loadIntoForm(d) {
    const r = state.recs.find((x) => x.d === d);
    chip.hidden = !r;
    for (const g of ENTRY_GROUPS) for (const [key] of g.fields) { const ctl = $("#f-" + key); if (ctl) ctl.value = r && r[key] != null ? r[key] : ""; }
  }
  dateInput.addEventListener("change", () => loadIntoForm(dateInput.value));
  loadIntoForm(dateInput.value);
  $("#clearForm").onclick = () => { for (const g of ENTRY_GROUPS) for (const [key] of g.fields) { const c = $("#f-" + key); if (c) c.value = ""; } chip.hidden = true; };
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const d = dateInput.value;
    if (!d) { toast("请选择日期"); return; }
    const r = { d };
    for (const g of ENTRY_GROUPS) for (const [key, , kind] of g.fields) {
      const raw = $("#f-" + key).value.trim();
      if (raw === "") { r[key] = null; continue; }
      if (kind === "num" || kind === "numi" || kind === "selfeel") { const v = Number(raw); r[key] = isFinite(v) ? v : null; }
      else r[key] = raw;
    }
    const { saved } = upsertRecords([r], toast);
    state.sel = d;
    if (saved) toast("已保存 " + d);
    renderAll();
    switchView("today");
  });
}
