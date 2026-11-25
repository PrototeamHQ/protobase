import { builtInModules, type ModuleId } from './modules'

/** Refuses a set of modules with one on while a module it requires is off, naming both. */
export const checkRequiredModules = (on: readonly ModuleId[]) => {
  for (const module of builtInModules.filter(({ id }) => on.includes(id))) {
    const off = module.requires.find((required) => !on.includes(required))
    if (off !== undefined) throw new Error(`The ${module.id} module is on while ${off}, which it requires, is off: turn ${off} on, or ${module.id} off`)
  }
}

/** Every module, in the order they require one another. */
export const allModules: ModuleId[] = builtInModules.map(({ id }) => id)

/** What `modulesOf` reads of the app's auth: the switches of the features whose modules have tables of their own. */
export type ModuleSwitches = { organizations?: unknown; mcp?: unknown; openIdProvider?: unknown; personalAccessTokens?: unknown; personalMail?: readonly unknown[]; signInProviders?: readonly { devices?: boolean }[]; signInDevices?: boolean }

/**
 * The modules the app's auth turns on, the one place the CLI's migrations and the runtime read them from: each
 * feature's module is on while its switch is, `mcp` with the MCP endpoint or the OpenID provider, whose tables are the
 * same, `mail_senders` with personal mail, and `platform_devices` with `signInDevices` or a provider of
 * `signInProviders` that signs in devices: the config alone, as a migration is written without the platform's
 * environment. The others are always on: sign-in itself, two-factor authentication, passkeys, the sign-in policy and
 * staff sign-in have no switch.
 */
export const modulesOf = (settings: ModuleSwitches): ModuleId[] => {
  const on: Record<ModuleId, boolean> = {
    auth: true,
    two_factor: true,
    passkeys: true,
    sign_in_policy: true,
    staff_sign_in: true,
    platform_devices: settings.signInDevices === true || (settings.signInProviders ?? []).some(({ devices }) => devices === true),
    organizations: Boolean(settings.organizations),
    mcp: Boolean(settings.mcp) || Boolean(settings.openIdProvider),
    personal_access_tokens: settings.personalAccessTokens !== undefined,
    mail_senders: (settings.personalMail ?? []).length > 0,
  }
  return allModules.filter((module) => on[module])
}
