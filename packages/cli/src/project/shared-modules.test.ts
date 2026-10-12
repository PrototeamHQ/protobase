import { describe, expect, it } from 'vitest'
import { uiEntry } from './admin-app'
import { entryName, facadeCode, facadeId, importMapTag, sharedModules } from './shared-modules'

describe('sharedModules', () => {
  it('are React, its JSX runtime, React DOM and @protobase/ui: changing them changes the plugin API', () => {
    expect(sharedModules).toEqual(['react', 'react/jsx-runtime', 'react-dom', '@protobase/ui'])
  })

  it('each has an entry named after it and a virtual facade', () => {
    expect(sharedModules.map(entryName)).toEqual(['shared-react', 'shared-react-jsx-runtime', 'shared-react-dom', 'shared-protobase-ui'])
    expect(facadeId('react')).toBe('\0protobase-shared:react')
  })
})

describe('facadeCode', () => {
  it('exports each name of a CommonJS package by name, beside its default', () => {
    const code = facadeCode('react')
    expect(code).toMatch(/^import m from "react"\nexport default m\nexport const \{ .+ \} = m\n$/)
    expect(code).toContain(' useState,')
    expect(code).toContain(' createContext,')
    expect(facadeCode('react/jsx-runtime')).toContain('export const { Fragment, jsx, jsxs } = m')
    expect(facadeCode('react-dom')).toContain(' createPortal,')
  })

  it('leaves out names that are not identifiers, and the default', () => {
    const require = (() => ({ default: 1, valid: 2, 'not-valid': 3, $ok: 4 })) as unknown as NodeJS.Require
    expect(facadeCode('react', require)).toBe('import m from "react"\nexport default m\nexport const { valid, $ok } = m\n')
  })

  it('re-exports the @protobase/ui entry the app is built from', () => {
    expect(facadeCode('@protobase/ui')).toBe(`export * from ${JSON.stringify(uiEntry)}\n`)
  })
})

it('importMapTag: the import map as the first tag of <head>', () => {
  expect(importMapTag({ react: '/assets/shared-react-abc.js' })).toEqual({
    tag: 'script',
    attrs: { type: 'importmap' },
    children: '{"imports":{"react":"/assets/shared-react-abc.js"}}',
    injectTo: 'head-prepend',
  })
})
