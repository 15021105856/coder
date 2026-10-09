/* ================================================================
   附录 D · 训练历史存档
   源文件 data/训练历史存档.md 在构建时原样内嵌（<script type="text/markdown" id="history">），
   这里只做解析与呈现，不改写任何文字。parseHistory 为纯函数，Word 生成脚本同样使用。
   ================================================================ */

import { esc } from "../shared/format.js";
const norm = (s) => s.replace(/\s+/g, " ").trim();
const cells = (line) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
const isSep = (line) => /^\|[\s:|-]+\|\s*$/.test(line) && line.includes("-");

export function parseHistory(md) {
  const lines = String(md || "").replace(/\r\n?/g, "\n").split("\n");
  const blocks = [], toc = [];
  let chap = null, sec = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      const level = h[1].length, text = norm(h[2]), id = `hd-${blocks.length}`;
      const b = { kind: "h", level, text, id };
      if (level === 2) { chap = { id, text, secs: [] }; toc.push(chap); sec = null; }
      if (level === 3) { sec = { id, text }; (chap || (chap = { id, text: "", secs: [] })).secs.push(sec); if (!toc.includes(chap)) toc.push(chap); }
      b.chap = chap?.id; b.sec = level === 3 ? id : sec?.id;
      blocks.push(b);
      continue;
    }
    if (line.trim().startsWith("|")) {
      const rows = [];
      let head = null;
      for (; i < lines.length && lines[i].trim().startsWith("|"); i++) {
        if (isSep(lines[i])) { if (rows.length === 1 && !head) head = rows.pop(); continue; }
        rows.push(cells(lines[i]));
      }
      i--;
      /* 两列表是「项目｜内容」式的键值表，首行也是数据 */
      const kv = (head || rows[0] || []).length === 2;
      if (kv && head) { rows.unshift(head); head = null; }
      blocks.push({ kind: "table", head, rows, kv, chap: chap?.id, sec: sec?.id, text: [head, ...rows].filter(Boolean).flat().join(" ") });
      continue;
    }
    blocks.push({ kind: "p", text: line.trim(), chap: chap?.id, sec: sec?.id });
  }
  const text = blocks.map((b) => b.text).join("\n");
  const frozen = text.match(/冻结时点：(\d{4}-\d{2}-\d{2})/)?.[1] || null;
  return {
    blocks, toc, frozen,
    stats: {
      chars: text.replace(/\s/g, "").length,
      chapters: toc.filter((c) => c.text).length,
      sections: toc.reduce((a, c) => a + c.secs.length, 0),
      tables: blocks.filter((b) => b.kind === "table").length,
    },
  };
}

/* 某一天在存档里的提及：同时匹配「9/8」与「9月8日」两种写法 */
export function dayPattern(d) {
  const m = +d.slice(5, 7), day = +d.slice(8, 10);
  return new RegExp(`(?<![\\d/.])${m}/${day}(?![\\d])|(?<!\\d)${m}月${day}日`, "g");
}
export const countMatches = (text, re) => (text.match(re) || []).length;

/* ================= 阅读器（浏览器端） ================= */
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

