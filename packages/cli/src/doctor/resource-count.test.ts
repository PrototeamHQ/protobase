import { describe, expect, it } from 'vitest'
import { checkResourceCount } from './resource-count'

describe('checkResourceCount', () => {
  it('accepts an app with resources, and one that says it has none and exports none', () => {
    expect(() => checkResourceCount(3, undefined, 'config/index.ts')).not.toThrow()
    expect(() => checkResourceCount(0, 'none', 'config/index.ts')).not.toThrow()
  })

  it('refuses an app with no resources that does not say it has none', () => {
    expect(() => checkResourceCount(0, undefined, 'config/index.ts')).toThrow("No resources exported from config/index.ts; an app with none on purpose says so with resources: 'none' in its config")
  })

  it('refuses an app that says it has none but exports some', () => {
    expect(() => checkResourceCount(1, 'none', 'config/index.ts')).toThrow("config/index.ts exports a resource, but the config says the app has none (resources: 'none'): remove that key, or the resources")
    expect(() => checkResourceCount(2, 'none', 'config/index.ts')).toThrow(/exports 2 resources/)
  })
})
