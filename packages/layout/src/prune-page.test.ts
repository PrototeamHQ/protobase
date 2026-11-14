import { describe, expect, it } from 'vitest'
import { fieldRef, type FieldRefValue, type RowButtonModel } from '@protobase/schema'
import { Card, Chart, Composer, Image, Link, Page, RecordCard, RecordCards, Show, Tab, Table, Tabs, Thread } from './blocks'
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
  permissions: { subscriptions: everything, paymentMethods: everything, invoices: everything, plans: everything, messages: everything },
  actions: (resource) => new Set({ subscriptions: ['cancel', 'upgrade'], paymentMethods: ['makeDefault'] }[resource] ?? []),
  ...overrides,
})

const types = (page: PageModel | undefined) => {
  const found: string[] = []
  if (page) walkTree(page.tree, (node) => found.push(node.type + (typeof (node.props.source ?? node.props.name) === 'string' ? `:${node.props.source ?? node.props.name}` : '')))
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

  it('leaves out a thread whose messages the caller cannot read, and a composer where they cannot write one', () => {
    const page: PageModel = {
      name: 'chat',
      title: 'Chat',
      tree: Page({ title: 'Chat', children: [Thread({ resource: 'messages', sender: 'author', time: 'sentAt', text: 'body' }), Composer({ resource: 'messages', field: 'body', values: { room: 'general' } })] }),
    }
    const shown = (overrides: Partial<CallerAccess>) => types(prunePage(page, [], access(overrides))).filter((type) => type !== 'Page')
    expect(shown({})).toEqual(['Thread', 'Composer'])
    expect(shown({ models: restricted({ messages: ['author'] }) })).toEqual(['Composer'])
    expect(shown({ permissions: { messages: { create: false, update: true } } })).toEqual(['Thread'])
    expect(shown({ models: restricted({}, { messages: ['room'] }) })).toEqual(['Thread'])
    expect(shown({ models: restricted({}, {}, ['messages']) })).toEqual([])
  })

  it('drops a thread’s status line and working indicator when the caller cannot read what they name', () => {
    const page: PageModel = {
      name: 'chat',
      title: 'Chat',
      tree: Page({ title: 'Chat', children: RecordCard({ resource: 'subscriptions', children: Thread({ resource: 'messages', sender: 'author', time: 'sentAt', text: 'body', status: 'room', working: "status = 'active'" }) }) }),
    }
    const thread = (models: CallerAccess['models']) => {
      const props = find(prunePage(page, [], access({ models })), 'Thread')?.props
      return props && { status: props.status, working: props.working }
    }
    expect(thread(restricted({}))).toEqual({ status: 'room', working: "status = 'active'" })
    expect(thread(restricted({ messages: ['room'], subscriptions: ['status'] }))).toEqual({ status: undefined, working: undefined })
  })

  it('drops a thread’s tool calls, or what of each the caller cannot read', () => {
    const calls = { resource: 'toolCalls', name: 'tool', time: 'calledAt', status: 'state', input: 'input', result: 'output', error: 'failure' }
    const page: PageModel = { name: 'chat', title: 'Chat', tree: Page({ title: 'Chat', children: Thread({ resource: 'messages', sender: 'author', time: 'sentAt', text: 'body', calls }) }) }
    const kept = (models: CallerAccess['models']) => find(prunePage(page, [], access({ models })), 'Thread')?.props.calls
    expect(kept(restricted({}))).toEqual(calls)
    expect(kept(restricted({ toolCalls: ['input', 'failure'] }))).toEqual({ resource: 'toolCalls', name: 'tool', time: 'calledAt', status: 'state', result: 'output' })
    expect(kept(restricted({ toolCalls: ['state'] }))).toBeUndefined()
    expect(kept(restricted({}, {}, ['toolCalls']))).toBeUndefined()
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

  it('narrows table columns with a priority by their name, keeping the priority', () => {
    const page: PageModel = { name: 'p', title: 'p', tree: Page({ title: 'p', children: Table({ resource: 'invoices', columns: [{ name: 'total', priority: 1 }, { name: 'status', priority: 2 }] }) }) }
    expect(find(prunePage(page, [], access({ models: restricted({ invoices: ['total'] }) })), 'Table')!.props.columns).toEqual([{ name: 'status', priority: 2 }])
  })

  it("drops a table's row button that reads a hidden field or leads where the caller cannot go", () => {
    const button = { label: '{{status}}', to: { kind: 'record' as const, resource: 'invoices', key: '{{id}}', tab: 'Payments' } }
    const page: PageModel = { name: 'p', title: 'p', tree: Page({ title: 'p', children: Table({ resource: 'invoices', button }) }) }
    const shown = (models: CallerAccess['models']) => find(prunePage(page, [], access({ models })), 'Table')!.props
    expect(shown(restricted({}))).toEqual({ resource: 'invoices', button })
    expect(shown(restricted({ invoices: ['status'] }))).toEqual({ resource: 'invoices' })
    const elsewhere: PageModel = { name: 'p', title: 'p', tree: Page({ title: 'p', children: Table({ resource: 'invoices', button: { label: 'Plan', to: { kind: 'list', resource: 'plans' } } }) }) }
    expect(find(prunePage(elsewhere, [], access({ models: restricted({}, {}, ['plans']) })), 'Table')!.props).toEqual({ resource: 'invoices' })
  })

  it("drops a table's row button whose tab or outside page comes from a hidden field", () => {
    const shown = (button: RowButtonModel, models: CallerAccess['models']) => find(prunePage({ name: 'p', title: 'p', tree: Page({ title: 'p', children: Table({ resource: 'invoices', button }) }) }, [], access({ models })), 'Table')!.props
    const tab: RowButtonModel = { label: 'Open', to: { kind: 'record', resource: 'invoices', key: '{{id}}', tab: '{{status}}' } }
    const outside: RowButtonModel = { label: 'Pay', href: '{{number}}' }
    expect(shown(tab, restricted({}))).toEqual({ resource: 'invoices', button: tab })
    expect(shown(tab, restricted({ invoices: ['status'] }))).toEqual({ resource: 'invoices' })
    expect(shown(outside, restricted({}))).toEqual({ resource: 'invoices', button: outside })
    expect(shown(outside, restricted({ invoices: ['number'] }))).toEqual({ resource: 'invoices' })
    expect(shown([outside, tab], restricted({ invoices: ['number'] }))).toEqual({ resource: 'invoices', button: [tab] })
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

  it('leaves out an image whose function the caller may not call', () => {
    const page: PageModel = { name: 'p', title: 'p', tree: Page({ title: 'p', children: [Image({ function: 'system-map', alt: 'The system map' }), Image({ function: 'billing-chart' })] }) }
    const pruned = prunePage(page, [], access({ functions: (name) => name === 'system-map' }))
    expect(pruned?.tree.children).toEqual([Image({ function: 'system-map', alt: 'The system map' })])
    expect(types(prunePage(page, [], access()))).toEqual(['Page'])
  })

  it('keeps a fixed image for everyone', () => {
    const page: PageModel = { name: 'p', title: 'p', tree: Page({ title: 'p', children: [Image({ src: '/logo.svg', alt: 'Logo', className: 'size-16' })] }) }
    expect(prunePage(page, [], access())?.tree.children).toEqual([Image({ src: '/logo.svg', alt: 'Logo', className: 'size-16' })])
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
          RecordCard({ resource: 'subscriptions', children: Link({ to: { kind: 'record', resource: 'plans', key: '{{plan}}' }, children: 'Plan' }) }),
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

  it('prunes a custom component\'s fallback like the rest of the tree, keeping an emptied one as none', () => {
    const Sparkline = component('Sparkline', { fallback: [Table({ resource: 'invoices' }), 'See the invoices'] })
    const Badge = component('Badge', { fallback: Table({ resource: 'invoices' }) })
    const page: PageModel = { name: 'p', title: 'p', tree: Page({ title: 'p', children: [Sparkline({}), Badge({})] }) }
    expect(types(prunePage(page, [], access()))).toEqual(['Page', 'Sparkline', 'Table', 'Badge', 'Table'])
    const pruned = prunePage(page, [], access({ models: restricted({}, {}, ['invoices']) }))
    expect(find(pruned, 'Sparkline')?.fallback).toEqual(['See the invoices'])
    expect(find(pruned, 'Badge')?.fallback).toEqual([])
  })

  it('leaves out a tab whose every element the caller cannot see, and tabs left with none', () => {
    const page: PageModel = {
      name: 'account',
      title: 'Account',
      tree: Page({
        title: 'Account',
        children: Tabs({
          children: [
            Tab({ name: 'profile', label: 'Profile', children: Card({ title: 'About you' }) }),
            Tab({ name: 'billing', label: 'Billing', children: Table({ resource: 'invoices' }) }),
          ],
        }),
      }),
    }
    expect(types(prunePage(page, [], access()))).toEqual(['Page', 'Tabs', 'Tab:profile', 'Card', 'Tab:billing', 'Table'])
    expect(types(prunePage(page, [], access({ models: restricted({}, {}, ['invoices']) })))).toEqual(['Page', 'Tabs', 'Tab:profile', 'Card'])
    const billingOnly: PageModel = { ...page, tree: Page({ title: 'Account', children: Tabs({ children: Tab({ name: 'billing', label: 'Billing', children: Table({ resource: 'invoices' }) }) }) }) }
    expect(types(prunePage(billingOnly, [], access({ models: restricted({}, {}, ['invoices']) })))).toEqual(['Page'])
  })
})

describe('placeholders', () => {
  const invoicesOf = (filter: string): PageModel => ({ name: 'p', title: 'P', tree: Page({ title: 'P', children: RecordCard({ resource: 'subscriptions', children: Table({ resource: 'invoices', filter }) }) }) })

  it('keeps a filter whose slot stands in for a value its field type would refuse', () => {
    expect(types(prunePage(invoicesOf(`status = '{{status}}'`), [], access()))).toContain('Table')
  })

  it('leaves out an element whose slot reads a field the caller cannot read', () => {
    expect(types(prunePage(invoicesOf(`status = '{{status}}'`), [], access({ models: restricted({ subscriptions: ['status'] }) })))).not.toContain('Table')
  })
})