function trapFocus(e, root) {
  const list = [...root.querySelectorAll(FOCUSABLE)]
    .filter((el) => el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement);
  if (!list.length) return;
  const first = list[0], last = list[list.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  else if (!root.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
}

function searchRegex(raw) {
  const q = (raw || "").trim();
  if (!q) return null;
  try {
    return new RegExp(q.split(/\s+/).filter(Boolean).map(reEsc).join("|"), "gi");
  } catch {
    return null;
  }
}

export function mountHistoryReader(root, H, { icon, onClose } = {}) {
  let built = false, hits = [], cur = -1, lastFocus = null;
  const blockHtml = (b, re) => {
    const t = (s) => (re ? esc(s).replace(re, (m) => `<mark>${m}</mark>`) : esc(s));
    if (b.kind === "h") return `<h${b.level + 2} id="${b.id}" class="hb-h l${b.level}">${t(b.text)}</h${b.level + 2}>`;
    if (b.kind === "p") return `<p>${t(b.text)}</p>`;
    const th = b.head ? `<thead><tr>${b.head.map((c) => `<th>${t(c)}</th>`).join("")}</tr></thead>` : "";
    return `<div class="tbl${b.kv ? " kv" : ""}"><table>${th}<tbody>${b.rows.map((r) => `<tr>${r.map((c, i) => `<td${i === 0 ? ' class="k"' : ""}>${t(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  };

  function build() {
    if (built) return;
    built = true;
    root.innerHTML = `
      <div class="hist-panel">
        <header class="hist-top">
          <div class="hist-ttl"><div class="eyebrow">附录 D · Training History · 冻结于 ${H.frozen || "—"}</div><h2 id="histTitle">训练历史存档</h2></div>
          <label class="hist-search">${icon ? icon("search", "ic-xs") : ""}<input id="histQ" type="search" placeholder="检索全文，如 右肩、HRR、8/24" autocomplete="off" aria-label="检索历史存档"><span class="hist-n" id="histN" aria-live="polite" aria-atomic="true"></span></label>
          <div class="hist-nav"><button class="icon-btn sm" id="histPrev" aria-label="上一处" title="上一处">${icon ? icon("up", "ic-xs") : "↑"}</button><button class="icon-btn sm" id="histNext" aria-label="下一处" title="下一处">${icon ? icon("down", "ic-xs") : "↓"}</button></div>
          <button class="icon-btn" id="histClose" aria-label="关闭历史存档" title="关闭（Esc）">${icon ? icon("close") : "×"}</button>
        </header>
        <div class="hist-body">
          <nav class="hist-toc" id="histToc" aria-label="历史存档目录">${H.toc.map((c) => `
            <div class="ht-c"><a href="#${c.id}" data-go="${c.id}">${esc(c.text || "卷首")}</a>${c.secs.length ? `<div class="ht-s">${c.secs.map((s) => `<a href="#${s.id}" data-go="${s.id}">${esc(s.text)}</a>`).join("")}</div>` : ""}</div>`).join("")}
          </nav>
          <article class="hist-doc" id="histDoc" tabindex="-1">
            <p class="hist-note">以下为《训练历史存档.md》原文，按原样内嵌，不代表当前训练处方或已验证结论；旧章节号均指冻结版本。现行口径见第 07、08 章。</p>
            <div id="histBlocks">${H.blocks.map((b, i) => `<div class="hb" data-i="${i}">${blockHtml(b)}</div>`).join("")}</div>
            <p class="hist-empty" id="histEmpty" hidden aria-live="polite">没有找到匹配内容。</p>
          </article>
        </div>
      </div>`;
    const q = root.querySelector("#histQ");
    let t = null;
    q.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => search(q.value), 160); });
    q.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); step(e.shiftKey ? -1 : 1); } });
    root.querySelector("#histPrev").onclick = () => step(-1);
    root.querySelector("#histNext").onclick = () => step(1);
    root.querySelector("#histClose").onclick = close;
    root.querySelector("#histToc").addEventListener("click", (e) => {
      const a = e.target.closest("[data-go]"); if (!a) return;
      e.preventDefault(); go(a.dataset.go);
    });
    root.addEventListener("keydown", (e) => {
      if (e.key === "Escape") close();
      if (e.key === "Tab") trapFocus(e, root);
    });
  }

  function search(raw, re0) {
    const q = (raw || "").trim();
    const wrap = root.querySelector("#histBlocks"), nodes = wrap.children;
    const re = re0 || searchRegex(q);
    const showSec = new Set(), showChap = new Set(), match = [];
    H.blocks.forEach((b, i) => {
      const ok = !re || (re.lastIndex = 0, re.test(b.text));
      match[i] = ok;
      if (ok && re) { if (b.sec) showSec.add(b.sec); if (b.chap) showChap.add(b.chap); }
    });
    let n = 0;
    H.blocks.forEach((b, i) => {
      const el = nodes[i];
      const keepHead = re && b.kind === "h" && (b.level === 1 || (b.level === 2 ? showChap.has(b.id) : showSec.has(b.id)));
      const vis = !re || match[i] || keepHead;
      el.hidden = !vis;
      el.innerHTML = blockHtml(b, re && match[i] ? (re.lastIndex = 0, re) : null);
      if (re && match[i]) n += el.querySelectorAll("mark").length;
    });
    hits = [...wrap.querySelectorAll("mark")];
    cur = -1;
    root.querySelector("#histN").textContent = q && !re ? "无效检索式" : re ? `${n} 处 · ${showSec.size || showChap.size} 节` : "";
    root.querySelector("#histEmpty").hidden = !re || n > 0;
    root.querySelectorAll("#histToc [data-go]").forEach((a) => a.classList.toggle("dim", !!re && !showSec.has(a.dataset.go) && !showChap.has(a.dataset.go)));
    if (hits.length) step(1);
  }
  function step(d) {
    if (!hits.length) return;
    hits[cur]?.classList.remove("on");
    cur = (cur + d + hits.length) % hits.length;
    hits[cur].classList.add("on");
    hits[cur].scrollIntoView({ block: "center", behavior: "smooth" });
    root.querySelector("#histN").textContent = root.querySelector("#histN").textContent.replace(/^(\d+\/)?/, `${cur + 1}/`);
  }
  function go(id) {
    const el = root.querySelector(`#${CSS.escape(id)}`);
    if (el) { el.closest(".hb").hidden = false; el.scrollIntoView({ block: "start", behavior: "smooth" }); }
  }
  function open({ q = "", re = null, label = "", sec = null } = {}) {
    build();
    lastFocus = document.activeElement;
    root.hidden = false;
    document.body.classList.add("hist-open");
    requestAnimationFrame(() => root.classList.add("on"));
    const input = root.querySelector("#histQ");
    input.value = label || q;
    search(q, re);
    if (sec) go(sec);
    else if (!q && !re) root.querySelector("#histDoc").scrollTop = 0;
    (q || re ? input : root.querySelector("#histDoc")).focus({ preventScroll: true });
  }
  function close() {
    root.classList.remove("on");
    document.body.classList.remove("hist-open");
    setTimeout(() => { root.hidden = true; }, 220);
    lastFocus?.focus?.({ preventScroll: true });
    onClose?.();
  }
  return { open, close, isOpen: () => !root.hidden };
}
