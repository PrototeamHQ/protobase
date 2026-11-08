import type { ApnsEnvironment } from '../notifications/device'
import type { StoredCredential } from './credential'

/** A device token as a phone registers it with the relay, for one workspace origin. */
export type RelayRegistration = { kind: 'apns'; token: string; environment: ApnsEnvironment; origin: string } | { kind: 'fcm'; token: string; environment: null; origin: string }

/** A handle the relay gave, with the device token and the origin it is bound to. */
export type RelayBinding = RelayRegistration & { handle: string }

/**
 * Where the relay keeps its handles and credentials. `register` answers the handle the token already has for the
 * origin, or a new one. `charge` counts `devices` sends against the credential's clock hour that starts at `hour`,
 * or against the later hour it already counts in, and answers `false`, counting nothing, when that would take the hour
 * over `perHour`.
 */
export type RelayStore = {
  register: (registration: RelayRegistration) => Promise<string>
  bindings: (handles: readonly string[]) => Promise<RelayBinding[]>
  removeHandles: (handles: readonly string[]) => Promise<void>
  credential: (id: string) => Promise<StoredCredential | undefined>
  charge: (id: string, devices: number, perHour: number, hour: Date) => Promise<boolean>
  addCredential: (credential: StoredCredential) => Promise<void>
  removeCredential: (id: string) => Promise<boolean>
  listCredentials: () => Promise<{ id: string; origin: string; createdAt: Date }[]>
}
