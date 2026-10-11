import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  EXPECTED_CONTENT_VERSION,
  EXPECTED_PARSE,
  EXPECTED_SOURCE_HASHES,
  SOURCE_FILES,
} from './content-baseline.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function fail(message) {
  console.error(`verify-package: ${message}`)
  process.exit(1)
}

for (const rel of SOURCE_FILES) {
  const abs = join(root, rel)
  if (!existsSync(abs)) fail(`缺少源文件 ${rel}`)
}

const sourcesDir = join(root, 'sources')
for (const name of readdirSync(sourcesDir)) {
  if (/^#U[0-9a-f]{4}/i.test(name)) {
    fail(`sources/ 存在转义替代文件名，应使用 UTF-8 中文名：${name}`)
  }
}

let parseOut
try {
  parseOut = execFileSync('node', ['scripts/parse-content.mjs'], { cwd: root, encoding: 'utf8' })
} catch (error) {
  fail(`parse-content 失败：${error.stderr || error.message}`)
}

let stats
try {
  const match = parseOut.trim().match(/\{[\s\S]*\}\s*$/)
  if (!match) throw new Error('no json')
  stats = JSON.parse(match[0])
} catch {
  fail('无法解析 parse-content 输出 JSON')
}

for (const [key, expected] of Object.entries(EXPECTED_PARSE)) {
  if (stats[key] !== expected) {
    fail(`${key} 期望 ${expected}，实际 ${stats[key]}`)
  }
}
if (stats.failures?.length) fail(`parse failures: ${JSON.stringify(stats.failures)}`)

const content = JSON.parse(readFileSync(join(root, 'src/data/generated/content.json'), 'utf8'))
if (content.meta.contentVersion !== EXPECTED_CONTENT_VERSION) {
  fail(`contentVersion 应为 ${EXPECTED_CONTENT_VERSION}`)
}
for (const key of ['A', 'B']) {
  if (content.meta.sourceHashes[key] !== EXPECTED_SOURCE_HASHES[key]) {
    fail(`sourceHash ${key} 与 V2.2.1 不一致`)
  }
}

console.log(
  JSON.stringify(
    {
      ok: true,
      sourceFiles: SOURCE_FILES,
      parse: stats,
      sourceHashes: content.meta.sourceHashes,
      contentVersion: content.meta.contentVersion,
    },
    null,
    2,
  ),
)
