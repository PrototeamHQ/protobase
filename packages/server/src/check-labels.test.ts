import { describe, expect, it } from 'vitest'
import { translations } from '@protobase/layout'
import { f, resource } from '@protobase/schema'
import { checkLabelProblems } from './check-labels'

const tasks = (label: string) =>
  resource('tasks').table('tasks').fields({ id: f.integer(), title: f.text() }).primaryKey((r) => r.id).checks({ tasks_parked_by_hand: { label } }).toModel()

describe('checkLabelProblems', () => {
  it('takes a label whose values are fields of the resource, and one in every language', () => {
    const texts = translations({ en: { resources: { tasks: { checks: { tasks_parked_by_hand: { label: '{title} waits.' } } } } } })
    expect(checkLabelProblems([tasks('{title} waits for a day.')], texts)).toEqual([])
  })

  it('refuses a value no field holds, as written and as translated', () => {
    const texts = translations({ nl: { resources: { tasks: { checks: { tasks_parked_by_hand: { label: '{reason}' } } } } } })
    expect(checkLabelProblems([tasks('{title} waits until {until}.')], texts)).toEqual([
      'Resource "tasks": check "tasks_parked_by_hand"\'s label formats {until}, which no field of tasks holds, and the app fills a check\'s values from the record',
      'The nl text "resources.tasks.checks.tasks_parked_by_hand.label" formats {reason}, which no field of tasks holds, and the app fills a check\'s values from the record',
    ])
  })
})
