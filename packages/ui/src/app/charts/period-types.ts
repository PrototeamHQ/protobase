import type { ChartBucket } from '@protobase/layout'

export type Point = { at: number; value: number | null; count: number } & Record<string, number | null>

/** How long a chart's bucket is: a block's, or the minutes a record's chart of samples reads. */
export type PeriodBucket = ChartBucket | 'minute' | '5_minutes' | '15_minutes'
