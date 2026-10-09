import {
  SEED, state, sortedRecs, saveRecords, clearBaselineLock, maybeAutoLock, saveResultMessage,
  normalizeRec, esc, fmtTsec, fmtPace, hrrNorm, markRecordDeleted,
} from "../core.js";

const $ = (s, r = document) => r.querySelector(s);

const TBL_GROUPS = [
  { id: "core", name: "核心", on: true, cols: [["d", "日期"], ["hw", "夜HRV"], ["el", "RMSSD"], ["bed", "入睡"], ["dur", "时长min"], ["deep", "深%"], ["rem", "REM%"], ["cont", "连续"], ["wake", "醒"], ["shr", "睡HR"], ["type", "类型"], ["shoe", "鞋款"], ["km", "km"], ["pace", "配速"], ["hr", "均HR"], ["pw", "功率"], ["load", "负荷"], ["hrr0", "HRR起"], ["hrr1", "HRR末"], ["hrr", "HRR%"], ["pro", "蛋白"], ["kcal", "热量"], ["feel", "感受"]] },
  { id: "train", name: "训练扩展", on: false, cols: [["hrmax", "峰HR"], ["tsec", "训时"], ["rec", "恢复h"], ["ats", "有氧压"]] },
  { id: "gait", name: "跑姿", on: false, cols: [["gct", "触地ms"], ["cad", "步频"], ["vo", "振幅cm"], ["bal", "左%"]] },
  { id: "str", name: "力量", on: false, cols: [["vol", "容量kg"]] },
];
const TBL_DEC1 = ["ats", "vo", "bal"];

let toast = () => {};
let renderAll = () => {};

export function bindData({ toast: t, renderAll: r }) {
  toast = t;
  renderAll = r;
}

export function renderData() {
  const el = $("#view-data");
  const recs = sortedRecs().reverse();
  const cols = TBL_GROUPS.filter((g) => g.on).flatMap((g) => g.cols);
  const L = ["type", "shoe", "pace", "feel"];
  let html = `
    <div class="sec-head"><span class="eyebrow">§5 全量数据 · Raw Data</span><span class="note">n=${recs.length} 天 · 倒序 · 32 字段</span></div>
    <div class="tbl-tools">
      <span class="note">列组</span>
      ${TBL_GROUPS.map((g) => `<button class="chip${g.on ? " on" : ""}" data-g="${g.id}" aria-pressed="${g.on}">${g.name}</button>`).join("")}
      <span class="spacer"></span>
      <button class="btn sm" id="btnSeed">恢复预填数据</button>
    </div>
    <p class="note tbl-hint">左缘光条 = 该日有记录说明；长说明默认截断两行，点击展开全文。HRR% 为计算列；左% = 左右平衡左侧占比。</p>
    <div class="tbl-wrap glass big"><table><thead><tr>`;
  for (const [key, lb] of cols) html += `<th${L.includes(key) ? ' class="l"' : ""}>${lb}</th>`;
  html += `<th class="l">记录说明 / 备注</th><th></th></tr></thead><tbody>`;
  for (const r of recs) {
    const hp = hrrNorm(r);
    html += `<tr${r.flag ? ' class="fl"' : ""}>`;
    for (const [key] of cols) {
      let v = key === "hrr" ? (hp != null ? hp.toFixed(1) : null) : r[key];
      if (key === "pace" && v != null) v = fmtPace(v);
      if (key === "tsec" && v != null) v = fmtTsec(v);
      if (TBL_DEC1.includes(key) && v != null) v = v.toFixed(1);
      const cl = [];
      if (L.includes(key)) cl.push("l");
      if (key === "feel" && typeof v === "string") cl.push("cell-feel");
      if (v == null) cl.push("na");
      html += `<td${cl.length ? ` class="${cl.join(" ")}"` : ""}>${v == null ? "—" : esc(v)}</td>`;
    }
    const fmTxt = [r.flag, r.note].filter(Boolean).join(" · ");
    html += fmTxt ? `<td class="l cell-flag"><div class="flg-clamp" title="点击展开/收起">${esc(fmTxt)}</div></td>` : `<td class="l na">—</td>`;
    html += `<td><button class="del" data-d="${r.d}">删除</button></td></tr>`;
  }
  html += `</tbody></table></div>`;
  el.innerHTML = html;
  el.querySelectorAll(".flg-clamp").forEach((c) => (c.onclick = () => c.classList.toggle("open")));
  el.querySelectorAll(".tbl-tools .chip").forEach((b) => (b.onclick = () => { const g = TBL_GROUPS.find((x) => x.id === b.dataset.g); if (g.id === "core") return; g.on = !g.on; renderData(); }));
  el.querySelectorAll(".del").forEach((b) => (b.onclick = () => {
    const d = b.dataset.d;
    if (!confirm("删除 " + d + " 的记录？")) return;
    state.recs = state.recs.filter((r) => r.d !== d);
    markRecordDeleted(d);
    const r = saveRecords(state.recs);
    if (state.sel === d) state.sel = null;
    renderAll();
    if (r.ok) toast("已删除 " + d);
    else toast(saveResultMessage(r) || "删除未能保存");
  }));
  $("#btnSeed").onclick = () => {
    if (!confirm("将清空当前全部数据并恢复 " + SEED.length + " 天预填数据，同时解除参考期基线锁定。确定？（建议先导出 JSON 备份）")) return;
    state.recs = SEED.map(normalizeRec);
    clearBaselineLock();
    const r = saveRecords(state.recs);
    state.sel = null;
    if (r.ok) maybeAutoLock(toast);
    renderAll();
    if (r.ok) toast("已恢复预填数据（基线锁定已解除）");
    else toast(saveResultMessage(r) || "未能写入本机存储");
  };
}
