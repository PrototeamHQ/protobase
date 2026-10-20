import { describe, expect, it } from 'vitest'
import { f, resource, view } from '@protobase/schema'
import { actionWhenErrors, actionWhenFields } from './view-action-when'

const vms = resource('vms')
  .table('vms')
  .fields({ id: f.integer(), status: f.enum(['running', 'stopped']), host_id: f.relation('hosts') })
  .primaryKey((r) => r.id)

describe('action conditions', () => {
  it('names the fields a condition reads', () => {
    expect(actionWhenFields("status = 'running' AND host_id = 2")).toEqual(['status', 'host_id'])
    expect(actionWhenFields(undefined)).toEqual([])
    expect(actionWhenFields('status = ')).toEqual([])
  })

  it("accepts a condition on the record's own fields", () => {
    const model = view<typeof vms>('vms').actions((a) => [a.action('reboot', { label: 'Reboot', when: "status = 'running'" })]).toModel()
    expect(actionWhenErrors(model, vms.toModel())).toEqual([])
  })

  it('refuses a condition through a relation, a count, a field the record lacks or one that does not parse', () => {
    const model = view<typeof vms>('vms')
      .actions((a) => [
        a.action('a', { label: 'A', when: "host_id.name = 'x'" }),
        a.action('b', { label: 'B', when: 'hosts.count > 1' }),
        a.action('c', { label: 'C', when: 'state = 1' }),
        a.action('d', { label: 'D', when: 'status = ' }),
      ])
      .toModel()
    const errors = actionWhenErrors(model, vms.toModel())
    expect(errors.slice(0, 3)).toEqual([
      `action "a": "when" names "host_id.name", but an action's condition reads only fields vms has`,
      `action "b": "when" names "hosts.count", but an action's condition reads only fields vms has`,
      `action "c": "when" names "state", but an action's condition reads only fields vms has`,
    ])
    expect(errors[3]).toMatch(/^action "d": "when" is not a valid condition: /)
  })

  it('checks the options of a view written as data', () => {
    const model = { ...view<typeof vms>('vms').toModel(), actions: [{ name: 'x', label: 'X', bulk: false, when: "status = 'running'", otherwise: 'disable' as const }] }
    expect(actionWhenErrors(model, vms.toModel())).toEqual(['action "x": a button disabled by "when" needs a "reason"'])
  })
})
