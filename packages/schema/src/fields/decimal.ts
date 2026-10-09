import { z } from 'zod'

const shape = /^-?(\d*)(?:\.(\d+))?$/

export const decimal = {
  type: 'decimal',
  constraints: [],
  build: (o: { precision?: number; scale?: number }) => {
    if (o.precision === undefined || o.scale === undefined) {
      throw new Error('f.decimal requires precision and scale')
    }
    const maxInteger = o.precision - o.scale
    const maxFraction = o.scale
    return z.string().refine(
      (v) => {
        const match = shape.exec(v)
        if (!match) return false
        const integer = (match[1] ?? '').replace(/^0+/, '')
        const fraction = match[2] ?? ''
        if (!(match[1] || fraction)) return false
        return integer.length <= maxInteger && fraction.length <= maxFraction
      },
      { message: `Expected a decimal string with at most ${o.precision} digits, ${o.scale} after the point` },
    )
  },
} as const
