import { connect } from '../db/connection'
import { baseOrganization } from './base-organization'
import { amenities } from './data/reference'

// `db:seed:base [--name <app name>]`: what a new app starts with, the amenities and organization 1. Rows already
// there stay as they are, so it can run again and after the sample seed (`db:seed`).
const flag = process.argv.indexOf('--name')
const organization = baseOrganization(flag === -1 ? 'Real estate' : (process.argv[flag + 1] ?? ''))

const sql = connect({ max: 1 })
await sql.begin(async (tx) => {
  await tx`insert into portfolio.amenities ${tx(amenities.map(([code, name]) => ({ code, name })))} on conflict do nothing`
  await tx`insert into core.organizations ${tx(organization)} on conflict do nothing`
  // An explicit id leaves the identity sequence behind, so the next organization would take id 1 again.
  await tx`select setval(pg_get_serial_sequence('core.organizations', 'id'), (select max(id) from core.organizations))`
})
await sql.end()
console.log(`seeded the base data of ${organization.name}`)
