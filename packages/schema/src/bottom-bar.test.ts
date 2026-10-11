import { describe, expect, it } from 'vitest'
import { bottomBar, bottomBarFor } from './bottom-bar'
import type { BottomBarModel } from './model'

describe('bottomBar', () => {
  it('builds resource, page and link items in order, for its roles', () => {
    const bar = bottomBar({ label: 'Warehouse', roles: ['warehouse', 'manager'] }, (m) => [
      m.resource('stockMoves', { label: 'Moves', icon: 'file-text' }),
      m.page('picking', { label: 'Picking' }),
      m.link('Help', 'https://docs.example.test', { icon: 'life-buoy' }),
    ])
    expect(bar.toBottomBarModel()).toEqual({
      label: 'Warehouse',
      roles: ['warehouse', 'manager'],
      items: [
        { kind: 'resource', resource: 'stockMoves', label: 'Moves', icon: 'file-text' },
        { kind: 'page', page: 'picking', label: 'Picking' },
        { kind: 'link', label: 'Help', href: 'https://docs.example.test', icon: 'life-buoy' },
      ],
    })
  })

  it('hands out a copy, so callers cannot change the bar', () => {
    const roles = ['sales']
    const bar = bottomBar({ label: 'Sales', roles }, (m) => [m.resource('orders', { label: 'Orders' })])
    roles.push('admin')
    bar.toBottomBarModel().items.pop()
    expect(bar.toBottomBarModel()).toMatchObject({ roles: ['sales'], items: [{ resource: 'orders' }] })
  })

  it('accepts only web and mail links', () => {
    expect(() => bottomBar({ label: 'Sales', roles: ['sales'] }, (m) => [m.link('Mail', 'mailto:help@example.test')])).not.toThrow()
    expect(() => bottomBar({ label: 'Sales', roles: ['sales'] }, (m) => [m.link('Bad', 'javascript:alert(1)')])).toThrow('Bottom bar link "Bad": href must start with')
  })
})

describe('bottomBarFor', () => {
  const bars: BottomBarModel[] = [
    { label: 'Warehouse', roles: ['warehouse'], items: [] },
    { label: 'Sales', roles: ['sales', 'manager'], items: [] },
  ]

  it('is the bar that names the role', () => {
    expect(bottomBarFor(bars, 'manager')?.label).toBe('Sales')
    expect(bottomBarFor(bars, 'warehouse')?.label).toBe('Warehouse')
  })

  it('is none when no bar names the role, or there is no role', () => {
    expect(bottomBarFor(bars, 'admin')).toBeUndefined()
    expect(bottomBarFor([], 'sales')).toBeUndefined()
    expect(bottomBarFor(bars, undefined)).toBeUndefined()
  })
})
