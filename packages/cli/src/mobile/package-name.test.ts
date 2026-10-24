import { describe, expect, it } from 'vitest'
import { packageNameProblem } from './package-name'

describe('packageNameProblem', () => {
  it('accepts a name and a scoped name', () => {
    for (const name of ['x', '@s/x', 'a.b-c_d', 'JSONStream', '@capacitor/camera']) expect(packageNameProblem(name)).toBeUndefined()
  })

  it('refuses a name that is not one folder in node_modules, naming it', () => {
    for (const name of ['', '.', '..', '../x', '/tmp/x', 'a/b', 'a\\..\\..', 'C:\\x', '@s', '@s/', '@s/.', '@s/..', '@../x', '@./x', '@s/a/b', '.x', '_x', 'a b']) {
      expect(packageNameProblem(name)).toBe(`mobile.plugins lists ${JSON.stringify(name)}, which is not an npm package name such as my-plugin or @scope/my-plugin`)
    }
  })

  it('says where the name is listed', () => {
    expect(packageNameProblem('..', '/plugin/package.json')).toMatch(/^\/plugin\/package\.json lists "\.\."/)
  })
})
