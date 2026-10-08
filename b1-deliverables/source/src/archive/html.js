/* 档案网页版 HTML 拼装工具（纯字符串，无 DOM） */
import { esc } from "../shared/format.js";
import { icon } from "../shared/icons.js";
import { CHAPTERS } from "./content.js";

export { esc };

let _tn = 0, _fn = 0;
export function resetNumbering() { _tn = 0; _fn = 0; }
export const tableCount = () => _tn;
export const figureCount = () => _fn;
export const tcap = (t) => `<figcaption class="cap"><b>表 ${++_tn}</b><span>${esc(t)}</span></figcaption>`;
export const fcap = (t) => `<figcaption class="cap"><b>图 ${++_fn}</b><span>${esc(t)}</span></figcaption>`;
export const src = (t) => `<p class="src">${icon("data", "ic-xs")}来源：${esc(t)}</p>`;

export function table(head, rows, cls = "") {
  return `<div class="tbl ${cls}"><table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td${i === 0 ? ' class="k"' : ""}>${typeof c === "number" || typeof c === "string" ? esc(c) : c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

export function section(chapterOrId, inner, intro) {
  const chapter = typeof chapterOrId === "string" ? CHAPTERS.find((c) => c.id === chapterOrId) : chapterOrId;
  return `<section class="chap" id="${chapter.id}">
    <header class="ch-head rv"><span class="ch-no" aria-hidden="true">${chapter.no}</span>
      <div><div class="eyebrow">${esc(chapter.en)} · ${esc(chapter.from)}</div><h2>${/^\d+$/.test(chapter.no) && chapter.no !== "00" ? `<small>第 ${chapter.no} 章</small>` : ""}${esc(chapter.zh)}</h2>${intro ? `<p class="ch-intro">${esc(intro)}</p>` : ""}</div>
    </header>${inner}</section>`;
}
