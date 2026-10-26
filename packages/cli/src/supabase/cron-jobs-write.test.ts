import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cronJobFilesInTheWay, writeCronJobs } from './cron-jobs-write'

const purge = { name: 'purge', file: 'purge', timezone: undefined, schedule: '0 3 * * *', command: 'delete from public.todos' }
const declaration = "'purge': { description: 'pg_cron\\'s job purge, imported from Supabase.', schedule: '0 3 * * *', maxAttempts: 1 }"

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'cron-jobs-'))
})
afterEach(() => rm(dir, { recursive: true, force: true }))

describe('writeCronJobs', () => {
  it("writes each job's run in jobs/ and declares the jobs in the config", async () => {
    await writeFile(path.join(dir, 'protobase.config.ts'), "export default { timezone: 'UTC' }\n")
    expect(await writeCronJobs(dir, [purge])).toBe(true)
    expect(await readFile(path.join(dir, 'jobs', 'purge.ts'), 'utf8')).toContain('export default (async (_, { db }) => {')
    expect(await readFile(path.join(dir, 'protobase.config.ts'), 'utf8')).toBe(`export default { timezone: 'UTC', jobs: { ${declaration} } }\n`)
    expect(cronJobFilesInTheWay(dir, [purge])).toEqual([path.join(dir, 'jobs', 'purge.ts')])
  })

  it('says so when it cannot declare them, and writes nothing without jobs', async () => {
    await writeFile(path.join(dir, 'protobase.config.ts'), "import config from './config.json'\nexport default config\n")
    expect(await writeCronJobs(dir, [purge])).toBe(false)
    expect(await writeCronJobs(dir, [])).toBe(true)
  })
})
