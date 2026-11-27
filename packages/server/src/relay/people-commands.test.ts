import { describe, expect, it } from 'vitest'
import { peopleEvents } from '@protobase/schema/internal'
import { peopleCommands } from './people-commands'

describe('peopleCommands', () => {
  it("publishes the event on people, to each person once", () => {
    expect(peopleCommands('j1', ['u1', 'u2', 'u1'], peopleEvents.refresh)).toEqual([{ kind: 'publish', id: 'j1:refresh', channel: 'people', users: ['u1', 'u2'], event: 'refresh', payload: {} }])
  })

  it('publishes nothing for no one', () => {
    expect(peopleCommands('j1', [], peopleEvents.rings)).toEqual([])
  })
})
