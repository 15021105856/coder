/** 可注入的 localStorage 适配层（浏览器 / 单测 mock） */

export function safeGetItem(ls, key, readErrors) {
  try {
    return ls.getItem(key);
  } catch (e) {
    readErrors?.push({ key, message: e?.message || "read-failed" });
    return { __unreadable: true, key };
  }
}

export function createMemoryStorageAdapter(initial = {}, faults = {}) {
  const map = new Map(Object.entries(initial));
  const api = {
    getItem(key) {
      if (faults.getItem?.[key]) throw faults.getItem[key];
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      if (faults.setItem?.[key]) throw faults.setItem[key];
      map.set(key, String(value));
    },
    removeItem(key) {
      if (faults.removeItem?.[key]) throw faults.removeItem[key];
      map.delete(key);
    },
    probeWrite() {
      const k = "__physio_probe_" + Date.now();
      api.setItem(k, "1");
      api.removeItem(k);
      return true;
    },
    probe() {
      return api.probeWrite();
    },
    snapshot() {
      const out = {};
      for (const key of [...map.keys()]) {
        try {
          out[key] = api.getItem(key);
        } catch {
          /* 与浏览器适配器一致：不可读键跳过，不抛到调用方 */
        }
      }
      return out;
    },
    _map: map,
  };
  return api;
}

export function wrapLocalStorage(localStorage, faults = {}) {
  return {
    getItem(key) {
      if (faults.getItem?.[key]) throw faults.getItem[key];
      return localStorage.getItem(key);
    },
    setItem(key, value) {
      if (faults.setItem?.[key]) throw faults.setItem[key];
      localStorage.setItem(key, value);
    },
    removeItem(key) {
      if (faults.removeItem?.[key]) throw faults.removeItem[key];
      localStorage.removeItem(key);
    },
    probeWrite() {
      try {
        const k = "__physio_probe_" + Date.now();
        localStorage.setItem(k, "1");
        localStorage.removeItem(k);
        return true;
      } catch {
        return false;
      }
    },
    probe() {
      return this.probeWrite();
    },
    snapshot() {
      const out = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k == null) continue;
        try {
          out[k] = localStorage.getItem(k);
        } catch {
          /* 诊断扫描不得因单键失败而中断 */
        }
      }
      return out;
    },
  };
}
