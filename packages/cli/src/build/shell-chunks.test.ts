import { describe, expect, it } from 'vitest'
import { isReactModule, isVendorModule, npmPackage } from './shell-chunks'

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

describe('the shell chunk groups', () => {
  it('put React, React DOM and the scheduler in react, from either install layout', () => {
    for (const id of [bun('react', 'index.js'), '/app/node_modules/react-dom/client.js', bun('scheduler', 'index.js')]) {
      expect(isReactModule(id)).toBe(true)
      expect(isVendorModule(id)).toBe(false)
    }
  })

  it('put the other third-party modules in vendor, but the icons', () => {
    expect(isVendorModule(bun('@tanstack/react-query', 'build/index.js'))).toBe(true)
    expect(isVendorModule('/app/node_modules/clsx/dist/clsx.mjs')).toBe(true)
    expect(isVendorModule(bun('lucide-react', 'dist/esm/icons/map.js'))).toBe(false)
    expect(isReactModule(bun('react-router', 'index.js'))).toBe(false)
  })

  it("leave the app's own modules to app", () => {
    expect(isReactModule('/app/packages/ui/src/app/main.tsx')).toBe(false)
    expect(isVendorModule('/app/packages/ui/src/app/main.tsx')).toBe(false)
  })
})
