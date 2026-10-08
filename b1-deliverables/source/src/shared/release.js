/** 交付文件名与版本号：全项目唯一来源，改版本只改此 file + npm run build */
export const NS = "physio-log";
export const SUBJECT = "卅三";
export const VERSION = "v7.0";

export const RELEASE = {
  monitor: "训练监测系统_v7.html",
  archive: "个人训练档案_v7.html",
  docx: "个人训练档案_v7.docx",
  rules: "系统维护规则v7.md",
  /** 成品 zip 文件名（pack.mjs / download.html 从此读取，勿在脚本里硬编码 v7） */
  zipBundle: "个人训练系统_v7.zip",
  sourceZip: "个人训练系统_源码_v7.zip",
};

export const STORAGE_KEYS = {
  theme: `${NS}.theme`,
  fx: `${NS}.fx`,
  daily: `${NS}.daily`,
  records: `${NS}.records.v1`,
  dataVersion: `${NS}.data-version`,
  baseline: `${NS}.baseline.v1`,
  /** B1+ 权威逻辑快照（单键提交） */
  appState: `${NS}.app-state.v2`,
};
