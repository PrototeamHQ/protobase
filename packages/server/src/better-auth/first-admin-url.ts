import { checkedUrl } from '../checked-url'

export const firstAdminUrlVariable = 'PROTOBASE_FIRST_ADMIN_URL'

/**
 * Where the app's first user is added when the platform hosting it does that, such as its console's page for the app,
 * from `PROTOBASE_FIRST_ADMIN_URL`. The no-users page then links there in place of the `protobase users create`
 * command, which only someone on the host can run. A value that is no http(s) URL stops the server at startup.
 */
export const firstAdminUrl = (env: Record<string, string | undefined>) => {
  const url = env[firstAdminUrlVariable]?.trim()
  if (!url) return undefined
  return checkedUrl(url, firstAdminUrlVariable)
}
