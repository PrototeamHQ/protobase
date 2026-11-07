import type { BadgeTone } from '../../../primitives/badge'

/**
 * How a state did in a run, as its node shows it: how its last step ended, `retrying` while it waits to be tried again,
 * or `current` while the run is on it.
 */
export type NodeStatus = 'succeeded' | 'caught' | 'retrying' | 'failed' | 'current'

/** A node's mark in a run: its status, how many steps it took, every try and item counted, and whether the step changed since. */
export type NodeTrace = { status: NodeStatus; steps: number; changed?: boolean }

export const nodeTones: Record<NodeStatus, BadgeTone> = { succeeded: 'green', caught: 'amber', retrying: 'amber', failed: 'red', current: 'blue' }
