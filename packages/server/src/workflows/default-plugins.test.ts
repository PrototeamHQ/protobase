import { appPlugin, gmailPlugin } from '@protobase/workflow-plugins'
import { definePlugin } from '@protobase/workflows/plugin'
import { describe, expect, it } from 'vitest'
import { workflowPlugins } from './default-plugins'
import { workflowTypes } from './workflow-types'

const names = (loaded: ReturnType<typeof workflowPlugins>) => loaded.map(({ plugin, source }) => `${plugin.name} from ${source}`)

describe('workflowPlugins', () => {
  it('runs the defaults first, then the app’s own', () => {
    const acme = definePlugin({ name: 'acme', label: 'Acme' })
    expect(names(workflowPlugins([{ plugin: acme, source: 'workflows/plugins/acme.ts' }]))).toEqual(['app from @protobase/workflow-plugins', 'gmail from @protobase/workflow-plugins', 'acme from workflows/plugins/acme.ts'])
  })

  it('lets an app’s own plugin take the place of a default of its name', () => {
    const own = gmailPlugin({ apiUrl: 'https://gmail.example.com' })
    const loaded = workflowPlugins([{ plugin: own, source: 'protobase.config.ts' }])
    expect(names(loaded)).toEqual(['app from @protobase/workflow-plugins', 'gmail from protobase.config.ts'])
    expect(loaded[1]!.plugin).toBe(own)
  })

  it('never lets one take the place of app, nor two of the app’s own share a name', () => {
    expect(() => workflowTypes([{ plugin: { ...appPlugin }, source: 'mine' }])).toThrow('Two workflow plugins are named "app": @protobase/workflow-plugins and mine')
    const twice = [gmailPlugin(), gmailPlugin()].map((plugin, index) => ({ plugin, source: `copy ${index}` }))
    expect(() => workflowTypes(twice)).toThrow('Two workflow plugins are named "gmail": copy 0 and copy 1')
  })

  it('lists gmail:new_mail, available once the app signs in with Google', () => {
    const without = workflowTypes()
    expect(without.types.find(({ id }) => id === 'gmail:new_mail')).toMatchObject({ kind: 'polling', available: false })
    const signed = workflowTypes([], undefined, { encrypted: true, signInProviders: ['google'], clients: [] })
    expect(signed.available('gmail:new_mail')).toBe(true)
  })
})
