import { existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { content } from '../src/content'
import baseline from '../scripts/content-baseline.json'

const SOURCE_FILES = baseline.sourceFiles
const EXPECTED_PARSE = baseline.parse
const EXPECTED_SOURCE_HASHES = baseline.sourceHashes
const EXPECTED_CONTENT_VERSION = baseline.contentVersion

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

describe('package baseline', () => {
  it('keeps UTF-8 source markdown paths on disk', () => {
    for (const rel of SOURCE_FILES) {
      expect(existsSync(join(root, rel))).toBe(true)
    }
    const escaped = readdirSync(join(root, 'sources')).filter((name) => /^#U/i.test(name))
    expect(escaped).toEqual([])
  })

  it('matches frozen parse counts and source hashes', () => {
    expect(content.items).toHaveLength(EXPECTED_PARSE.items)
    expect(content.items.filter((item) => item.coreA)).toHaveLength(EXPECTED_PARSE.aCore)
    expect(content.items.filter((item) => item.appendixFullAnswer)).toHaveLength(EXPECTED_PARSE.aApp)
    expect(content.items.filter((item) => item.fullTextForLookup && item.chapter.startsWith('第九章'))).toHaveLength(
      EXPECTED_PARSE.b9,
    )
    expect(content.items.filter((item) => item.fullTextForLookup && item.chapter.startsWith('第十章'))).toHaveLength(
      EXPECTED_PARSE.b10,
    )
    expect(content.relations).toHaveLength(EXPECTED_PARSE.relations)
    expect(content.relations.filter((r) => r.status === 'confirmed-by-source')).toHaveLength(EXPECTED_PARSE.confirmed)
    expect(content.meta.contentVersion).toBe(EXPECTED_CONTENT_VERSION)
    expect(content.meta.sourceHashes).toEqual(EXPECTED_SOURCE_HASHES)
  })
})
