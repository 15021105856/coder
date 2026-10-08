/** 可注入的 localStorage 适配层（浏览器 / 单测 mock） */

export function createMemoryStorageAdapter(initial = {}, faults = {}) {
  const map = new Map(Object.entries(initial));
  return {
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
    probe() {
      const k = "__physio_probe_" + Date.now();
      this.setItem(k, "1");
      this.removeItem(k);
      return true;
    },
    snapshot() {
      return Object.fromEntries(map);
    },
    _map: map,
  };
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
    probe() {
      try {
        const k = "__physio_probe_" + Date.now();
        localStorage.setItem(k, "1");
        localStorage.removeItem(k);
        return true;
      } catch {
        return false;
      }
    },
    snapshot() {
      const out = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        out[k] = localStorage.getItem(k);
      }
      return out;
    },
  };
}
