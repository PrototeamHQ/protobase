import { describe, expect, it } from 'vitest'
import { checkPages } from '@protobase/layout'
import { configExports } from '@protobase/server'
import * as config from './index'

describe('real estate pages', () => {
  it('name only resources, fields, filters and actions the example has', () => {
    const { resources, views, pages } = configExports(config)
    const models = Object.fromEntries(resources.map((source) => [source.toModel().name, source.toModel()]))
    const actions = (resource: string) => new Set(views.map((view) => view.toModel()).filter((view) => view.resource === resource).flatMap((view) => view.actions.map((action) => action.name)))
    expect(pages.map((entry) => entry.name)).toEqual(['overview'])
    expect(() => checkPages(pages.map((entry) => entry.toModel()), { models, actions })).not.toThrow()
  })

  it('has a list and record view for every table', () => {
    const { resources, views } = configExports(config)
    const viewed = new Set(views.map((view) => view.toModel().resource))
    expect(resources.map((source) => source.toModel().name).filter((name) => !viewed.has(name))).toEqual([])
    expect(resources).toHaveLength(19)
  })

  it('lists a lease\'s rent charges on its page, newest period first, a year per page', () => {
    const { resources, views } = configExports(config)
    const charges = resources.map((source) => source.toModel()).find((model) => model.name === 'rentCharges')!
    const lease = views.map((view) => view.toModel()).find((view) => view.resource === 'leases')!
    const section = lease.layout.find((item) => item.kind === 'related' && item.title === 'Rent charges')
    expect(section).toMatchObject({ resource: 'rentCharges', field: 'leaseId', sort: 'period desc', pageSize: 12 })
    expect(section?.kind === 'related' && section.columns?.filter((column) => !Object.hasOwn(charges.fields, column))).toEqual([])
    expect(section?.kind === 'related' && section.columns?.slice(-2)).toEqual(['paidAmount', 'outstanding'])
  })

  it('shows what is still owed on a rent charge: a read-only, filterable column formatted like the amount', () => {
    const { resources, views } = configExports(config)
    const charges = resources.map((source) => source.toModel()).find((model) => model.name === 'rentCharges')!
    const view = views.map((entry) => entry.toModel()).find((entry) => entry.resource === 'rentCharges')!
    expect(charges.fields.outstanding).toMatchObject({ type: 'decimal', readOnly: true, filterable: true, sortable: true })
    expect(view.fields.outstanding).toMatchObject({ prefix: '€', decimals: 2 })
    expect(view.list?.columns.slice(-2)).toEqual(['paidAmount', 'outstanding'])
  })

  it('lists a rent charge\'s payments on its page, newest first', () => {
    const { resources, views } = configExports(config)
    const payments = resources.map((source) => source.toModel()).find((model) => model.name === 'payments')!
    const charge = views.map((view) => view.toModel()).find((view) => view.resource === 'rentCharges')!
    const section = charge.layout.find((item) => item.kind === 'related' && item.title === 'Payments')
    expect(section).toMatchObject({ resource: 'payments', field: 'chargeId', sort: 'paidOn desc', columns: ['paidOn', 'amount', 'method', 'reference'] })
    expect(section?.kind === 'related' && section.columns?.filter((column) => !Object.hasOwn(payments.fields, column))).toEqual([])
  })
})
