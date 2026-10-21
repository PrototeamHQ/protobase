import { readFile } from 'node:fs/promises'
import { expect } from 'vitest'

/** Checks that the script at `file` ends with a debug id, names no map, and has a map beside it carrying the same id. */
export const expectDebugIdMap = async (file: string) => {
  const code = await readFile(file, 'utf8')
  const debugId = /\/\/# debugId=([\da-f-]{36})\s*$/.exec(code)?.[1]
  expect(debugId).toBeDefined()
  expect(code).not.toContain('sourceMappingURL')
  const map = JSON.parse(await readFile(`${file}.map`, 'utf8')) as { debugId?: string; sources: string[] }
  expect(map.debugId).toBe(debugId)
  expect(map.sources.length).toBeGreaterThan(0)
}
