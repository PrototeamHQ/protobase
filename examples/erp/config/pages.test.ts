import { describe, expect, it } from 'vitest'
import { checkPages } from '@protobase/layout'
import { configExports } from '@protobase/server'
import * as config from './index'

describe('ERP pages', () => {
  it('name only resources, fields, filters and actions the ERP has', () => {
    const { resources, views, pages } = configExports(config)
    const models = Object.fromEntries(resources.map((source) => [source.toModel().name, source.toModel()]))
    const actions = (resource: string) => new Set(views.map((view) => view.toModel()).filter((view) => view.resource === resource).flatMap((view) => view.actions.map((action) => action.name)))
    expect(pages.map((entry) => entry.name)).toEqual(['overview'])
    expect(() => checkPages(pages.map((entry) => entry.toModel()), { models, actions })).not.toThrow()
  })
})
