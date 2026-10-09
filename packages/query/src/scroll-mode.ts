export type ScrollMode = 'exact' | 'statistics' | 'sampled'

export const exactBelowRows = 100_000
export const statisticsUpToRows = 5_000_000

export const scrollMode = (rows: number): ScrollMode => {
  if (rows < exactBelowRows) return 'exact'
  if (rows <= statisticsUpToRows) return 'statistics'
  return 'sampled'
}
