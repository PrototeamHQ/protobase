import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { realtimeLimits } from '../realtime/realtime-limits'
import { buildRegistry } from '../registry'
import { publicationOfSend } from './database-sends'

const registry = buildRegistry([resource('rooms').table('rooms').fields({ id: f.integer() }).primaryKey((r) => r.id)])

const row = (fields: Partial<Parameters<typeof publicationOfSend>[1]>) => ({ id: '1', resource: 'rooms', key: '1', event: 'announcement', payload: { text: 'x' }, ...fields })

describe('publicationOfSend', () => {
  it('broadcasts a row to its record\'s channel as the server', () => {
    expect(publicationOfSend(registry, row({ key: '01' }))).toEqual({ topic: 'rooms/1', event: 'announcement', payload: { user: null, server: true, payload: { text: 'x' } }, private: false })
  })

  it('drops a row of a record the app does not have, or over the limits of channels.broadcast', () => {
    expect(publicationOfSend(registry, row({ resource: 'notes' }))).toBeUndefined()
    expect(publicationOfSend(registry, row({ key: 'abc' }))).toBeUndefined()
    expect(publicationOfSend(registry, row({ event: 'e'.repeat(256) }))).toBeUndefined()
    expect(publicationOfSend(registry, row({ payload: 'x'.repeat(realtimeLimits.maxFrameBytes) }))).toBeUndefined()
    expect(publicationOfSend(registry, row({ payload: 'x'.repeat(realtimeLimits.maxFrameBytes - 2) }))).toBeDefined()
  })
})
