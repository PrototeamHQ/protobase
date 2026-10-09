import type { Db } from '../../db/connection'
import { ledgerOf } from '../builders/ledger'
import { DAY, windowEnd } from '../calendar'
import { copyRows } from '../copy'
import { iso, isoDate, money, row } from '../format'
import type { World } from '../world'
import { leasesOf } from './leasing'

// Charges and payments are numbered as they stream; both passes walk the leases in the same order, so a payment
// finds its charge's id by counting along.
function* ledgers(world: World) {
  let chargeId = 1
  let paymentId = 1
  for (const org of world.orgs) {
    for (const lease of leasesOf(org)) {
      for (const charge of ledgerOf(org, lease)) {
        yield { org, lease, charge, chargeId: chargeId++, firstPaymentId: paymentId }
        paymentId += charge.payments.length
      }
    }
  }
}

function* chargeRows(world: World) {
  for (const { org, lease, charge, chargeId } of ledgers(world)) {
    const updatedAt = charge.payments.at(-1)?.paidOn ?? charge.createdAt
    yield row(chargeId, org.id, lease.id, isoDate(charge.period), isoDate(charge.dueOn), charge.description, money(charge.amountCents), money(charge.paidCents), iso(charge.createdAt), iso(Math.min(updatedAt + 10 * 3_600_000, windowEnd)))
  }
}

function* paymentRows(world: World) {
  for (const { org, lease, charge, chargeId, firstPaymentId } of ledgers(world)) {
    for (const [index, payment] of charge.payments.entries()) {
      const bookedAt = Math.min(payment.paidOn + DAY / 2, windowEnd)
      const reference = payment.method === 'direct_debit' ? `SEPA ${lease.number}` : `${lease.number} ${charge.description.toLowerCase()}`
      yield row(firstPaymentId + index, org.id, chargeId, isoDate(payment.paidOn), money(payment.amountCents), payment.method, reference, iso(bookedAt), iso(bookedAt))
    }
  }
}

export const seedBilling = async (sql: Db, world: World) => {
  await copyRows(sql, 'billing.rent_charges (id, organization_id, lease_id, period, due_on, description, amount, paid_amount, created_at, updated_at)', chargeRows(world))
  await copyRows(sql, 'billing.payments (id, organization_id, charge_id, paid_on, amount, method, reference, created_at, updated_at)', paymentRows(world))
}
