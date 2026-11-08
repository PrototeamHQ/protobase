import { describe, expect, it } from 'vitest'
import { isStoredPath, storedPathLength } from './stored-path'

describe('isStoredPath', () => {
  it('takes relative paths of plain segments', () => {
    for (const path of ['report.pdf', 'in/2026/report.pdf', 'runs/a1-b2_c3/file', 'a.b.c']) expect(isStoredPath(path), path).toBe(true)
  })

  it('refuses whatever could leave the folder or reach a hidden one, before any store is touched', () => {
    for (const path of ['', '/abs', '/etc/passwd', '../../etc/passwd', 'a/../b', '..', '.', './a', 'a/./b', '..%2f..', '%2e%2e/x', 'a\0b', 'a\\b', 'a//b', 'a/', '.tmp/x', '.cleanup/x', 'a/.hidden', 'a b', 'C:/x', 'x'.repeat(storedPathLength + 1), 42, null]) {
      expect(isStoredPath(path), String(path)).toBe(false)
    }
  })
})
