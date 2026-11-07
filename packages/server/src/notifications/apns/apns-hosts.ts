import type { ApnsEnvironment } from '../device'

// The two APNs origins: development builds' tokens belong to the sandbox, App Store and TestFlight builds' to production.
const origins: Record<ApnsEnvironment, string> = {
  sandbox: 'https://api.sandbox.push.apple.com',
  production: 'https://api.push.apple.com',
}

/** The APNs origin of a device's environment, or `undefined` when it is neither `sandbox` nor `production`. */
export const apnsOrigin = (environment: unknown) => (typeof environment === 'string' && Object.hasOwn(origins, environment) ? origins[environment as ApnsEnvironment] : undefined)
