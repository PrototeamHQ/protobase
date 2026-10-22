import { describe, expect, it } from 'vitest'
import { Action, CardRow, Field, Link, ModalForm, Page, RecordCard, RecordCards, RecordRow, Show, Stat, Table } from './blocks'
import { fieldRef, type FieldRefValue } from '@protobase/schema'
import { checkPages, pageProblems } from './check-page'
import { component } from './component'
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

  it("checks a record row's resource, filter and sort like a table's", () => {
    const tree = Page({ title: 'x', children: [RecordRow({ resource: 'nope' }), RecordRow({ resource: 'invoices', filter: "stauts = 'open'", sort: 'number desc' })] })
    const found = pageProblems(model(tree), input)
    expect(found[0]).toBe('<Page> › <RecordRow resource="nope">: unknown resource "nope"')
    expect(found[1]).toMatch(/^<Page> › <RecordRow resource="invoices">: filter: .*stauts/)
    expect(found).toHaveLength(2)
  })

  it("checks record cards' fields through relations and their card actions against the view", () => {
    const tree = Page({ title: 'x', children: RecordCards({ resource: 'subscriptions', fields: ['status', 'plan.name', 'plan.nmae'], cardActions: ['cancel', 'remove'] }) })
    expect(pageProblems(model(tree), input)).toEqual([
      '<Page> › <RecordCards resource="subscriptions">: unknown field "plan.nmae" on plans',
      `<Page> › <RecordCards resource="subscriptions">: no action "remove" on subscriptions; declare it with view('subscriptions').actions(...)`,
    ])
  })

  it('wants a RecordCards card width only in a carousel', () => {
    const cards = (props: Record<string, string>) => Page({ title: 'x', children: RecordCards({ resource: 'subscriptions', ...props }) })
    expect(pageProblems(model(cards({ layout: 'carousel', cardWidth: '1/2' })), input)).toEqual([])
    expect(pageProblems(model(cards({ cardWidth: '1/2' })), input)).toEqual([
      `<Page> › <RecordCards resource="subscriptions">: "cardWidth" sizes the cards of a carousel; set layout to 'carousel' or leave it out`,
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

describe('links', () => {
  it('names what a link address does not find: a resource, a page, a field of the record around it', () => {
    const tree = Page({
      title: 'x',
      children: [
        Link({ to: { kind: 'list', resource: 'invoice' } }),
        Link({ to: { kind: 'page', page: 'billing' } }),
        Link({ to: { kind: 'page', page: 'help' } }),
        RecordCard({ resource: 'subscriptions', children: [Link({ to: { kind: 'record', resource: 'plans', key: '{plan}' } }), Link({ to: { kind: 'list', resource: 'invoices', filter: 'number = "{reference}"' } })] }),
      ],
    })
    expect(pageProblems(model(tree), { ...input, pages: new Set(['billing']) })).toEqual([
      '<Page> › <Link>: to: unknown resource "invoice"',
      '<Page> › <Link>: to: unknown page "help"',
      '<Page> › <RecordCard resource="subscriptions"> › <Link>: to: "{reference}" is not a field of subscriptions',
    ])
  })
})

describe('custom components', () => {
  it('names a resource or field reference the models do not have, and a reference outside a record', () => {
    const Sparkline = component<{ resource?: string; value: FieldRefValue }>('Sparkline')
    const tree = Page({
      title: 'x',
      children: [
        RecordCard({ resource: 'subscriptions', children: [Sparkline({ value: fieldRef('plan.name') }), Sparkline({ value: fieldRef('plan.title') })] }),
        Sparkline({ resource: 'invoices', value: fieldRef('total') }),
        Sparkline({ resource: 'invoice', value: fieldRef('total') }),
        Sparkline({ value: fieldRef('total') }),
      ],
    })
    expect(pageProblems(model(tree), input)).toEqual([
      '<Page> › <RecordCard resource="subscriptions"> › <Sparkline>: unknown field "plan.title" on plans',
      '<Page> › <Sparkline resource="invoice">: unknown resource "invoice"',
      '<Page> › <Sparkline>: field reference "total" needs a record around it, or a "resource" prop',
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
