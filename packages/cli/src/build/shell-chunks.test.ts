import { createRequire } from 'node:module'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { uiEntry } from '../project/admin-app'
import { isAppModule, isLibModule, isReactModule, isWorkflowsModule, libChunkName, npmPackage } from './shell-chunks'

const bun = (name: string, file: string) => `/app/node_modules/.bun/${name.replace('/', '+')}@1.0.0/node_modules/${name}/${file}`

describe('npmPackage', () => {
  it("names the package of an npm or Bun install path, scoped or not, and none for the app's own modules", () => {
    expect(npmPackage('/app/node_modules/react-dom/cjs/react-dom.production.js')).toBe('react-dom')
    expect(npmPackage(bun('react-dom', 'cjs/react-dom.production.js'))).toBe('react-dom')
    expect(npmPackage('/app/node_modules/@tanstack/react-query/build/index.js')).toBe('@tanstack/react-query')
    expect(npmPackage(bun('@tanstack/react-query', 'build/index.js'))).toBe('@tanstack/react-query')
    expect(npmPackage('C:\\app\\node_modules\\@tanstack\\react-query\\build\\index.js')).toBe('@tanstack/react-query')
    expect(npmPackage('/app/packages/ui/src/app/main.tsx')).toBeUndefined()
  })
})

describe('libChunkName', () => {
  it("names a lazily loaded package's chunk after the package, without @ or slash", () => {
    expect(libChunkName(bun('@xyflow/react', 'dist/esm/index.js'))).toBe('lib-xyflow-react')
    expect(libChunkName('/app/node_modules/maplibre-gl/dist/maplibre-gl.js')).toBe('lib-maplibre-gl')
  })
})

describe('the shell chunk groups', () => {
  it('put React, React DOM and the scheduler in react, from either install layout', () => {
    for (const id of [bun('react', 'index.js'), '/app/node_modules/react-dom/client.js', bun('scheduler', 'index.js')]) {
      expect(isReactModule(id)).toBe(true)
      expect(isLibModule(id)).toBe(false)
    }
  })

  it("put the other third-party modules in vendor or their package's chunk, but the icons", () => {
    expect(isLibModule(bun('@tanstack/react-query', 'build/index.js'))).toBe(true)
    expect(isLibModule('/app/node_modules/clsx/dist/clsx.mjs')).toBe(true)
    expect(isLibModule(bun('lucide-react', 'dist/esm/icons/map.js'))).toBe(false)
    expect(isReactModule(bun('react-router', 'index.js'))).toBe(false)
  })

  it("put the workflow engine's modules in workflows, from its folder only", () => {
    expect(isWorkflowsModule('/app/packages/workflows/src/definition/reads.ts', '/app/packages/workflows')).toBe(true)
    expect(isWorkflowsModule('/app/packages/workflows-ui/src/index.ts', '/app/packages/workflows')).toBe(false)
    expect(isWorkflowsModule('/app/packages/ui/src/app/field-types/workflow/flow-nodes.tsx', '/app/packages/workflows')).toBe(false)
    // On Windows the folder comes with backslashes, and Vite's ids with forward slashes
    expect(isWorkflowsModule('C:/app/packages/workflows/src/definition/reads.ts', 'C:\\app\\packages\\workflows')).toBe(true)
    expect(isWorkflowsModule('C:/app/packages/workflows-ui/src/index.ts', 'C:\\app\\packages\\workflows')).toBe(false)
  })

  it("leave the app's own modules to app", () => {
    expect(isReactModule('/app/packages/ui/src/app/main.tsx')).toBe(false)
    expect(isLibModule('/app/packages/ui/src/app/main.tsx')).toBe(false)
    expect(isAppModule('/app/packages/ui/src/app/main.tsx')).toBe(true)
  })

  it('put in app no third-party module, virtual module, page, stylesheet or workflow engine module', () => {
    expect(isAppModule(bun('@tanstack/react-query', 'build/index.js'))).toBe(false)
    expect(isAppModule('\0vite/preload-helper.js')).toBe(false)
    expect(isAppModule('/app/packages/ui/src/styles.css')).toBe(false)
    expect(isAppModule('/app/packages/ui/src/app/index.html')).toBe(false)
    expect(isAppModule(path.resolve(path.dirname(createRequire(uiEntry).resolve('@protobase/workflows')), 'definition/reads.ts'))).toBe(false)
  })
})
