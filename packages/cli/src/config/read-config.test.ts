import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { importProjectFiles } from '../project/import-project-file'
import { projectJobs, projectOptions } from './project-parts'
import { configFileOf, readConfigFile } from './read-config'
import { loadSourceConfig } from './source-config'

const root = path.resolve(__dirname, '../../../..')
const configEnv = (env: Record<string, string> = {}) => ({ command: 'tool' as const, env, root: '.' })

describe('reading a config', () => {
  let dir = ''
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'protobase-config-'))
  })
  afterEach(() => rm(dir, { recursive: true, force: true }))

  const write = async (files: Record<string, string>) => {
    for (const [file, text] of Object.entries(files)) {
      await mkdir(path.dirname(path.join(dir, file)), { recursive: true })
      await writeFile(path.join(dir, file), text)
    }
  }

  it('reads a TypeScript config, with the values it imports and the environment it branches on', async () => {
    await write({
      'protobase.config.ts': "import { roles } from './roles'\nexport default ({ env }: { env: Record<string, string | undefined> }) => ({ auth: { baseURL: env.URL ?? 'http://x', roles } })\n",
      'roles.ts': "export const roles = ['admin', 'sales']\n",
    })
    expect(await readConfigFile(path.join(dir, 'protobase.config.ts'), configEnv({ URL: 'https://shop.example.com' }), importProjectFiles)).toEqual({ auth: { baseURL: 'https://shop.example.com', roles: ['admin', 'sales'] } })
  })

  it('refuses a config that loads a part of itself later', async () => {
    await write({ 'protobase.config.ts': "export default { jobs: () => import('./jobs') }\n" })
    await expect(readConfigFile(path.join(dir, 'protobase.config.ts'), configEnv(), importProjectFiles)).rejects.toThrow('protobase.config.ts imports "./jobs" lazily; a config is one object')
  })

  it('reads a JSON config, with the values it takes from the environment', async () => {
    await write({ 'protobase.config.json': JSON.stringify({ auth: { baseURL: { $env: 'URL', default: 'http://localhost:5173' }, secret: { $env: 'SECRET' }, trustedOrigins: { $env: 'ORIGINS', split: ',' } } }) })
    const file = path.join(dir, 'protobase.config.json')
    expect(await readConfigFile(file, configEnv({ SECRET: 's', ORIGINS: 'https://a.example,https://b.example' }), importProjectFiles)).toEqual({
      auth: { baseURL: 'http://localhost:5173', secret: 's', trustedOrigins: ['https://a.example', 'https://b.example'] },
    })
    expect(await readConfigFile(file, configEnv(), importProjectFiles)).toEqual({ auth: { baseURL: 'http://localhost:5173' } })
  })

  it('leaves out the $schema an editor checks a JSON config with', async () => {
    await write({ 'protobase.config.json': JSON.stringify({ $schema: './node_modules/@protobase/config/schema.json', timezone: 'Europe/Amsterdam' }) })
    expect(await readConfigFile(path.join(dir, 'protobase.config.json'), configEnv(), importProjectFiles)).toEqual({ timezone: 'Europe/Amsterdam' })
  })

  it('takes the one config file, and refuses a project with both', async () => {
    await write({ 'protobase.config.json': '{}' })
    expect(configFileOf(dir)).toBe(path.join(dir, 'protobase.config.json'))
    await write({ 'protobase.config.ts': 'export default {}\n' })
    expect(() => configFileOf(dir)).toThrow('has both protobase.config.ts and protobase.config.json; a project has one config file, so remove one of them')
  })

  it('finds the code of declared jobs and write hooks by their paths, and names the file one lacks', async () => {
    await write({
      'protobase.config.json': JSON.stringify({ jobs: { 'send-invoice': { arguments: { invoiceId: 'integer' } } }, writeHooks: ['audit-sales'] }),
      'jobs/send-invoice.ts': 'export default async () => {}\n',
      'hooks/audit-sales.ts': 'export default async () => {}\n',
    })
    const config = await loadSourceConfig(dir, { command: 'tool' })
    const [job] = projectJobs(config)
    expect(job!.name).toBe('send-invoice')
    const validate = job!.options.payload!['~standard'].validate
    expect(await validate({ invoiceId: 7 })).toEqual({ value: { invoiceId: 7 } })
    expect((await validate({ invoiceId: '7' })).issues).toEqual([expect.objectContaining({ path: ['invoiceId'] })])
    expect((await validate({ invoiceId: 7, other: 1 })).issues).toHaveLength(1)
    expect((await projectOptions(config))?.writeHooks).toHaveLength(1)
    await write({ 'protobase.config.json': JSON.stringify({ jobs: { 'remind-overdue': {} } }) })
    const missing = await loadSourceConfig(dir, { command: 'tool' })
    expect(() => projectJobs(missing)).toThrow('The job "remind-overdue" of protobase.config.json has no jobs/remind-overdue.ts')
  })

  it("describes the ERP alike from its protobase.config.ts and from the same as JSON, tests/fixtures/erp-json", async () => {
    const env = { PROTOBASE_URL: 'https://erp.example.com', PROTOBASE_SECRET: 'secret', PROTOBASE_TRUSTED_ORIGINS: 'https://a.example,https://b.example' }
    const before = { ...process.env }
    Object.assign(process.env, env)
    try {
      await write({ 'protobase.config.json': await readFile(path.join(root, 'packages/cli/tests/fixtures/erp-json/protobase.config.json'), 'utf8') })
      // What the config says, apart from the folders its code is found in.
      const described = async (folder: string) => {
        const { sources: _, authFiles: __, jobs, writeHooks, ...data } = await loadSourceConfig(folder, { command: 'serve' })
        return { ...data, jobs: Object.fromEntries(Object.entries(jobs).map(([name, { declaration }]) => [name, declaration])), writeHooks: writeHooks.map(({ name }) => name) }
      }
      const json = await described(dir)
      expect(json).toEqual(await described(path.join(root, 'tests/apps/erp')))
      expect(json).toMatchObject({ url: 'https://erp.example.com', secret: 'secret', auth: { trustedOrigins: ['https://a.example', 'https://b.example'] } })
    } finally {
      for (const key of Object.keys(env)) if (!(key in before)) delete process.env[key]
    }
  })
})
