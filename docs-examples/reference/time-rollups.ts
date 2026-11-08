import { f, resource } from '@protobase/schema'

// Meter readings, millions of rows, and their hourly rollup per organization and meter.

/** metering.readings: one row per reading. */
export const readings = resource('readings')
  .table('metering.readings')
  .fields({
    id: f.bigint().readOnly().dbDefault(),
    organization_id: f.integer().filterable(),
    meter_id: f.relation('meters').filterable(),
    taken_at: f.timestamp().filterable().sortable(),
    watts: f.integer(),
    cost: f.decimal({ precision: 10, scale: 4 }),
  })
  .primaryKey((r) => r.id)
  .tenant((r) => r.organization_id)

/** metering.readings_hourly: one row per hour, organization and meter, which the migration creates. */
export const readingsHourly = resource('readings_hourly')
  .table('metering.readings_hourly')
  .bucketsOf(readings, {
    time: (r) => r.taken_at,
    every: 'hour',
    by: (r) => [r.organization_id, r.meter_id],
    measures: { watts: ['sum', 'max'], cost: ['sum'] },
    late: '2 hours',
  })
  // Its access is its own: every member of an organization reads its totals.
  .access({ read: () => true })
