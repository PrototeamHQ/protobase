import { describe, expect, it } from 'vitest'
import { configWithJobs } from './config-jobs'

const purge = "'purge': { schedule: '0 3 * * *' }"

describe('configWithJobs', () => {
  it('writes a config that declares the jobs, with the convention for the rest, when there is none', () => {
    expect(configWithJobs(undefined, ['purge'], [purge])).toBe(`import { defineConfig } from '@protobase/config'\n\nexport default defineConfig({\n  jobs: {\n    ${purge},\n  },\n})\n`)
  })

  it('adds a jobs key to the object the config exports, its function returns or defineConfig takes', () => {
    expect(configWithJobs("export default { timezone: 'UTC' }\n", ['purge'], [purge])).toBe(`export default { timezone: 'UTC', jobs: { ${purge} } }\n`)
    expect(configWithJobs("export default defineConfig(({ env }) => ({ name: env.NAME }))\n", ['purge'], [purge])).toBe(`export default defineConfig(({ env }) => ({ name: env.NAME, jobs: { ${purge} } }))\n`)
    expect(configWithJobs('export default {}\n', ['purge'], [purge])).toBe(`export default { jobs: { ${purge} } }\n`)
  })

  it('adds the declarations to the jobs it declares already, on lines of their own when it spans lines', () => {
    const text = "export default defineConfig({\n  jobs: {\n    'send-invoice': { arguments: { invoiceId: 'integer' } },\n  },\n})\n"
    expect(configWithJobs(text, ['purge'], [purge])).toBe(`export default defineConfig({\n  jobs: {\n    'send-invoice': { arguments: { invoiceId: 'integer' } },\n    ${purge},\n  },\n})\n`)
  })

  it('gives up on a config it cannot see, jobs it cannot add to, or a job it declares already', () => {
    expect(configWithJobs("import project from './project'\n\nexport default project\n", ['purge'], [purge])).toBeUndefined()
    expect(configWithJobs('export default { jobs: shared }\n', ['purge'], [purge])).toBeUndefined()
    expect(configWithJobs("export default { jobs: { 'purge': {} } }\n", ['purge'], [purge])).toBeUndefined()
  })
})
