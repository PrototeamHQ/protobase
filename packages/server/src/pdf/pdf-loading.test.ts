import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const server = JSON.stringify(fileURLToPath(new URL('../index.ts', import.meta.url)))
const components = JSON.stringify(fileURLToPath(new URL('../pdf.ts', import.meta.url)))

// The modules of React PDF's renderer a fresh Bun process has loaded once it imported the server and the components,
// defined a document and ran `then`, from its module registry.
const rendererLoadedBy = (then: string) => {
  const script = [
    `const { createElement: h } = await import('react')`,
    `const { definePdf } = await import(${server})`,
    `const { Document, Page } = await import(${components})`,
    `const empty = definePdf({ name: 'empty', component: () => h(Document, null, h(Page)) })`,
    then,
    `console.log(JSON.stringify(Object.keys(require.cache)))`,
  ].join('\n')
  const run = spawnSync('bun', ['-e', script], { encoding: 'utf8' })
  expect(run.stderr).toBe('')
  return (JSON.parse(run.stdout) as string[]).filter((file) => /@react-pdf\/renderer|pdfkit/.test(file))
}

describe("React PDF's renderer", () => {
  it('is loaded on the first document rendered, not by the server, the components or a definition', () => {
    expect(rendererLoadedBy('')).toEqual([])
    expect(rendererLoadedBy('await empty.render({})')).not.toEqual([])
  })
})
