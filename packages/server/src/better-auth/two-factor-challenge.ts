import { twoFactor } from 'better-auth/plugins'
import { providerCallbackPaths, secondStepRedirect } from './second-step-redirect'

// The sign-ins besides a password's that are one factor: an emailed code, as an inbox alone is one, a token a
// provider issued, which stands in for one, and a provider's callback, whose own second step the app cannot check.
// Starting a provider's sign-in at `/sign-in/social` signs nobody in yet.
const oneFactorPaths = ['/sign-in/email-otp', '/sign-in/social', ...providerCallbackPaths]

/**
 * Better Auth's two-factor plugin, whose second step also follows a sign-in with an emailed code, a provider's token
 * or a provider's pages: the plugin asks for it after a password only. A passkey is two factors already, so a passkey
 * sign-in is not asked. The plugin's own hook does the work, only the paths it matches grow; after a provider's
 * pages, the browser goes back to the page it came from, which asks for the step (`secondStepRedirect`).
 */
export const twoFactorAfterFirstFactor = (options: Parameters<typeof twoFactor>[0]) => {
  const plugin = twoFactor(options)
  const own = plugin.hooks.after.map((hook) => ({ ...hook, matcher: (context: Parameters<typeof hook.matcher>[0]) => hook.matcher(context) || (context.path !== undefined && oneFactorPaths.includes(context.path)) }))
  const redirect = secondStepRedirect()
  return { ...plugin, hooks: { ...plugin.hooks, after: [redirect.noteLocation, ...own, redirect.sendBack] } }
}
