import { describe, expect, it } from 'vitest'
import * as ui from '../index'
import { pluginApi } from './plugin-api'
import pinned from './plugin-api.exports.json' with { type: 'json' }

// What plugins link against: every runtime export of @protobase/ui. Plugins built for this plugin API keep working
// while none of these goes away, so removing one takes a new plugin API, and adding one is written down here.
const exported = Object.keys(ui).sort()

describe('the plugin API', () => {
  it('removes no export of @protobase/ui while it stays the same plugin API', () => {
    const removed = pinned.exports.filter((name) => !exported.includes(name))
    if (pinned.pluginApi === pluginApi) {
      expect(removed, 'a plugin importing one of these would no longer load: keep it, or raise pluginApi in package.json').toEqual([])
    }
  })

  it('pins every export it has, for the plugin API it is', () => {
    const added = exported.filter((name) => !pinned.exports.includes(name))
    expect(added, 'add new exports to plugin-api.exports.json').toEqual([])
    expect(pinned.pluginApi, 'pin the exports of the new plugin API in plugin-api.exports.json').toBe(pluginApi)
  })
})
