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
  const at = (file: string) => JSON.stringify(path.join(dir, file))

  it('references config/index.ts and every config/*/ui.ts, in a stable order, without a config file', async () => {
    await Promise.all(['config/index.ts', 'config/orders/ui.ts', 'config/customers/ui.ts', 'config/customers/data.ts', 'config/lines/data.ts'].map(touch))
    const code = bundleEntryCode(dir)
    expect(code).toContain('const config = {}')
    expect(code).toContain(`conventionConfig(await import(${at('config/index.ts')}), [["customers", await import(${at('config/customers/ui.ts')})], ["orders", await import(${at('config/orders/ui.ts')})]], [])`)
    expect(code).not.toContain('lines')
    expect(code).toContain('export const extensions = []')
  })

  it('carries protobase.config.ts as a module, or protobase.config.json as its object', async () => {
    await touch('protobase.config.ts')
    expect(bundleEntryCode(dir)).toContain(`import * as configModule from ${at('protobase.config.ts')}\nconst config = configModule.default`)
    await rm(path.join(dir, 'protobase.config.ts'))
    await touch('protobase.config.json')
    expect(bundleEntryCode(dir)).toContain(`import config from ${at('protobase.config.json')}`)
  })

  it('references the files the conventions find: jobs, hooks, the auth hooks and authenticator, and the roles', async () => {
    await Promise.all(['protobase.config.ts', 'jobs/send-invoice.ts', 'jobs/send-invoice.test.ts', 'hooks/audit.ts', 'auth/hooks.ts', 'config/roles.ts'].map(touch))
    const code = bundleEntryCode(dir)
    for (const file of ['jobs/send-invoice.ts', 'hooks/audit.ts', 'auth/hooks.ts', 'config/roles.ts']) expect(code).toContain(`${JSON.stringify(file)}: () => import(${at(file)})`)
    expect(code).not.toContain('send-invoice.test')
    expect(code).not.toContain('resources:')
  })

  it("carries the extensions' configs, each with its own folder's files, and the packages the config names", async () => {
    await Promise.all(['protobase.config.ts', 'ext-a/protobase.config.ts', 'ext-a/jobs/sync.ts', 'ext-b/protobase.ui.tsx'].map(touch))
    const extensions = [{ dir: path.join(dir, 'ext-a'), config: path.join(dir, 'ext-a/protobase.config.ts') }, { dir: path.join(dir, 'ext-b'), ui: path.join(dir, 'ext-b/protobase.ui.tsx') }]
    const code = bundleEntryCode(dir, extensions, ['sharp'])
    expect(code).toContain(`import * as extension0Module from ${at('ext-a/protobase.config.ts')}`)
    expect(code).toContain(`"jobs/sync.ts": () => import(${at('ext-a/jobs/sync.ts')})`)
    expect(code).not.toContain('ext-b')
    expect(code).toContain('export const packages = { "sharp": () => import("sharp") }')
  })

  it('references one function per file in ./functions', async () => {
    await Promise.all(['config/index.ts', 'functions/hello.ts', 'functions/stripe-webhook/index.ts', 'functions/_shared/cors.ts'].map(touch))
    expect(bundleEntryCode(dir)).toContain(`functions: { "hello": () => import(${at('functions/hello.ts')}), "stripe-webhook": () => import(${at('functions/stripe-webhook/index.ts')}) }`)
    expect(bundleEntryCode(dir)).not.toContain('_shared')
  })

  it('refuses a folder that is not a project', () => {
    expect(() => bundleEntryCode(dir)).toThrow(`No protobase.config.ts, protobase.config.json or config/index.ts in ${dir}`)
  })
})
