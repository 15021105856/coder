export interface Kv {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export const DATA_KEY = 'pku346-recall-v1'
export const BACKUP_KEY = 'pku346-recall-backup-v1'

export function memoryKv(): Kv {
  const map = new Map<string, string>()
  return {
    getItem: (key) => (map.has(key) ? map.get(key)! : null),
    setItem: (key, value) => {
      map.set(key, value)
    },
    removeItem: (key) => {
      map.delete(key)
    },
  }
}

export function safeGet(kv: Kv, key: string): { value: string | null; warning?: string } {
  try {
    return { value: kv.getItem(key) }
  } catch (error) {
    return { value: null, warning: error instanceof Error ? error.message : '无法读取本地存储' }
  }
}

export function safeSet(kv: Kv, key: string, value: string): { ok: boolean; warning?: string } {
  try {
    kv.setItem(key, value)
    return { ok: true }
  } catch (error) {
    return { ok: false, warning: error instanceof Error ? error.message : '无法写入本地存储' }
  }
}
