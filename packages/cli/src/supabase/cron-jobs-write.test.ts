import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cronJobFilesInTheWay, writeCronJobs } from './cron-jobs-write'

const purge = { name: 'purge', file: 'purge', exportName: 'purge', timezone: undefined, schedule: '0 3 * * *', command: 'delete from public.todos' }

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'cron-jobs-'))
})
afterEach(() => rm(dir, { recursive: true, force: true }))

describe('writeCronJobs', () => {
  it("writes each job's module, exports it from jobs/index.ts and passes them as the config's jobs", async () => {
    await mkdir(path.join(dir, 'jobs'))
    await writeFile(path.join(dir, 'jobs', 'index.ts'), "export { mine } from './mine'\n")
    await writeFile(path.join(dir, 'protobase.config.ts'), "import * as config from './config'\n\nexport default { config }\n")
    expect(await writeCronJobs(dir, [purge])).toBe(true)
    expect(await readFile(path.join(dir, 'jobs', 'purge.ts'), 'utf8')).toContain("name: 'purge',")
    expect(await readFile(path.join(dir, 'jobs', 'index.ts'), 'utf8')).toBe("export { mine } from './mine'\nexport { purge } from './purge'\n")
    expect(await readFile(path.join(dir, 'protobase.config.ts'), 'utf8')).toBe("import * as config from './config'\nimport * as jobs from './jobs'\n\nexport default { config, jobs }\n")
    expect(cronJobFilesInTheWay(dir, [purge])).toEqual([path.join(dir, 'jobs', 'purge.ts')])
  })

  it('says so when the config has jobs of its own, and writes nothing without jobs', async () => {
    await writeFile(path.join(dir, 'protobase.config.ts'), "import * as jobs from './config/jobs'\n\nexport default { jobs }\n")
    expect(await writeCronJobs(dir, [purge])).toBe(false)
    expect(await writeCronJobs(dir, [])).toBe(true)
  })
})
