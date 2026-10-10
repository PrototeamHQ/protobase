import { describe, expect, it } from 'vitest'
import { readOperatorSettings, resolveOperator } from './operator-provider'

const all = { PROTOBASE_OPERATOR_ISSUER: 'https://id.operator.example', PROTOBASE_OPERATOR_CLIENT_ID: 'app-1', PROTOBASE_OPERATOR_CLIENT_SECRET: 'secret' }

describe('readOperatorSettings', () => {
  it('is none without the variables, and the provider with all three', () => {
    expect(readOperatorSettings({})).toBeUndefined()
    expect(readOperatorSettings(all)).toEqual({ issuer: 'https://id.operator.example', clientId: 'app-1', clientSecret: 'secret' })
    expect(readOperatorSettings({ ...all, PROTOBASE_OPERATOR_NAME: 'Protobase Cloud', PROTOBASE_OPERATOR_GROUP: 'support' })).toMatchObject({ name: 'Protobase Cloud', group: 'support' })
  })

  it('stops at startup with some but not all of them', () => {
    expect(() => readOperatorSettings({ PROTOBASE_OPERATOR_ISSUER: all.PROTOBASE_OPERATOR_ISSUER })).toThrow(/go together/)
    expect(() => readOperatorSettings({ ...all, PROTOBASE_OPERATOR_CLIENT_SECRET: ' ' })).toThrow(/go together/)
  })
})

describe('resolveOperator', () => {
  it('fills in the defaults', () => {
    expect(resolveOperator({ issuer: all.PROTOBASE_OPERATOR_ISSUER, clientId: 'app-1', clientSecret: 'secret' })).toMatchObject({
      name: 'the operator',
      group: 'protobase-staff-access',
      scopes: [],
      acrValues: [],
      sessionMinutes: 30,
    })
  })

  it('refuses an issuer that is not a URL and a session length out of range', () => {
    const provider = { issuer: all.PROTOBASE_OPERATOR_ISSUER, clientId: 'app-1', clientSecret: 'secret' }
    expect(() => resolveOperator({ ...provider, issuer: 'operator' })).toThrow(/must be a URL/)
    for (const sessionMinutes of [0, 241, 1.5]) expect(() => resolveOperator({ ...provider, sessionMinutes })).toThrow(/sessionMinutes/)
  })
})
