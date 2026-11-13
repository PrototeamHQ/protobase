/** What a user chose for push on this device themselves: turned it on, or turned it off. */
export type PushChoice = 'on' | 'off'

/** Each user's own choice for push on this device, which the app goes by before registering them by itself. */
export type PushChoices = {
  of: (userId: string) => PushChoice | undefined
  set: (userId: string, choice: PushChoice) => void
}

const key = 'protobase:push-choices'

/**
 * The users' choices, in the `storage` it reads when asked, under one key. Storage that cannot be read knows no
 * choice, and one that cannot be written forgets it: the app then registers by itself only where the phone asked the
 * person for the permission.
 */
export const storagePushChoices = (storage: () => Pick<Storage, 'getItem' | 'setItem'>): PushChoices => {
  const read = (): Record<string, unknown> => {
    try {
      const choices: unknown = JSON.parse(storage().getItem(key) ?? '{}')
      return typeof choices === 'object' && choices !== null && !Array.isArray(choices) ? (choices as Record<string, unknown>) : {}
    } catch {
      return {}
    }
  }
  return {
    of: (userId) => {
      const stored = read()
      const choice = Object.hasOwn(stored, userId) ? stored[userId] : undefined
      return choice === 'on' || choice === 'off' ? choice : undefined
    },
    set: (userId, choice) => {
      try {
        storage().setItem(key, JSON.stringify({ ...read(), [userId]: choice }))
      } catch {
        return
      }
    },
  }
}
