/** The users who turned push off on this device themselves, whom the app does not register again by itself. */
export type PushKeptOff = {
  has: (userId: string) => boolean
  add: (userId: string) => void
  remove: (userId: string) => void
}

const key = 'protobase:push-kept-off'

/**
 * The users who turned push off, in the `storage` it reads when asked, under one key. Storage that cannot be read
 * keeps no one off, and one that cannot be written forgets the choice: the worst either does is register push the
 * user turned off again.
 */
export const storagePushKeptOff = (storage: () => Pick<Storage, 'getItem' | 'setItem'>): PushKeptOff => {
  const read = (): string[] => {
    try {
      const ids: unknown = JSON.parse(storage().getItem(key) ?? '[]')
      return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : []
    } catch {
      return []
    }
  }
  const write = (ids: string[]) => {
    try {
      storage().setItem(key, JSON.stringify(ids))
    } catch {
      return
    }
  }
  return {
    has: (userId) => read().includes(userId),
    add: (userId) => write([...read().filter((id) => id !== userId), userId]),
    remove: (userId) => write(read().filter((id) => id !== userId)),
  }
}
