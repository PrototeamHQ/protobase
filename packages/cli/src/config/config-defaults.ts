import type { ConfigCommand } from '@protobase/config'
import type { MergedConfig } from './merge-config'

const listOf = (text: string | undefined) => text?.split(',').map((part) => part.trim()).filter(Boolean)

/**
 * The merged config with Protobase's defaults filled in where it leaves a key out:
 *
 * - `url`: `PROTOBASE_URL`, or in `protobase dev` the dev server's own address;
 * - `secret`: `PROTOBASE_SECRET`;
 * - `previousSecrets`: `PROTOBASE_PREVIOUS_SECRETS`, comma separated;
 * - `auth`: on, with its own defaults, unless it is `false` or `authenticate.jwksUrl` trusts an auth server elsewhere;
 * - `auth.trustedOrigins`: `PROTOBASE_TRUSTED_ORIGINS`, comma separated.
 *
 * The other keys' defaults are the API's own, applied where they are used (`apiPath` `/api/v1`, `timezone` UTC, ...).
 */
export const withDefaults = (config: MergedConfig, command: ConfigCommand, env: Record<string, string | undefined>): MergedConfig => {
  const url = config.url ?? (env.PROTOBASE_URL?.trim() || undefined) ?? (command === 'dev' ? env.PROTOBASE_DEV_URL : undefined)
  const secret = config.secret ?? (env.PROTOBASE_SECRET?.trim() || undefined)
  const previousSecrets = config.previousSecrets ?? listOf(env.PROTOBASE_PREVIOUS_SECRETS)
  const authOn = config.auth !== false && (config.auth !== undefined || !config.authenticate?.jwksUrl)
  const trustedOrigins = listOf(env.PROTOBASE_TRUSTED_ORIGINS)
  const { auth: _, ...rest } = config
  return {
    ...rest,
    ...(url && { url }),
    ...(secret && { secret }),
    ...(previousSecrets?.length && { previousSecrets }),
    ...(authOn && { auth: { ...(trustedOrigins && { trustedOrigins }), ...(config.auth || {}) } }),
  }
}
