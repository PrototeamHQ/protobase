import { newHandle } from '../postgres-store'
import type { StoredCredential } from '../credential'
import type { RelayBinding, RelayStore } from '../store'

const hourOf = (at: number) => Math.floor(at / 3_600_000)

/** The relay's store in memory, for unit tests, on the clock `now`. */
export const memoryRelayStore = (now: () => number = Date.now) => {
  const handles = new Map<string, RelayBinding>()
  const credentials = new Map<string, StoredCredential & { createdAt: Date; hour?: number; sent?: number }>()

  const store: RelayStore = {
    register: async (registration) => {
      const found = [...handles.values()].find((binding) => binding.token === registration.token && binding.origin === registration.origin)
      const handle = found?.handle ?? newHandle()
      handles.set(handle, { ...registration, handle })
      return handle
    },
    bindings: async (wanted) => wanted.flatMap((handle) => (handles.has(handle) ? [handles.get(handle)!] : [])),
    removeHandles: async (gone) => void gone.forEach((handle) => handles.delete(handle)),
    credential: async (id) => {
      const found = credentials.get(id)
      return found && { id: found.id, origin: found.origin, secretHash: found.secretHash }
    },
    charge: async (id, devices, perHour) => {
      const found = credentials.get(id)
      if (!found) return false
      const hour = hourOf(now())
      const sent = (found.hour === hour ? found.sent! : 0) + devices
      if (sent > perHour) return false
      Object.assign(found, { hour, sent })
      return true
    },
    addCredential: async (credential) => void credentials.set(credential.id, { ...credential, createdAt: new Date(now()) }),
    removeCredential: async (id) => credentials.delete(id),
    listCredentials: async () => [...credentials.values()].map(({ id, origin, createdAt }) => ({ id, origin, createdAt })),
  }
  return { store, handles }
}
