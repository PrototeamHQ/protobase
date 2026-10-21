import { describe, expect, it } from 'vitest'
import { fieldRef, type FieldRefValue } from '@protobase/schema'
import { Chart, Link, Page, RecordCard, RecordCards, Show, Table } from './blocks'
import { component } from './component'
import type { LayoutNode } from './node'
import type { PageModel } from './page'
import { prunePage, type CallerAccess } from './prune-page'
import { billing } from './testing/billing'
import { restricted } from './testing/models'
import { walkTree } from './walk'

const everything = { create: true, update: true }

const access = (overrides: Partial<CallerAccess> = {}): CallerAccess => ({
  models: restricted({}),
  permissions: { subscriptions: everything, paymentMethods: everything, invoices: everything, plans: everything },
  actions: (resource) => new Set({ subscriptions: ['cancel', 'upgrade'], paymentMethods: ['makeDefault'] }[resource] ?? []),
  ...overrides,
})

const types = (page: PageModel | undefined) => {
  const found: string[] = []
  if (page) walkTree(page.tree, (node) => found.push(node.type + (typeof node.props.name === 'string' ? `:${node.props.name}` : '')))
  return found
}

const find = (page: PageModel | undefined, type: string) => {
  let match: LayoutNode | undefined
  if (page) walkTree(page.tree, (node) => void (node.type === type && (match ??= node)))
  return match
}

