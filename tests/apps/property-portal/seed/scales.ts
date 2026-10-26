export const scales = {
  small: { listings: 400, agencies: 30, members: 24 },
  medium: { listings: 20_000, agencies: 600, members: 2_000 },
  large: { listings: 100_000, agencies: 2_500, members: 10_000 },
} as const

export type ScaleName = keyof typeof scales

export const isScale = (name: string | undefined): name is ScaleName => name !== undefined && name in scales
