import { readVapidSettings } from '@protobase/server'
import { describe, expect, it } from 'vitest'
import { printVapidKeys } from './print-vapid-keys'

const printed = () => {
  let out = ''
  let note = ''
  printVapidKeys((text) => void (out += text), (text) => void (note += text))
  return { out, note, env: Object.fromEntries(out.trim().split('\n').map((line) => line.split('=') as [string, string])) }
}

describe('printVapidKeys', () => {
  it('prints a fresh pair as the variables Web Push reads, which pass its startup checks', () => {
    const first = printed()
    const second = printed()
    expect(Object.keys(first.env)).toEqual(['PROTOBASE_VAPID_PUBLIC_KEY', 'PROTOBASE_VAPID_PRIVATE_KEY'])
    expect(first.env.PROTOBASE_VAPID_PRIVATE_KEY).not.toBe(second.env.PROTOBASE_VAPID_PRIVATE_KEY)
    for (const { env } of [first, second]) expect(readVapidSettings({ ...env, PROTOBASE_VAPID_SUBJECT: 'mailto:admin@example.com' })?.publicKey).toBe(env.PROTOBASE_VAPID_PUBLIC_KEY)
  })

  it('tells how to set the subject, apart from the keys', () => {
    const { note } = printed()
    expect(note).toContain('PROTOBASE_VAPID_SUBJECT')
    expect(note).not.toContain('=')
  })
})
