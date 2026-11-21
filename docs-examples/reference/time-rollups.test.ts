import { describe, expect, it } from 'vitest'
import { checkPages } from '@protobase/layout'
import { f, resource } from '@protobase/schema'
import { energy } from './time-rollups-page'
import { readings, readingsHourly } from './time-rollups'

const meters = resource('meters').table('metering.meters').fields({ id: f.integer(), name: f.text() }).primaryKey((r) => r.id)

describe('the time rollups example', () => {
  it('declares an hourly rollup per organization and meter', () => {
    const model = readingsHourly.toModel()
    expect(Object.keys(model.fields)).toEqual(['id', 'bucket', 'organization_id', 'meter_id', 'events', 'watts_sum', 'watts_max', 'cost_sum'])
    expect(model.tenant).toBe('organization_id')
  })

  it('has a dashboard whose charts read the rollup', () => {
    const models = Object.fromEntries([readings, readingsHourly, meters].map((source) => [source.toModel().name, source.toModel()]))
    expect(checkPages([energy.toModel()], { models, actions: () => new Set() })).toEqual([])
  })
})
