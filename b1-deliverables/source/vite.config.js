import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { readFileSync, existsSync, renameSync } from "node:fs";
import { resolve } from "node:path";
import { RELEASE } from "./src/shared/release.js";
import { buildMeta, buildMetaComment, runtimeInjectScript } from "./scripts/build-meta.mjs";

const DATASET = resolve(import.meta.dirname, "data/训练数据集.json");
const HISTORY = resolve(import.meta.dirname, "data/训练历史存档.md");

/* 两个页面各自打成一个离线单文件；输出名来自 src/shared/release.js */
const PAGES = {
  monitor: { input: "index.html", out: RELEASE.monitor },
  archive: { input: "archive.html", out: RELEASE.archive },
};

/* 把《训练数据集.json》与《训练历史存档.md》原样嵌入页面的
   <script type="application/json" id="dataset"> / <script type="text/markdown" id="history">。
   以后只更新这两份文件时，运行 npm run inject 替换标签内容即可，不必重新构建。 */
function embedSources() {
  const embed = (file) => readFileSync(file, "utf8").trim().replace(/<\//g, "<\\/");
  return {
    name: "embed-sources",
    transformIndexHtml(html) {
      const meta = buildMeta(DATASET);
      const metaComment = buildMetaComment(meta);
      const runtime = runtimeInjectScript(meta);
      return html
        .replace("<!--BUILD_META-->", metaComment)
        .replace("<!--RUNTIME_INJECT-->", runtime)
        .replace("<!--DATASET-->", () => `<script type="application/json" id="dataset">\n${embed(DATASET)}\n</script>`)
        .replace("<!--HISTORY-->", () => `<script type="text/markdown" id="history">\n${embed(HISTORY)}\n</script>`);
    },
    configureServer(server) {
      server.watcher.add([DATASET, HISTORY]);
      server.watcher.on("change", (f) => {
        if ([DATASET, HISTORY].includes(resolve(f))) server.ws.send({ type: "full-reload" });
      });
    },
  };
}

function renameHtml(page) {
  return {
    name: "rename-html",
    enforce: "post",
    closeBundle() {
      const from = resolve(import.meta.dirname, "release", page.input);
      if (existsSync(from)) renameSync(from, resolve(import.meta.dirname, "release", page.out));
    },
  };
}

export default defineConfig(({ command, mode }) => {
  const page = PAGES[mode] || PAGES.monitor;
  return {
    plugins: [
      embedSources(),
      ...(command === "build" ? [viteSingleFile({ removeViteModuleLoader: true }), renameHtml(page)] : []),
    ],
    server: { host: "0.0.0.0", port: 47321, strictPort: true },
    preview: { host: "0.0.0.0", port: 47322 },
    build: {
      outDir: "release",
      emptyOutDir: false,
      assetsInlineLimit: 100000000,
      rollupOptions: { input: resolve(import.meta.dirname, page.input) },
    },
  };
});
