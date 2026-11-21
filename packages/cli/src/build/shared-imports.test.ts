import { describe, expect, it } from 'vitest'
import { sharedImports } from './shared-imports'

const chunk = (code: string, dynamicImports: string[] = []) => ({ code, dynamicImports })

describe('sharedImports', () => {
  it('takes the names each chunk imports or re-exports from the shared modules, once each and sorted', () => {
    const entry = chunk(`import { usePlugin as u, definePlugin } from '@protobase/ui'\nimport { jsx } from 'react/jsx-runtime'\nimport './assets/x.js'\nexport { Button } from '@protobase/ui'\n`)
    const other = chunk(`import React, { useState } from 'react'\nimport { definePlugin } from '@protobase/ui'\nimport { jsx, jsxs } from 'react/jsx-runtime'\n`)
    expect(sharedImports([entry, other])).toEqual({ '@protobase/ui': ['Button', 'definePlugin', 'usePlugin'], react: ['default', 'useState'], 'react/jsx-runtime': ['jsx', 'jsxs'] })
  })

  it('takes a whole module imported with import * as, export * or import()', () => {
    expect(sharedImports([chunk(`import * as ui from '@protobase/ui'\nexport * from 'react'\nconst dom = () => import('react-dom')\n`, ['react-dom'])])).toEqual({ '@protobase/ui': ['*'], react: ['*'], 'react-dom': ['*'] })
  })

  it("leaves out the plugin's own chunks and anything not shared", () => {
    expect(sharedImports([chunk(`import { a } from './index-abc.js'\nimport { b } from 'other'\n`, ['./lazy.js'])])).toEqual({})
  })
})
