import { twoFactor } from 'better-auth/plugins'

/**
 * Better Auth's two-factor plugin, whose second step also follows a sign-in with an emailed code: the plugin asks for
 * it after a password only, and an inbox alone is one factor as well. A passkey is two factors already, so a passkey
 * sign-in is not asked. The plugin's own hook does the work; only the paths it matches grow.
 */
export const twoFactorAfterPasswordOrCode = (options: Parameters<typeof twoFactor>[0]) => {
  const plugin = twoFactor(options)
  const after = plugin.hooks.after.map((hook) => ({ ...hook, matcher: (context: Parameters<typeof hook.matcher>[0]) => hook.matcher(context) || context.path === '/sign-in/email-otp' }))
  return { ...plugin, hooks: { ...plugin.hooks, after } }
}
