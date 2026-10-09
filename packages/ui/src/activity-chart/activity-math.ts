export type ActivityPoint = { at: number; count: number }

export const totalCount = (series: ActivityPoint[]) => series.reduce((sum, point) => sum + point.count, 0)

/** Change of the second half of the series against the first half, in percent. */
export const halfOverHalfDelta = (series: ActivityPoint[]) => {
  const middle = Math.floor(series.length / 2)
  const earlier = totalCount(series.slice(0, middle))
  const later = totalCount(series.slice(series.length - middle))
  return earlier === 0 ? 0 : ((later - earlier) / earlier) * 100
}
