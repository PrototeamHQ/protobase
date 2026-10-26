import { DAY, addMonths, firstPeriod, lastPeriod, monthOf, windowEnd } from '../calendar'
import { int, pick, rngAt, weighted } from '../rng'
import type { Org } from '../world'
import { rentAt, type SeededLease } from './tenancy'

const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

type Payment = { paidOn: number; amountCents: number; method: 'direct_debit' | 'bank_transfer' | 'ideal' }

// How one charge of `amount` due on `due` gets paid, by the lease's kind of payer. Payments after the window's end
// have not happened yet. The parts of a charge never add up to more than the charge.
const paymentsFor = (payer: SeededLease['payer'], due: number, amount: number, stopped: boolean, rand: () => number): Payment[] => {
  const pay = (days: number, cents: number, method: Payment['method']) => ({ paidOn: due + days * DAY, amountCents: cents, method })
  const transfer = () => pick(rand, ['bank_transfer', 'bank_transfer', 'ideal'] as const)
  if (stopped) return []
  if (payer === 'punctual') return [pay(int(rand, 0, 3), amount, rand() < 0.8 ? 'direct_debit' : 'bank_transfer')]
  if (payer === 'late' || payer === 'defaulter') return [pay(int(rand, 3, 28), amount, transfer())]
  const kind = weighted(rand, [['late', 60], ['split', 32], ['short', 8]] as const)
  if (kind === 'late') return [pay(int(rand, 10, 60), amount, transfer())]
  const part = Math.round(amount * (0.3 + rand() * 0.5))
  if (kind === 'split') return [pay(int(rand, 5, 30), part, transfer()), pay(int(rand, 31, 90), amount - part, transfer())]
  return [pay(int(rand, 10, 60), part, transfer())]
}

/**
 * The monthly charges of a lease inside the window, each with the payments made on it by the window's end. A
 * defaulter stops paying for the last two to seven months of the lease (or of the window, while it runs).
 */
export const ledgerOf = (org: Org, lease: SeededLease) => {
  const rand = rngAt(org.seed + 12, lease.ordinal)
  const { start, end } = lease.tenancy
  const from = Math.max(firstPeriod, start)
  const to = end === null ? lastPeriod : Math.min(lastPeriod, monthOf(end))
  const stopFrom = lease.payer === 'defaulter' ? addMonths(to, -int(rand, 1, 6)) : Infinity
  const charges = []
  for (let period = from; period <= to; period = addMonths(period, 1)) {
    const date = new Date(period)
    const amountCents = rentAt(lease.startCents, start, period) + lease.serviceCents
    const payments = paymentsFor(lease.payer, period, amountCents, period >= stopFrom, rand).filter((payment) => payment.paidOn <= windowEnd)
    charges.push({
      period,
      dueOn: period,
      description: `Rent ${monthNames[date.getUTCMonth()]} ${date.getUTCFullYear()}`,
      amountCents,
      paidCents: payments.reduce((sum, payment) => sum + payment.amountCents, 0),
      payments,
      // The monthly run bills a week ahead.
      createdAt: Math.min(period - 7 * DAY + 6 * 3_600_000, windowEnd),
    })
  }
  return charges
}
