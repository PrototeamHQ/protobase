import { describe, expect, it } from 'vitest'
import { configWithJobs } from './config-jobs'

describe('configWithJobs', () => {
  it('writes a config passing the jobs when the project has none', () => {
    expect(configWithJobs(undefined)).toBe("import * as jobs from './jobs'\n\nexport default { jobs }\n")
  })

  it('adds the jobs to the object a config exports, written out or passed to defineConfig', () => {
    expect(configWithJobs("import * as config from './config'\n\nexport default { config }\n")).toBe("import * as config from './config'\nimport * as jobs from './jobs'\n\nexport default { config, jobs }\n")
    expect(configWithJobs("import { defineConfig } from '@protobase/server'\n\nexport default defineConfig({ config: {} })\n")).toBe(
      "import { defineConfig } from '@protobase/server'\nimport * as jobs from './jobs'\n\nexport default defineConfig({ config: {}, jobs })\n",
    )
  })

  it('fills an empty object, and imports first in a config without imports', () => {
    expect(configWithJobs('export default {}\n')).toBe("import * as jobs from './jobs'\n\nexport default { jobs }\n")
  })

  it('leaves a config that imports the jobs already as it is', () => {
    const text = "import * as jobs from './jobs'\n\nexport default { jobs }\n"
    expect(configWithJobs(text)).toBe(text)
  })

  it('gives up on a config with jobs of its own, or no object it can see', () => {
    expect(configWithJobs("import * as jobs from './config/jobs'\n\nexport default { jobs }\n")).toBeUndefined()
    expect(configWithJobs("import project from './project'\n\nexport default project\n")).toBeUndefined()
  })
})
