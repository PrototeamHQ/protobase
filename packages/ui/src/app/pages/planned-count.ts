import type { Planned } from './planned'

/** A planned count: the total of its read, or inside a repeated record the count of that record's group, 0 without one. */
export const plannedCount = (planned: Planned) => planned.total ?? Number(planned.rows[0]?.count ?? 0)
