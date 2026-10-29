import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { conventionModules } from './project-files'

describe('conventionModules', () => {
  let dir = ''
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('carries the assistant and MCP tool files a project has', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'protobase-conventions-'))
    for (const file of ['assistant/tools.ts', 'mcp/tools.ts', 'mcp/notes.md']) {
      await mkdir(path.dirname(path.join(dir, file)), { recursive: true })
      await writeFile(path.join(dir, file), 'export default []\n')
    }
    expect(conventionModules(dir)).toEqual(['assistant/tools.ts', 'mcp/tools.ts'])
  })
})
