/** What a server function tells open pages with: `refresh({ user })` once a person's access changed. */
export type LiveRefresh = {
  /**
   * Tells the open pages of `user`, by their id, to read what they show again, which gives them new live tokens for
   * their access as it is now: call it once the change of their roles or memberships committed. Subqueries of access
   * rules are evaluated when a token is issued, so a token made before stays as it was until then.
   */
  refresh: (options: { user: string }) => Promise<void>
}

/** Refreshes through `write`, the notices' writer, or does nothing for an app without live resources, whose pages hold no tokens. */
export const liveRefresh = (write: ((userIds: readonly string[]) => Promise<void>) | undefined): LiveRefresh => ({
  refresh: async ({ user }) => {
    if (!write) return
    await write([user])
  },
})
