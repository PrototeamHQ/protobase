import type { Admin } from '../types'

/** How long a read of the definitions version holds before a request reads it again, in milliseconds. */
export const versionCheckMs = 1000

export type LatestAdminInput = {
  /** The admin startup built, and the definitions version it was built from. */
  admin: Admin
  version: string
  /** Reads the definitions version; a failure fails the request that asked for the admin. */
  readVersion: () => Promise<string>
  /** The admin built anew from the definitions as they are now, or `current` when that fails. */
  rebuild: (current: Admin) => Promise<Admin>
  now?: () => number
}

/**
 * The latest admin built, the only one kept: a cache of one entry, swapped for one built anew when the definitions
 * version moved. `get(true)` reads the version at once, `get()` at most once a `versionCheckMs`; either waits for a read
 * or rebuild already running instead of starting another, so two requests never build twice. A request keeps the admin
 * it got until it is answered.
 */
export const latestAdmin = ({ admin, version, readVersion, rebuild, now = Date.now }: LatestAdminInput) => {
  let latest = { admin, version, checkedAt: now() }
  let checking: Promise<Admin> | undefined

  const check = async () => {
    const checkedAt = now()
    const read = await readVersion()
    if (read === latest.version) {
      latest = { ...latest, checkedAt }
      return latest.admin
    }
    // Recorded even when the rebuild kept the admin before, so a definition that does not build is reported once per change.
    latest = { admin: await rebuild(latest.admin), version: read, checkedAt }
    return latest.admin
  }

  const get = (atOnce = false) => {
    if (!atOnce && now() - latest.checkedAt < versionCheckMs) return Promise.resolve(latest.admin)
    checking ??= check().finally(() => {
      checking = undefined
    })
    return checking
  }

  return { get, current: () => latest.admin }
}
