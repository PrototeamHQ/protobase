import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { unicodePropertiesTrie } from './unicode-properties-trie'

// unicode-properties as React PDF's text layout, a dependency of @protobase/server, has it.
const fromServer = createRequire(import.meta.resolve('@protobase/server'))
const renderer = createRequire(fromServer.resolve('@react-pdf/renderer/package.json'))
const textkit = createRequire(renderer.resolve('@react-pdf/textkit'))
const entry = textkit.resolve('unicode-properties')

type ResolveId = (id: string, importer?: string) => string | undefined
const resolveId = unicodePropertiesTrie().resolveId as ResolveId

describe('unicodePropertiesTrie', () => {
  it("resolves the trie to the build that embeds the Node build's data file", async () => {
    const resolved = resolveId('#binary-trie', entry)!
    const { getBinaryTrie } = await import(resolved)
    const dataFile = await readFile(path.join(path.dirname(entry), 'data.trie'))
    expect(Buffer.from(getBinaryTrie()).equals(dataFile)).toBe(true)
  })

  it('leaves every other import as it is', () => {
    expect(resolveId('#binary-trie', '/x/node_modules/other/index.js')).toBeUndefined()
    expect(resolveId('./data.js', entry)).toBeUndefined()
  })
})
