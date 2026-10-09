import { describe, expect, it } from 'vitest'
import { Action, CardRow, Field, ModalForm, Page, RecordCard, Show, Stat, Table } from './blocks'
import { checkPages, pageProblems } from './check-page'
import { resolveFieldPath } from './field-path'
import type { LayoutNode } from './node'
import type { PageModel } from './page'
import { billing } from './testing/billing'
import { models } from './testing/models'

const actions: Record<string, string[]> = { subscriptions: ['cancel', 'upgrade'], paymentMethods: ['makeDefault'] }
const input = { models, actions: (resource: string) => new Set(actions[resource] ?? []) }
const model = (tree: LayoutNode, name = 'test'): PageModel => ({ name, title: 'Test', tree })

describe('resolveFieldPath', () => {
  it('follows relations to the field at the end', () => {
    const resolved = resolveFieldPath(models, 'subscriptions', 'plan.name')
    expect(resolved.ok && resolved.steps.map((step) => `${step.model.name}.${step.field.name}`)).toEqual(['subscriptions.plan', 'plans.name'])
  })

  it('says which part is wrong', () => {
    expect(resolveFieldPath(models, 'subscriptions', 'plan.nmae')).toEqual({ ok: false, message: 'unknown field "plan.nmae" on plans' })
    expect(resolveFieldPath(models, 'subscriptions', 'status.name')).toEqual({ ok: false, message: '"status" is not a relation, so "status.name" cannot go through it' })
    expect(resolveFieldPath(models, 'nope', 'a')).toEqual({ ok: false, message: 'unknown resource "nope"' })
  })
})

describe('pageProblems', () => {
  it('accepts the billing page', () => {
    expect(pageProblems(billing.toModel(), input)).toEqual([])
  })

  it('names unknown resources, filter and sort errors, columns and fields', () => {
    const tree = Page({
      title: 'x',
      children: [
        Table({ resource: 'nope' }),
        Table({ resource: 'invoices', filter: "stauts = 'open'", sort: 'totl desc', columns: ['number', 'amount'] }),
        RecordCard({ resource: 'subscriptions', children: [Field({ name: 'plan.title' }), Stat({ label: 'a', field: 'seats' })] }),
      ],
    })
    const found = pageProblems(model(tree), input)
    expect(found[0]).toBe('<Page> › <Table resource="nope">: unknown resource "nope"')
    expect(found[1]).toMatch(/^<Page> › <Table resource="invoices">: filter: .*stauts/)
    expect(found[2]).toMatch(/^<Page> › <Table resource="invoices">: sort: .*totl/)
    expect(found.slice(3)).toEqual([
      '<Page> › <Table resource="invoices">: unknown column "amount" on invoices',
      '<Page> › <RecordCard resource="subscriptions"> › <Field name="plan.title">: unknown field "plan.title" on plans',
      '<Page> › <RecordCard resource="subscriptions"> › <Stat>: unknown field "seats" on subscriptions',
    ])
  })

  it('wants forms to set writable fields only', () => {
    const tree = Page({ title: 'x', children: ModalForm({ mode: 'create', label: 'Add', resource: 'subscriptions', fields: ['id', 'organizationId', 'nope', 'status'], values: { other: 1 } }) })
    expect(pageProblems(model(tree), input)).toEqual([
      '<Page> › <ModalForm resource="subscriptions">: "id" is read-only on subscriptions, so a form cannot set it',
      '<Page> › <ModalForm resource="subscriptions">: "organizationId" is read-only on subscriptions, so a form cannot set it',
      '<Page> › <ModalForm resource="subscriptions">: unknown field "nope" on subscriptions',
      '<Page> › <ModalForm resource="subscriptions">: values: unknown field "other" on subscriptions',
    ])
  })

  it('wants actions that the resource declares', () => {
    const tree = Page({ title: 'x', children: [CardRow({ resource: 'paymentMethods', children: Action({ name: 'remove' }) }), Action({ name: 'cancel', resource: 'subscriptions' })] })
    expect(pageProblems(model(tree), input)).toEqual([
      `<Page> › <CardRow resource="paymentMethods"> › <Action name="remove">: no action "remove" on paymentMethods; declare it with view('paymentMethods').actions(...)`,
    ])
  })

  it('checks what conditions count and read', () => {
    const tree = Page({
      title: 'x',
      children: [
        Show({ when: 'invoices.count > 0 AND things.count > 1' }),
        Show({ when: "status = 'open'" }),
        RecordCard({ resource: 'subscriptions', children: Show({ when: 'plan.seats > 3 AND plan.color = "red"' }) }),
      ],
    })
    expect(pageProblems(model(tree), input)).toEqual([
      '<Page> › <Show>: "when" counts "things", which is not a resource',
      '<Page> › <Show>: "when" names "status", but outside a record it can only count records, as "<resource>.count"',
      '<Page> › <RecordCard resource="subscriptions"> › <Show>: unknown field "plan.color" on plans',
    ])
  })
})

describe('checkPages', () => {
  it('refuses duplicate names and names of resources, with every problem in one error', () => {
    const tree = Page({ title: 'x' })
    expect(() => checkPages([model(tree, 'a'), model(tree, 'a'), model(tree, 'invoices'), model(Page({ title: 'x', children: Table({ resource: 'nope' }) }), 'b')], input)).toThrow(
      'The pages do not match the resources:\n  - Page "a" is defined twice\n  - Page "invoices" has the name of a resource; both would be at /invoices\n  - Page "b": <Page> › <Table resource="nope">: unknown resource "nope"',
    )
  })

  it('passes pages that fit', () => {
    expect(() => checkPages([billing.toModel()], input)).not.toThrow()
  })
})
