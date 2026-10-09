import { describe, expect, it } from 'vitest'
import { Page, Show, Table } from './blocks'
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

  it('keeps custom components, which the app renders', () => {
    expect(types(prunePage(billing.toModel(), [], access({ models: restricted({ invoices: ['status'] }) })))).toContain('UsageChart')
  })
})
