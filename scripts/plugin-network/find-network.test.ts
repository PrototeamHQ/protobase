import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { findNetworkUses } from './find-network'

const fixture = (name: string) => path.join(import.meta.dirname, 'fixtures', `${name}.ts`)
const found = (name: string) => findNetworkUses([fixture(name)]).map(({ line, what }) => `${line}: ${what}`)

describe('findNetworkUses', () => {
  it.each([
    ['global-fetch', ['1: fetch']],
    ['global-this', ['1: globalThis']],
    ['dynamic-import', ['1: import()']],
    ['require', ['1: require']],
    ['web-socket', ['1: WebSocket']],
  ])('refuses %s', (name, expected) => {
    expect(found(name)).toEqual(expected)
  })

  it("takes the context's fetch, read from it or destructured", () => {
    expect(found('context-fetch')).toEqual([])
  })
})
