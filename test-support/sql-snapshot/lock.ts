/** One holder at a time, in the order they asked: the single connection a snapshot database has. */
export const createLock = () => {
  let tail = Promise.resolve()
  return {
    /** Resolves, once the holders before have released, with the function that releases this hold. */
    acquire: () => {
      let release!: () => void
      const held = new Promise<void>((resolve) => (release = resolve))
      const turn = tail.then(() => release)
      tail = tail.then(() => held)
      return turn
    },
  }
}
