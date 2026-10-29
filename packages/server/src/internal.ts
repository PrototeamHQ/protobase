// `@protobase/server/internal`: what the @protobase packages build an app with at serve time from its config, which a
// project's own code does not call: the app's pool, Better Auth, the authenticator, file providers and the built-in
// extensions' parts.
export { appPool, longQueryPool } from './app-pool'
export { buildAuth, createAuth, loadAuthPlugins, type AuthPlugins } from './better-auth/create-auth'
export { appAuthOptions, buildAppAuth, type AppAuthInput } from './better-auth/auth-settings'
export { betterAuthAuthenticator } from './better-auth/authenticator'
export { buildAuthenticator } from './better-auth/authenticate-settings'
export { localFiles } from './files/local-files'
export { s3Files } from './files/s3-files'
export { fileProviderOf } from './files/provider-settings'
export { webhooksModule } from './webhooks/table/webhooks-module'
export { checkNotificationsOptions } from './notifications/options'
export { checkCallsOptions } from './calls/calls-options'
export { isSubscription } from './webhooks/subscription'
export { declaredJob } from './jobs/declared-job'
