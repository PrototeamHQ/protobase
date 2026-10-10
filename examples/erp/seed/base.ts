import { connect } from '../db/connection'
import { seedAuthOrganizations } from './auth-organizations'
import { baseOrganization } from './base-organization'
import { countries, currencies } from './data/reference'

// `db:seed:base [--name <app name>]`: what a new app starts with, the countries, the currencies and organization 1,
// in the ERP's tables and in the auth schema's.
// Rows already there stay as they are, so it can run again and after the sample seed (`db:seed`).
const flag = process.argv.indexOf('--name')
const organization = baseOrganization(flag === -1 ? 'ERP' : (process.argv[flag + 1] ?? ''))

const sql = connect({ max: 1 })
await sql.begin(async (tx) => {
  await tx`insert into core.countries ${tx(countries.map(([code, name, euMember]) => ({ code, name, eu_member: euMember })))} on conflict do nothing`
  await tx`insert into core.currencies ${tx(currencies.map(([code, name, symbol, decimals]) => ({ code, name, symbol, decimals })))} on conflict do nothing`
  await tx`insert into core.organizations ${tx(organization)} on conflict do nothing`
  // An explicit id leaves the identity sequence behind, so the next organization would take id 1 again.
  await tx`select setval(pg_get_serial_sequence('core.organizations', 'id'), (select max(id) from core.organizations))`
  await seedAuthOrganizations(tx, [organization])
})
await sql.end()
console.log(`seeded the base data of ${organization.name}`)
