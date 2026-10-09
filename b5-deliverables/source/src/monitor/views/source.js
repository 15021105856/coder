import { icon } from "../../shared/icons.js";
import { state, storage, pad2, upsertRecords, reloadLatestState, saveResultMessage } from "../core.js";
import { importText } from "../io.js";
import { editRecord } from "../../shared/record-edit.js";

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
        <div class="form-actions"><button type="submit" class="btn primary">保存本日记录</button><button type="button" class="btn" id="clearForm">清空表单</button><button type="button" id="reloadForm" hidden>放弃草稿并重载本日</button></div>
      </form>
    </details>`;

  $("#pasteBtn").onclick = async () => {
    const box = $("#pasteBox"), msg = $("#pasteMsg");
    const txt = box.value;
    if (!txt) { msg.textContent = "空的。"; return; }
    const result = await importText(txt, toast, renderAll, "合并完成");
    if (result.saved) { box.value = "";msg.textContent = ""; }
    else msg.textContent = result.issues?.[0] || "改动未保存，粘贴内容保留";
  };
  const form = $("#entryForm"), dateInput = $("#f-d"), chip = $("#editChip");
  const fields = ENTRY_GROUPS.flatMap((g) => g.fields);
  const kinds = Object.fromEntries(fields.map(([key, , kind]) => [key, kind]));
  const readValues = () => Object.fromEntries(fields.map(([key]) => [key, $("#f-" + key).value]));
  let loadedDate, base, shown;
  function loadIntoForm(d) {
    const r = state.recs.find((x) => x.d === d);
    loadedDate = d;
    $("#reloadForm").hidden = true;
    $("#reloadForm").className = "";
    base = r ? structuredClone(r) : null;
    chip.hidden = !r;
    for (const [key] of fields) {
      const ctl = $("#f-" + key);
      const value = r && r[key] != null ? String(r[key]) : "";
      if (ctl.tagName === "SELECT") {
        ctl.querySelectorAll("option[data-original]").forEach((o) => o.remove());
        if (![...ctl.options].some((o) => o.value === value)) {
          const option = document.createElement("option");
          option.value = value;
          option.textContent = value;
          option.dataset.original = "true";
          ctl.appendChild(option);
        }
      }
      ctl.value = value;
    }
    shown = readValues();
  }
  dateInput.addEventListener("change", () => loadIntoForm(dateInput.value));
  loadIntoForm(dateInput.value);
  $("#clearForm").onclick = () => { for (const [key] of fields) $("#f-" + key).value = ""; };
  $("#reloadForm").onclick = async () => {
    if (storage.conflict) {
      if (!confirm("将放弃本页面全部未保存改动并载入本机最新数据。需要保留草稿请先导出 JSON。继续？")) return;
      const result = await reloadLatestState();
      if (!result.ok) { toast(saveResultMessage(result)); return; }
    }
    loadIntoForm(dateInput.value);
    renderAll();
  };
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const d = dateInput.value;
    if (!d) { toast("请选择日期"); return; }
    if (d !== loadedDate) {
      toast("日期已变更，请重新选择日期载入记录后再编辑");
      $("#reloadForm").hidden = false;
      $("#reloadForm").className = "btn";
      return;
    }
    const edit = editRecord({ date: d, base, current: state.recs.find((r) => r.d === d), shown, values: readValues(), kinds });
    if (!edit.ok) {
      toast(edit.reason === "stale" ? "该日记录已变更，草稿未保存；可点击「放弃草稿并重载本日」" : edit.issues[0]);
      if (edit.reason === "stale") {
        $("#reloadForm").hidden = false;
        $("#reloadForm").className = "btn";
      }
      return;
    }
    if (!edit.changed && !storage.pendingCommit) { toast("记录没有改动"); return; }
    const submittedValues = readValues();
    form.inert = true;
    let saved;
    try { ({ saved } = await upsertRecords([edit.record], toast)); }
    finally { form.inert = false; }
    if (storage.conflict) {
      $("#reloadForm").hidden = false;
      $("#reloadForm").className = "btn";
      renderAll();
      return;
    }
    state.sel = d;
    // 失败保存仍更新页面内的编辑基底，方便在恢复后重试；草稿保持显示。
    base = structuredClone(state.recs.find((r) => r.d === d) || edit.record);
    shown = submittedValues;
    if (saved) toast("已保存 " + d);
    renderAll();
    switchView("today");
  });
}
