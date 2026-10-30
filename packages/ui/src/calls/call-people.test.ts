import { describe, expect, it } from 'vitest'
import type { CallTrack } from '@protobase/client/calls'
import { callPeople, type PeopleInput } from './call-people'

const media = (id: string) => ({ id }) as MediaStreamTrack
const track = (member: string, source: CallTrack['source'], muted = false): CallTrack => ({ sid: `${member}-${source}`, member, kind: source.includes('audio') || source === 'microphone' ? 'audio' : 'video', source, muted, track: media(`${member}-${source}`) })

const input = (more: Partial<PeopleInput> = {}): PeopleInput => ({
  members: [{ member: 'ann', joined_at: '1' }, { member: 'bob', joined_at: '2' }],
  self: 'ann',
  tracks: [],
  own: { microphoneOn: true, cameraOn: true },
  nameOf: (member) => member.toUpperCase(),
  connections: [],
  seen: new Map(),
  now: 0,
  ...more,
})

describe('callPeople', () => {
  it("draws the member from their own tracks and the others from what their browser receives, in the order they came", () => {
    const own = { microphone: media('mic'), camera: media('cam'), microphoneOn: false, cameraOn: true }
    const people = callPeople(input({ own, tracks: [track('bob', 'camera'), track('bob', 'microphone', true), track('bob', 'screen')], speaker: 'bob' }))
    expect(people.map((person) => [person.member, person.name, person.self, person.microphoneOff, person.cameraOff, person.speaking])).toEqual([
      ['ann', 'ANN', true, true, false, undefined],
      ['bob', 'BOB', undefined, true, false, true],
    ])
    expect(people[1]!.screen?.id).toBe('bob-screen')
  })

  it('draws the member before the server named them', () => {
    expect(callPeople(input({ members: [] })).map((person) => person.member)).toEqual(['ann'])
  })

  it("marks a poor connection, and one this browser cannot make", () => {
    const connections = [{ member: 'bob', state: 'connected' as const, roundTripMs: 900 }]
    expect(callPeople(input({ connections }))[1]!.connection).toBe('poor')
    expect(callPeople(input({ connections: [{ member: 'bob', state: 'failed' }] }))[1]!.connection).toBe('failed')
    expect(callPeople(input({ connections: [{ member: 'bob', state: 'connecting' }], seen: new Map([['bob', 0]]), now: 20_000 }))[1]!.connection).toBe('failed')
    expect(callPeople(input({ connections: [{ member: 'bob', state: 'connecting' }], seen: new Map([['bob', 0]]), now: 1000 }))[1]!.connection).toBeUndefined()
  })

  it('names a member by the name the call gives, a guest by theirs, marked a guest, and the rest by nameOf', () => {
    const members = [{ member: 'ann', joined_at: '1', name: 'Ann Lee' }, { member: 'guest:g1', joined_at: '2', name: '<b>Eve</b>' }, { member: 'bob', joined_at: '3' }]
    expect(callPeople(input({ members })).map((person) => person.name)).toEqual(['Ann Lee', '<b>Eve</b> (guest)', 'BOB'])
  })
})