describe('prunePage', () => {
  it('keeps everything for a caller who may use everything', () => {
    expect(prunePage(billing.toModel(), [], access())).toEqual(billing.toModel())
  })

  it('leaves out a chart whose grouped or added up field the caller cannot read', () => {
    const page: PageModel = {
      name: 'charts',
      title: 'Charts',
      tree: Page({ title: 'Charts', children: [Chart({ resource: 'invoices', groupBy: 'status' }), Chart({ resource: 'invoices', groupBy: 'issuedOn', type: 'line', sum: 'total' }), Chart({ resource: 'invoices', groupBy: 'issuedOn', splitBy: 'status' })] }),
    }
    const charts = (hide: string[]) => types(prunePage(page, [], access({ models: restricted({ invoices: hide }) }))).filter((type) => type === 'Chart').length
    expect(charts([])).toBe(3)
    expect(charts(['total'])).toBe(2)
    expect(charts(['status'])).toBe(1)
    expect(charts(['status', 'issuedOn'])).toBe(0)
  })

  it('leaves out the page for callers without one of its roles', () => {
    const page = { ...billing.toModel(), roles: ['billing'] }
    expect(prunePage(page, ['sales'], access())).toBeUndefined()
    expect(prunePage(page, ['sales', 'billing'], access())).toBeDefined()
  })

  it('leaves out elements of resources the caller cannot see, with what is inside them', () => {
    const pruned = prunePage(billing.toModel(), [], access({ models: restricted({}, {}, ['subscriptions']) }))
    expect(types(pruned)).not.toContain('RecordCard')
    expect(types(pruned)).not.toContain('Progress')
    expect(types(pruned)).toContain('Table')
  })

  it('leaves out fields the caller cannot read, also behind a relation', () => {
    const pruned = prunePage(billing.toModel(), [], access({ models: restricted({ plans: ['name'], paymentMethods: ['last4'] }) }))
    expect(types(pruned).filter((type) => type.startsWith('Field'))).toEqual(['Field:brand'])
    expect(types(pruned)).toContain('Progress')
  })

  it('narrows table columns, and drops the list when none is left', () => {
    const narrowed = prunePage(billing.toModel(), [], access({ models: restricted({ invoices: ['total'] }) }))
    expect(find(narrowed, 'Table')!.props.columns).toEqual(['number', 'status'])
    const page: PageModel = { name: 'p', title: 'p', tree: Page({ title: 'p', children: Table({ resource: 'invoices', columns: ['total'] }) }) }
    expect(find(prunePage(page, [], access({ models: restricted({ invoices: ['total'] }) })), 'Table')!.props).toEqual({ resource: 'invoices' })
  })

  it('leaves out elements whose filter or sort names a hidden field', () => {
    const pruned = prunePage(billing.toModel(), [], access({ models: restricted({ invoices: ['number'], paymentMethods: ['isDefault'] }) }))
    expect(types(pruned)).not.toContain('Table')
    expect(types(pruned)).not.toContain('CardRow')
    expect(types(pruned)).toContain('Stat')
  })

  it("narrows record cards' fields and card actions to what the caller may read and run", () => {
    const page: PageModel = { name: 'p', title: 'p', tree: Page({ title: 'p', children: RecordCards({ resource: 'subscriptions', fields: ['status', 'plan.name'], cardActions: ['cancel', 'upgrade'] }) }) }
    const pruned = prunePage(page, [], access({ models: restricted({ plans: ['name'] }), actions: () => new Set(['upgrade']) }))
    expect(find(pruned, 'RecordCards')!.props).toEqual({ resource: 'subscriptions', fields: ['status'], cardActions: ['upgrade'] })
  })

  it('leaves out forms the caller may not submit, and narrows their fields', () => {
    expect(types(prunePage(billing.toModel(), [], access({ permissions: { paymentMethods: { create: false, update: true } } })))).not.toContain('ModalForm')
    const narrowed = prunePage(billing.toModel(), [], access({ models: restricted({}, { paymentMethods: ['last4'] }) }))
    expect(find(narrowed, 'ModalForm')!.props.fields).toEqual(['brand'])
  })

  it('leaves out actions missing from the view the caller gets', () => {
    const pruned = prunePage(billing.toModel(), [], access({ actions: (resource) => new Set(resource === 'subscriptions' ? ['upgrade'] : []) }))
    expect(types(pruned).filter((type) => type.startsWith('Action'))).toEqual(['Action:upgrade'])
  })

  it('leaves out conditions about things the caller cannot see', () => {
    expect(types(prunePage(billing.toModel(), [], access({ models: restricted({}, {}, ['paymentMethods']) })))).not.toContain('Show')
    const page: PageModel = { name: 'p', title: 'p', tree: Page({ title: 'p', children: Show({ when: 'invoices.count > 0', children: 'x' }) }) }
    expect(types(prunePage(page, [], access()))).toEqual(['Page', 'Show'])
  })

  it('leaves out links to resources the caller cannot see, or naming fields they cannot read', () => {
    const page: PageModel = {
      name: 'p',
      title: 'p',
      tree: Page({
        title: 'p',
        children: [
          Link({ to: { kind: 'list', resource: 'invoices', filter: 'status = "open"' }, children: 'Open invoices' }),
          RecordCard({ resource: 'subscriptions', children: Link({ to: { kind: 'record', resource: 'plans', key: '{plan}' }, children: 'Plan' }) }),
        ],
      }),
    }
    expect(types(prunePage(page, [], access()))).toEqual(['Page', 'Link', 'RecordCard', 'Link'])
    expect(types(prunePage(page, [], access({ models: restricted({ invoices: ['status'], subscriptions: ['plan'] }) })))).toEqual(['Page', 'RecordCard'])
    expect(types(prunePage(page, [], access({ models: restricted({}, {}, ['plans']) })))).toEqual(['Page', 'Link', 'RecordCard'])
  })

  it('keeps custom components, which the app renders', () => {
    expect(types(prunePage(billing.toModel(), [], access({ models: restricted({ invoices: ['status'] }) })))).toContain('UsageChart')
  })

  it('never sends a hidden field or resource through a custom component', () => {
    const Sparkline = component<{ resource?: string; value: FieldRefValue; label: string }>('Sparkline')
    const page: PageModel = {
      name: 'p',
      title: 'p',
      tree: Page({
        title: 'p',
        children: [
          RecordCard({ resource: 'subscriptions', children: [Sparkline({ value: fieldRef('plan.seats'), label: 'Seats' }), Sparkline({ value: fieldRef('seatsUsed'), label: 'Used' })] }),
          Sparkline({ resource: 'invoices', value: fieldRef('total'), label: 'Total' }),
        ],
      }),
    }
    expect(types(prunePage(page, [], access()))).toEqual(['Page', 'RecordCard', 'Sparkline', 'Sparkline', 'Sparkline'])
    const pruned = prunePage(page, [], access({ models: restricted({ plans: ['seats'], invoices: ['total'] }) }))
    expect(types(pruned)).toEqual(['Page', 'RecordCard', 'Sparkline'])
    expect(JSON.stringify(pruned)).not.toMatch(/seats"|total/)
    expect(types(prunePage(page, [], access({ models: restricted({}, {}, ['invoices']) })))).toEqual(['Page', 'RecordCard', 'Sparkline', 'Sparkline'])
  })
})
