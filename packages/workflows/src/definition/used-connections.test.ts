import { describe, expect, it } from 'vitest'
import { checkDefinition } from './check-definition'
import { problemText } from './problem'
import { usedConnections } from './used-connections'
import type { Definition } from './types'

const connections = { 'acme:inbox': 'acme:google', 'acme:send': 'acme:google', 'other:read': 'other:account' }
const send = { Type: 'Task', Resource: 'acme:send', End: true } as const
const definition = (extra: Partial<Definition> = {}): Definition => ({
  trigger: { 'acme:inbox': {} },
  stateMachine: { QueryLanguage: 'JSONata', StartAt: 'Each', States: { Each: { Type: 'Map', Items: '{% [1] %}', ItemProcessor: { StartAt: 'Send', States: { Send: send } }, End: true } } },
  ...extra,
})
const check = (value: Definition) => checkDefinition(value, { resources: ['acme:send'], triggers: { 'acme:inbox': () => [] }, connections }).map(problemText)

describe('usedConnections', () => {
  it("reads the trigger's and every step's connection, inside Maps too, each once", () => {
    expect([...usedConnections(definition(), connections)]).toEqual(['acme:google'])
    expect([...usedConnections({ ...definition(), trigger: { manual: {} } }, { 'acme:send': 'acme:google' })]).toEqual(['acme:google'])
  })
})

describe('connections in a definition', () => {
  it('takes a binding of a connection its types use, and a definition without one', () => {
    expect(check(definition({ connections: { 'acme:google': 'account-1' } }))).toEqual([])
    expect(check(definition())).toEqual([])
  })

  it('refuses a binding no type uses, an empty id and a key that is not <plugin>:<connection>', () => {
    expect(check(definition({ connections: { 'other:account': 'account-1' } }))).toEqual(['Field "connections.other:account": no trigger or step of this workflow signs in with "other:account"; remove it'])
    expect(check(definition({ connections: { 'acme:google': '' } }))).toHaveLength(1)
    expect(check(definition({ connections: { google: 'account-1' } })).length).toBeGreaterThan(0)
  })
})
