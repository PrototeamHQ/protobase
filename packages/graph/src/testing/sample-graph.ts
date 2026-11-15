import { f, resource } from '@protobase/schema'

// Ten services in three groups and the links between them, with one link to a service that is not among them

export const services = resource('services')
  .table('services')
  .fields({ id: f.integer().readOnly(), name: f.text(), area: f.enum(['edge', 'core', 'data']), health: f.enum(['up', 'degraded', 'down']) })
  .primaryKey((r) => r.id)
  .toModel()

export const links = resource('links').table('links').fields({ id: f.integer().readOnly(), from_id: f.integer(), to_id: f.integer() }).primaryKey((r) => r.id).toModel()

export const models = { services, links }

export const serviceRows = [
  { id: 1, name: 'Gateway', area: 'edge', health: 'up' },
  { id: 2, name: 'Sign-in', area: 'edge', health: 'up' },
  { id: 3, name: 'Web app', area: 'edge', health: 'degraded' },
  { id: 4, name: 'Orders', area: 'core', health: 'up' },
  { id: 5, name: 'Billing', area: 'core', health: 'down' },
  { id: 6, name: 'Search', area: 'core', health: 'up' },
  { id: 7, name: 'Mailer', area: 'core', health: 'degraded' },
  { id: 8, name: 'Database', area: 'data', health: 'up' },
  { id: 9, name: 'Queue', area: 'data', health: 'up' },
  { id: 10, name: 'Files', area: 'data', health: 'up' },
]

export const linkRows = [
  { id: 101, from_id: 1, to_id: 4 },
  { id: 102, from_id: 1, to_id: 6 },
  { id: 103, from_id: 2, to_id: 8 },
  { id: 104, from_id: 3, to_id: 1 },
  { id: 105, from_id: 4, to_id: 5 },
  { id: 106, from_id: 4, to_id: 9 },
  { id: 107, from_id: 5, to_id: 7 },
  { id: 108, from_id: 5, to_id: 8 },
  { id: 109, from_id: 6, to_id: 8 },
  { id: 110, from_id: 7, to_id: 9 },
  { id: 111, from_id: 9, to_id: 10 },
  { id: 112, from_id: 4, to_id: 99 },
]

export const sampleFields = { label: 'name', group: 'area', status: 'health', source: 'from_id', target: 'to_id' }
