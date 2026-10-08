/** 非致命异常：开发环境 console.warn，生产单文件不刷屏 */
export function devWarn(scope, err) {
  if (import.meta.env?.DEV) console.warn(`[${scope}]`, err);
}
