import type { ModuleId } from './names/modules'

/**
 * Refuses a platform sign-in provider that signs in devices while their module is off, as the store then has no tables
 * for them: only one from the environment can, since one of `signInProviders` with `devices: true` turns the module on.
 */
export const checkDeviceSignIn = (providers: readonly { provider: string; devices: boolean }[], modules: readonly ModuleId[]) => {
  if (modules.includes('platform_devices')) return
  const device = providers.find(({ devices }) => devices)
  if (!device) return
  throw new Error(`The platform sign-in provider "${device.provider}" signs in devices while auth.signInDevices is off: turn on auth.signInDevices in protobase.config.ts, then write its migration with \`protobase migration\` and apply it`)
}
