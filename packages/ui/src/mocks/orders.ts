import { customerAt, customerCount } from './customers'
import { int, mockNow, pick, rngAt, weighted } from './rng'
import { salesUsers } from './users'

export const orderCount = 48_213
export const orderStatuses = ['draft', 'confirmed', 'picking', 'shipped', 'delivered', 'cancelled'] as const
export type OrderStatus = (typeof orderStatuses)[number]

const statusFor = (index: number, roll: () => number): OrderStatus => {
  if (index < 12) return pick(roll, ['draft', 'confirmed', 'confirmed', 'picking'] as const)
  if (index < 60) return pick(roll, ['confirmed', 'picking', 'shipped', 'shipped'] as const)
  return weighted(roll, [['delivered', 82], ['shipped', 6], ['cancelled', 6], ['picking', 3], ['confirmed', 3]] as const)
}

export const orderAt = (index: number) => {
  const rand = rngAt(23, index)
  const customer = customerAt(int(rand, 0, customerCount - 1))
  const number = orderCount - index
  return {
    id: `o${number}`,
    number: `SO-2026-${String(number).padStart(6, '0')}`,
    customer: { id: customer.id, name: customer.name },
    country: customer.country,
    status: statusFor(index, rand),
    totalCents: Math.round(Math.exp(5.6 + rand() * 4.4)) * 10 + int(rand, 0, 9),
    discount: weighted(rand, [[0, 55], [5, 20], [10, 15], [15, 10]] as const),
    paid: rand() > 0.28 && index > 20,
    createdAt: mockNow - index * 210_000 - int(rand, 0, 200_000),
    owner: pick(rand, salesUsers).id,
    lines: int(rand, 1, 9),
  }
}

export type Order = ReturnType<typeof orderAt>
