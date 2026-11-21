import { randomBytes } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pluginProblem, type PluginHost } from '@protobase/schema/internal'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildPlugin, type PluginManifest } from '../../src/build/plugin-build'
import { builtHostOffer } from '../support/host-offer'

const root = path.resolve(__dirname, '../../../..')

// A default React import, JSX, @protobase/ui exports and the components and actions extension points.
const board = `import React from 'react'
import { Button, definePlugin } from '@protobase/ui'

export const Board = () => {
  const [count, setCount] = React.useState(0)
  return <><Button onClick={() => setCount(count + 1)}>{count}</Button><span>{React.version}</span></>
}

export default definePlugin({ actions: { count: () => undefined } })
`

describe("a plugin's plugin.json from a real build, against the app's own offer", () => {
  // Inside tests/apps/erp, so the plugin's @protobase/ui and react resolve.
  const pluginDir = path.join(root, 'tests/apps/erp', `.plugin-test-${randomBytes(4).toString('hex')}`)
  let manifest: PluginManifest
  let host: PluginHost

  beforeAll(async () => {
    await mkdir(pluginDir, { recursive: true })
    await writeFile(path.join(pluginDir, 'protobase.ui.tsx'), board)
    manifest = await buildPlugin({ pluginDir, outDir: path.join(pluginDir, 'dist') })
    host = await builtHostOffer()
  }, 120_000)

  afterAll(() => rm(pluginDir, { recursive: true, force: true }))

  it('records what the fixture uses, and the app has all of it', () => {
    expect(manifest.imports).toEqual({ '@protobase/ui': ['Button', 'definePlugin'], react: ['default'], 'react/jsx-runtime': ['Fragment', 'jsx', 'jsxs'] })
    expect(manifest.extensionPoints).toEqual(['components', 'actions'])
    expect(pluginProblem(manifest, host)).toBeUndefined()
  })

  it('is refused, naming it, once it uses a @protobase/ui name the app lacks', () => {
    const imports = { ...manifest.imports, '@protobase/ui': [...manifest.imports['@protobase/ui']!, 'NotInThisApp'] }
    expect(pluginProblem({ ...manifest, imports }, host)).toBe('it uses what this app does not have: NotInThisApp from @protobase/ui')
  })
})
