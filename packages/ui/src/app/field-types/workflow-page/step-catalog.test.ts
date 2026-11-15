import { afterEach, describe, expect, it } from 'vitest'
import type { WorkflowTypeEntry } from '@protobase/client'
import { setAppLocale } from '../../../locale/active-locale'
import { stepGroups } from './step-catalog'

const step = (id: string, label: string): WorkflowTypeEntry => ({ id, kind: 'step', label, description: '', input: { type: 'object' }, available: true })
const types = { step_types: [step('app:http', 'HTTP request'), step('acme:send', 'Send'), step('custom:invoice:1', 'Invoice'), step('custom:invoice:2', 'Invoice')], triggers: [] }

afterEach(() => setAppLocale(undefined))

describe('stepGroups', () => {
  it("groups the app's custom steps under a title of their own, after the plugins' steps, each at its latest version", () => {
    expect(stepGroups(types).map((group) => [group.title, group.items.map((item) => item.id)])).toEqual([
      ['Built in', ['task:app:http']],
      ['acme', ['task:acme:send']],
      ['Custom steps', ['task:custom:invoice:2']],
      ['Flow', expect.any(Array)],
    ])
    setAppLocale('nl')
    expect(stepGroups(types)[2]!.title).toBe('Eigen stappen')
  })
})
