import type { listingStatuses } from '../config/listings/data'

type ListingStatus = (typeof listingStatuses)[number]

/**
 * The statuses of a home still on offer, which alerts tell of: available, or under offer, which may still fall through.
 * A home sold or let is not new to anyone looking.
 */
export const offeredStatuses = ['available', 'under_offer'] as const satisfies readonly ListingStatus[]

/** Whether a listing with this status is still on offer. */
export const isOffered = (status: string) => (offeredStatuses as readonly string[]).includes(status)
