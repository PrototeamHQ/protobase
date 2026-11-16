import { twoFactor } from 'better-auth/plugins'

// The sign-ins besides a password's that are one factor: an emailed code, as an inbox alone is one, and a token a
// provider issued, which stands in for one. Starting a provider's sign-in at the same path signs nobody in yet.
const oneFactorPaths = ['/sign-in/email-otp', '/sign-in/social']

/**
 * Better Auth's two-factor plugin, whose second step also follows a sign-in with an emailed code or a provider's
 * token: the plugin asks for it after a password only. A passkey is two factors already, so a passkey sign-in is not
 * asked. The plugin's own hook does the work; only the paths it matches grow.
 */
export const twoFactorAfterPasswordOrCode = (options: Parameters<typeof twoFactor>[0]) => {
  const plugin = twoFactor(options)
  const after = plugin.hooks.after.map((hook) => ({ ...hook, matcher: (context: Parameters<typeof hook.matcher>[0]) => hook.matcher(context) || (context.path !== undefined && oneFactorPaths.includes(context.path)) }))
  return { ...plugin, hooks: { ...plugin.hooks, after } }
}
