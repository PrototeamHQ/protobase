import { describe, expect, it } from 'vitest'
import { conventionConfig } from './convention'

describe('conventionConfig', () => {
  it('adds ui.ts exports the index does not export, prefixed with their folder', () => {
    const ordersView = { view: 'orders' }
    const extraView = { view: 'extra' }
    const config = conventionConfig({ ordersView }, [['orders', { ordersView, extraView }]])
    expect(config).toEqual({ ordersView, 'orders:extraView': extraView })
  })

  it('keeps the index alone when there are no ui.ts files', () => {
    const orders = { resource: 'orders' }
    expect(conventionConfig({ orders }, [])).toEqual({ orders })
  })
})
