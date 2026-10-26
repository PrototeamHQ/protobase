import { describe, expect, it } from 'vitest'
import { projectResources } from '../config/project-parts'
import { bundledConfig, bundleModule } from './load-bundle'

const things = { name: 'things' }
const files = (resources?: Record<string, unknown>) => ({ ...(resources && { resources: async () => resources }), functions: {}, modules: {} })
const module = (config: unknown, extensions: unknown[] = []) => ({ own: { config, label: 'protobase.config.ts', files: files({ things }) }, extensions, packages: {} })

describe('bundleModule', () => {
  it('accepts the config module protobase build writes, and refuses any other', () => {
    const bundle = module({})
    expect(bundleModule(bundle, 'bundle.js')).toBe(bundle)
    expect(() => bundleModule({ default: {} }, 'bundle.js')).toThrow('bundle.js is not a config module of `protobase build`; build the project again')
  })
})

describe('bundledConfig', () => {
  it('reads the config again with the environment where it serves, and fills in the defaults', async () => {
    process.env.PROTOBASE_BUNDLE_TEST = 'nl'
    process.env.PROTOBASE_URL = 'https://shop.example.com'
    const bundle = bundleModule(module(({ env, command }: { env: Record<string, string>; command: string }) => ({ name: command, locale: env.PROTOBASE_BUNDLE_TEST })), 'bundle.js')
    const config = await bundledConfig(bundle, 'serve', '/srv/app')
    expect(config).toMatchObject({ name: 'serve', locale: 'nl', url: 'https://shop.example.com', auth: {} })
    expect(await projectResources(config)).toEqual({ things })
    delete process.env.PROTOBASE_BUNDLE_TEST
    delete process.env.PROTOBASE_URL
  })

  it('merges the extensions first, each named by its file', async () => {
    const extension = { config: {}, label: 'ext/protobase.config.ts', files: files({ theirs: { name: 'other' } }) }
    expect(Object.keys(await projectResources(await bundledConfig(bundleModule(module({}, [extension]), 'bundle.js'), 'serve', '/srv/app')))).toEqual(['ext/protobase.config.ts:theirs', 'things'])
  })

  it("accepts the default apiPath and refuses another, which the bundle's UI and manifest do not reach", async () => {
    await expect(bundledConfig(bundleModule(module({ apiPath: '/api/v1' }), 'bundle.js'), 'serve', '/')).resolves.toBeDefined()
    await expect(bundledConfig(bundleModule(module({ apiPath: '/admin/v1' }), 'bundle.js'), 'serve', '/')).rejects.toThrow(
      'apiPath is "/admin/v1"; a bundle\'s UI and manifest expect the API at /api/v1',
    )
  })
})
