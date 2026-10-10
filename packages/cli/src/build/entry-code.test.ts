import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { bundleEntryCode } from './entry-code'

describe('bundleEntryCode', () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'protobase-entry-'))
  })
  afterEach(() => rm(dir, { recursive: true, force: true }))

  const touch = async (file: string) => {
    await mkdir(path.dirname(path.join(dir, file)), { recursive: true })
    await writeFile(path.join(dir, file), '')
  }

  it('imports config/index.ts and every config/*/ui.ts, in a stable order', async () => {
    await Promise.all(['config/index.ts', 'config/orders/ui.ts', 'config/customers/ui.ts', 'config/customers/data.ts', 'config/lines/data.ts'].map(touch))
    const code = bundleEntryCode(dir)
    expect(code).toContain('const project = {}')
    expect(code).toContain(`import * as index from ${JSON.stringify(path.join(dir, 'config/index.ts'))}`)
    expect(code).toContain('conventionConfig(index, [["customers", ui0], ["orders", ui1]])')
    expect(code).not.toContain('lines')
    expect(code).toContain(`export default mergeConfig(named({ ...project, config: project.config ?? convention }, "config/index.ts"))`)
  })

  it('starts from protobase.config.ts and keeps the convention as the fallback for config', async () => {
    await Promise.all(['protobase.config.ts', 'config/index.ts'].map(touch))
    const code = bundleEntryCode(dir)
    expect(code).toContain(`import * as custom from ${JSON.stringify(path.join(dir, 'protobase.config.ts'))}`)
    expect(code).toContain('const project = custom.default ?? {}')
    expect(code).toContain('conventionConfig(index, [])')
  })

  it('takes protobase.config.ts alone when there is no config folder', async () => {
    await touch('protobase.config.ts')
    const code = bundleEntryCode(dir)
    expect(code).toContain('const convention = undefined')
    expect(code).not.toContain('conventionConfig')
  })

  it('merges the extensions’ configs first, each named by its file unless it has a name', async () => {
    await Promise.all(['protobase.config.ts', 'ext-a/protobase.config.ts', 'ext-b/protobase.ui.tsx'].map(touch))
    const extensions = [{ dir: path.join(dir, 'ext-a'), config: path.join(dir, 'ext-a/protobase.config.ts') }, { dir: path.join(dir, 'ext-b'), ui: path.join(dir, 'ext-b/protobase.ui.tsx') }]
    const code = bundleEntryCode(dir, extensions)
    const a = JSON.stringify(path.join(dir, 'ext-a/protobase.config.ts'))
    expect(code).toContain(`import * as extension0 from ${a}`)
    expect(code).not.toContain('ext-b')
    expect(code).toContain(`export default mergeConfig(named(extension0.default ?? {}, ${a}), named({ ...project, config: project.config ?? convention }, "protobase.config.ts"))`)
  })

  it('refuses a folder that is not a project', () => {
    expect(() => bundleEntryCode(dir)).toThrow(`No protobase.config.ts or config/index.ts in ${dir}`)
  })
})
