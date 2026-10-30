import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { pdfkitFonts } from './pdfkit-fonts'

// pdfkit as React PDF's renderer, a dependency of @protobase/server, has it: its CommonJS build sits beside the Node one.
const fromServer = createRequire(import.meta.resolve('@protobase/server'))
const renderer = createRequire(fromServer.resolve('@react-pdf/renderer/package.json'))
const nodeBuild = path.join(path.dirname(renderer.resolve('pdfkit')), 'pdfkit.node.mjs')

type Transform = (this: { error: (message: string) => never }, code: string, id: string) => { code: string } | undefined
const transform = (code: string, id = nodeBuild) => {
  const context = { error: (message: string): never => { throw new Error(message) } }
  return (pdfkitFonts().transform as Transform).call(context, code, id)
}

describe('pdfkitFonts', () => {
  it("turns each of the Node build's font loads into an import of the font's module", async () => {
    const { code } = transform(await readFile(nodeBuild, 'utf8'))!
    expect(code).toMatch(/^import __pdfkitFontHelvetica from '\.\/standard-fonts\/Helvetica\.mjs'$/m)
    expect(code).toContain("Helvetica: () => __pdfkitFontHelvetica,")
    expect(code).not.toContain("'#standard-fonts/")
  })

  it('leaves every other module as it is', () => {
    expect(transform("require('#standard-fonts/Helvetica')", '/x/node_modules/other/index.mjs')).toBeUndefined()
  })

  it('stops the build when pdfkit loads its fonts another way', () => {
    expect(() => transform('export default 1')).toThrow('pdfkit no longer loads its standard fonts')
  })
})
