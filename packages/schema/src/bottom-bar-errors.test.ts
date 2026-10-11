import { describe, expect, it } from 'vitest'
import { bottomBarErrors } from './bottom-bar-errors'
import type { BottomBarModel } from './model'

const names = { resources: ['orders', 'stockMoves'], pages: ['overview'], roles: ['admin', 'sales', 'warehouse'] }
const bar = (label: string, roles: string[], items: BottomBarModel['items'] = [{ kind: 'resource', resource: 'orders', label: 'Orders' }]): BottomBarModel => ({ label, roles, items })

describe('bottomBarErrors', () => {
  it('accepts bars that fit the app', () => {
    const items: BottomBarModel['items'] = [{ kind: 'page', page: 'overview', label: 'Overview' }, { kind: 'link', label: 'Help', href: 'https://example.test' }]
    expect(bottomBarErrors([bar('Sales', ['sales'], items), bar('Warehouse', ['warehouse'])], names)).toEqual([])
    expect(bottomBarErrors([], names)).toEqual([])
  })

  it('refuses a resource or page that does not exist', () => {
    expect(bottomBarErrors([bar('Sales', ['sales'], [{ kind: 'resource', resource: 'nope', label: 'Nope' }, { kind: 'page', page: 'gone', label: 'Gone' }])], names)).toEqual([
      'Bottom bar "Sales": resource "nope" does not exist',
      'Bottom bar "Sales": page "gone" does not exist',
    ])
  })

  it('refuses unknown roles, and a bar without roles', () => {
    expect(bottomBarErrors([bar('Ghosts', ['ghost']), bar('Nobody', [])], names)).toEqual([
      'Bottom bar "Ghosts": role "ghost" is not one of the roles: admin, sales, warehouse',
      'Bottom bar "Nobody": needs at least one role',
    ])
  })

  it('accepts any role when the app does not declare its roles', () => {
    expect(bottomBarErrors([bar('Ghosts', ['ghost'])], { resources: ['orders'], pages: [] })).toEqual([])
  })

  it('refuses more items than fit beside "More", and none at all', () => {
    const five = Array.from({ length: 5 }, () => ({ kind: 'resource' as const, resource: 'orders', label: 'Orders' }))
    expect(bottomBarErrors([bar('Sales', ['sales'], five), bar('Warehouse', ['warehouse'], [])], names)).toEqual([
      'Bottom bar "Sales": has 5 items; at most 4 fit beside "More"',
      'Bottom bar "Warehouse": needs at least one item',
    ])
  })

  it('refuses a role in two bars, and two bars with one label', () => {
    expect(bottomBarErrors([bar('Sales', ['sales', 'admin']), bar('Floor', ['warehouse', 'admin']), bar('Sales', ['warehouse'])], names)).toEqual([
      'Bottom bars "Sales" and "Floor" both name role "admin"; a role belongs to one bottom bar',
      'Two bottom bars are labelled "Sales"; give each its own label',
      'Bottom bars "Floor" and "Sales" both name role "warehouse"; a role belongs to one bottom bar',
    ])
  })
})
