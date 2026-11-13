/** What a user chose for push on this device themselves: turned it on, or turned it off. */
export type PushChoice = 'on' | 'off'

/** Each user's own choice for push on this device, which the app goes by before registering them by itself. */
export type PushChoices = {
  /** The user's choice, `undefined` when they made none, or `unknown` when the storage cannot be read. */
  of: (userId: string) => PushChoice | 'unknown' | undefined
  /** Keeps the choice, and answers whether it lasts beyond this session: false when the storage could not be written. */
  set: (userId: string, choice: PushChoice) => boolean
}

const key = 'protobase:push-choices'

/**
 * The users' choices, in the `storage` it reads when asked, under one key, and for this session in memory as well, so
 * a choice holds until the app closes even when the storage could not be written. Storage that cannot be read
 * answers `unknown`, which is no choice to act on.
 */
export const storagePushChoices = (storage: () => Pick<Storage, 'getItem' | 'setItem'>): PushChoices => {
  const session = new Map<string, PushChoice>()
  // What the storage holds, or `undefined` when it cannot be read.
  const read = (): Record<string, unknown> | undefined => {
    try {
      const choices: unknown = JSON.parse(storage().getItem(key) ?? '{}')
      return typeof choices === 'object' && choices !== null && !Array.isArray(choices) ? (choices as Record<string, unknown>) : undefined
    } catch {
      return
    }
  }
  return {
    of: (userId) => {
      const kept = session.get(userId)
      if (kept) return kept
      const stored = read()
      if (!stored) return 'unknown'
      const choice = Object.hasOwn(stored, userId) ? stored[userId] : undefined
      return choice === 'on' || choice === 'off' ? choice : undefined
    },
    set: (userId, choice) => {
      session.set(userId, choice)
      try {
        storage().setItem(key, JSON.stringify({ ...read(), [userId]: choice }))
        return true
      } catch {
        return false
      }
    },
  }
}
