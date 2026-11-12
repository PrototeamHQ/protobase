import type { ChartRange } from '@protobase/schema'
import { text } from './messages'

/** The line over a trend: how many records its bars hold together, over its range, such as "4 in the last 90 days". */
export const trendSummary = (total: number, range: ChartRange) => text(`total_${range}`, { count: total })
