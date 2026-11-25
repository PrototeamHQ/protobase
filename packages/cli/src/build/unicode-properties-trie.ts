import path from 'node:path'
import type { Plugin } from 'vite'

const entry = /[\\/]unicode-properties[\\/]index\.js$/

/**
 * Bundles the Unicode data that React PDF's text layout reads through unicode-properties. Its Node build reads the
 * file `data.trie` beside it at run time, which a bundle does not carry; this takes the build that embeds the same data
 * as base64 instead.
 */
export const unicodePropertiesTrie = (): Plugin => ({
  name: 'protobase-unicode-properties-trie',
  enforce: 'pre',
  resolveId(id, importer) {
    if (id !== '#binary-trie' || !importer || !entry.test(importer)) return
    return path.join(path.dirname(importer), 'binaryTrie.browser.js')
  },
})
