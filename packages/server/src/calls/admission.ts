/** Why a member is not let into a call: removed from it, the call is full, or the call they resume has ended. */
export type Refusal = 'removed' | 'full' | 'ended'

export type AdmissionInput = {
  /** Whether the member was removed from this call. */
  removed: boolean
  /** Who is in the call now. */
  present: readonly string[]
  member: string
  maxMembers: number
}

/**
 * Whether a member may come into a call they did not resume from an ended one: never once removed; a member already
 * in it takes their place over, as from another tab; anyone else while the call has room.
 */
export const admission = ({ removed, present, member, maxMembers }: AdmissionInput): Refusal | undefined => {
  if (removed) return 'removed'
  if (present.includes(member)) return
  if (present.length >= maxMembers) return 'full'
  return
}
