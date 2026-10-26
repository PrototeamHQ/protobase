export const scales = {
  small: { companies: 200, orders: 2_000, moves: 20_000, productsPerOrg: 100 },
  medium: { companies: 20_000, orders: 200_000, moves: 1_000_000, productsPerOrg: 1_000 },
  large: { companies: 20_000, orders: 200_000, moves: 10_000_000, productsPerOrg: 1_000 },
} as const

export type ScaleName = keyof typeof scales

export const isScale = (name: string | undefined): name is ScaleName => name !== undefined && name in scales
