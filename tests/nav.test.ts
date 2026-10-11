import { describe, expect, it } from 'vitest'
import { NAV } from '../src/nav'

describe('navigation', () => {
  it('includes methodology after today', () => {
    expect(NAV.map((row) => row.id)).toEqual([
      'today',
      'method',
      'recall',
      'exam',
      'library',
      'mistakes',
      'archive',
      'settings',
    ])
    expect(NAV[1]?.label).toBe('方法论')
  })
})
