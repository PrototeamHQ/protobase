export const scales = {
  small: { properties: 60, ticketsPerUnit: 1.2 },
  medium: { properties: 2_000, ticketsPerUnit: 1.2 },
  large: { properties: 10_000, ticketsPerUnit: 1.2 },
} as const

export type ScaleName = keyof typeof scales

export const isScale = (name: string | undefined): name is ScaleName => name !== undefined && name in scales
