import { z } from 'zod'

const digits = /^-?\d+$/
const min = -(2n ** 63n)
const max = 2n ** 63n - 1n

export const bigint = {
  type: 'bigint',
  constraints: [],
  build: () =>
    z.string().refine((v) => digits.test(v) && BigInt(v) >= min && BigInt(v) <= max, {
      message: 'Expected a 64-bit integer as a string',
    }),
} as const
