/** 表/图编号：与网页版 html.js 同一规则（按出现顺序自增） */
import { ShadingType } from "docx";
import { C, SZ } from "./theme.js";

let TN = 0;
let FN = 0;

export function resetNumbering() {
  TN = 0;
  FN = 0;
}

export const tableCount = () => TN;
export const figureCount = () => FN;

export const capPara = (P, tr, label, color, text) => P([
  tr(` ${label} `, { bold: true, color: "FFFFFF", size: SZ.small, shading: { type: ShadingType.CLEAR, fill: color, color: "auto" } }),
  tr(`  ${text}`, { color: C.mut, size: SZ.small }),
], { keepNext: true, spacing: { before: 200, after: 100 } });

export function makeCaptions(P, tr) {
  return {
    tcap: (t) => capPara(P, tr, `表 ${++TN}`, C.violet, t),
    fcap: (t) => capPara(P, tr, `图 ${++FN}`, C.cyan, t),
  };
}
