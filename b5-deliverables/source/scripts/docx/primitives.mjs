/** Word 版文档原语：段落、表格、图片等 */
import {
  AlignmentType, BorderStyle, ImageRun, LineRuleType, Paragraph, ShadingType, Table, TableCell,
  TableLayoutType, TableRow, TextRun, VerticalAlign, WidthType,
} from "docx";
import { toPng } from "../svg-charts.mjs";
import { FONT, C, CW, SZ } from "./theme.js";

const NONE = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const NO_BORDERS = { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE };

export const tr = (text, o = {}) => new TextRun({ text: String(text ?? ""), font: FONT, ...o });
export const runs = (x) => (Array.isArray(x) ? x : [typeof x === "string" || typeof x === "number" ? tr(x) : x]);
const auto = (s) => (s?.line ? { ...s, lineRule: LineRuleType.AUTO } : s);
export const P = (x, o = {}) => new Paragraph({ children: runs(x), ...o, spacing: auto(o.spacing) });
export const gap = (after = 120) => P([], { spacing: { before: 0, after, line: 240 } });
export const num = (v, d = 0) => (v == null ? "—" : (+v).toFixed(d));
export const dotD = (d) => d.slice(5).replace("-", ".");

export function cell(content, o = {}) {
  const children = content instanceof Paragraph ? [content]
    : Array.isArray(content) && content[0] instanceof Paragraph ? content
    : [P(runs(content), { spacing: { before: 0, after: 0, line: 300 }, alignment: o.align, keepNext: o.keepNext })];
  return new TableCell({
    children,
    width: o.w ? { size: o.w, type: WidthType.DXA } : undefined,
    shading: o.fill ? { type: ShadingType.CLEAR, fill: o.fill, color: "auto" } : undefined,
    margins: { top: o.pad ?? 90, bottom: o.pad ?? 90, left: o.padX ?? 120, right: o.padX ?? 120 },
    verticalAlign: o.v || VerticalAlign.CENTER,
    borders: o.borders,
    columnSpan: o.span,
  });
}

const widths = (fr) => { const s = fr.reduce((a, b) => a + b, 0); return fr.map((f) => Math.round((f / s) * CW)); };

export function grid(rows, fr, o = {}) {
  const w = widths(fr);
  return new Table({
    rows, width: { size: CW, type: WidthType.DXA }, columnWidths: w, layout: TableLayoutType.FIXED,
    borders: o.borders || NO_BORDERS,
  });
}

export function table(head, rows, fr, o = {}) {
  const w = widths(fr || head.map(() => 1));
  const line = { style: BorderStyle.SINGLE, size: 4, color: C.line };
  const strong = { style: BorderStyle.SINGLE, size: 10, color: C.violet };
  const hRow = new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: head.map((h, i) => cell(tr(h, { bold: true, size: SZ.small, color: C.ink }), { w: w[i], fill: C.head, keepNext: o.keepTogether })),
  });
  const bRows = rows.map((r, ri) => new TableRow({
    cantSplit: true,
    children: r.map((c, i) => {
      const x = o.cellFn?.(c, i, ri);
      const content = x?.runs || tr(c, { size: 19, bold: i === 0 && o.firstBold !== false });
      return cell(content, { w: w[i], fill: x?.fill || (o.zebra && ri % 2 ? "FAFAFD" : undefined), borders: x?.borders, keepNext: o.keepTogether && ri < rows.length - 1 });
    }),
  }));
  return new Table({
    rows: [hRow, ...bRows], width: { size: CW, type: WidthType.DXA }, columnWidths: w, layout: TableLayoutType.FIXED,
    borders: { top: strong, bottom: strong, left: NONE, right: NONE, insideHorizontal: line, insideVertical: NONE },
  });
}

export function card(paras, fill = C.soft, accent) {
  const side = accent ? { style: BorderStyle.SINGLE, size: 24, color: accent } : NONE;
  return grid([new TableRow({ cantSplit: true, children: [cell(paras, { fill, pad: 200, padX: 260, v: VerticalAlign.TOP })] })], [1],
    { borders: { top: NONE, bottom: NONE, right: NONE, left: side, insideHorizontal: NONE, insideVertical: NONE } });
}

export const eyebrow = (t, color = C.faint) => P(tr(t, { size: SZ.tiny, color, characterSpacing: 30, bold: true }), { spacing: { before: 0, after: 80 } });
export const src = (t) => P([tr("来源 · ", { color: C.cyan, size: SZ.tiny, bold: true }), tr(t, { color: C.faint, size: SZ.tiny })], { spacing: { before: 60, after: 120 } });
export const note = (t, o = {}) => P(tr(t, { color: C.mut, size: SZ.small }), { spacing: { before: 80, after: 140, line: 320 }, ...o });
export const lead = (t) => P(tr(t, { size: 22 }), { spacing: { before: 60, after: 160, line: 380 } });

export function figure(svg, widthPx = 620) {
  const { png, w, h } = toPng(svg);
  return P(new ImageRun({ type: "png", data: png, transformation: { width: widthPx, height: Math.round((widthPx * h) / w) } }),
    { alignment: AlignmentType.CENTER, spacing: { before: 60, after: 60 }, keepNext: true });
}

export const legend = (items) => P(items.flatMap(([color, t, hollow]) => [
  tr(hollow ? "○ " : "■ ", { color, size: SZ.small }), tr(`${t}    `, { color: C.mut, size: SZ.tiny }),
]), { spacing: { before: 40, after: 40 }, alignment: AlignmentType.CENTER });

export { AlignmentType, BorderStyle, NONE, NO_BORDERS, C, CW, SZ, FONT };
