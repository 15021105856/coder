/** 单个目标文件同目录 rename；可捕获失败时回滚整批。非跨文件断电事务。 */
import { copyFileSync, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
export function publishFiles(pairs) {
  const id = randomUUID(), work = [];
  let committed = false;
  try {
    for (const [source, destination] of pairs) {
      mkdirSync(dirname(destination), { recursive: true });
      const item = { destination, next: `${destination}.next-${id}`, backup: `${destination}.previous-${id}`, old: existsSync(destination), published: false };
      work.push(item); copyFileSync(source, item.next);
    }
    for (const item of work) {
      if (item.old) renameSync(item.destination, item.backup);
      renameSync(item.next, item.destination); item.published = true;
    }
    committed = true;
  } catch (e) {
    const failures = [];
    for (const item of work.toReversed()) {
      try {
        if (item.published) rmSync(item.destination, { force: true });
        if (existsSync(item.backup)) renameSync(item.backup, item.destination);
      } catch (rollbackError) { failures.push(rollbackError); }
    }
    if (failures.length) throw new AggregateError([e, ...failures], '发布失败且回滚未完成；保留 .previous 备份供恢复');
    throw e;
  } finally {
    for (const item of work) {
      rmSync(item.next, { force: true });
      if (committed) rmSync(item.backup, { force: true });
    }
  }
}
