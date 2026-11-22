import { describe, expect, it } from 'vitest'
import { translations } from '@protobase/layout'
import { f, resource } from '@protobase/schema'
import { translatedResource } from './meta-texts'

const tasks = resource('tasks')
  .table('tasks')
  .fields({ id: f.integer(), title: f.text() })
  .primaryKey((r) => r.id)
  .checks({ tasks_parked_by_hand: { label: '{title} waits for a day.' }, tasks_lane: { label: 'Pick a lane.' } })
  .toModel()

const texts = translations({
  en: { resources: { tasks: { checks: { tasks_parked_by_hand: { label: '{title} waits for a day, so it stays parked.' } } } } },
  nl: { resources: { tasks: { checks: { tasks_parked_by_hand: { label: '{title} wacht op een dag, dus blijft geparkeerd.' } } } } },
})

describe('translatedResource', () => {
  it("gives a check's label in the reader's language as the message itself, its values left for the app to fill", () => {
    expect(translatedResource(tasks, texts, 'nl').checks).toEqual({ tasks_parked_by_hand: { label: '{title} wacht op een dag, dus blijft geparkeerd.' }, tasks_lane: { label: 'Pick a lane.' } })
  })

  it('leaves a resource without checks as it is', () => {
    const plain = { ...tasks, checks: undefined }
    expect(translatedResource(plain, texts, 'nl')).toBe(plain)
  })
})
