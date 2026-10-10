import { checkedUrl } from '../assistant/assistant-settings'

/**
 * `url`: the endpoint that reports the app's runtime version and updates it, such as a hosting platform's. The top
 * bar shows an update button from what it answers. Falls back to `PROTOBASE_RUNTIME_URL`.
 */
export type RuntimeOptions = { url?: string }

export const runtimeVariable = 'PROTOBASE_RUNTIME_URL'

/** Only an admin sees the runtime endpoint: `/meta` names it to nobody else. */
export const seesRuntime = (roles: readonly string[]) => roles.includes('admin')

/** The runtime endpoint, when one is set and the option is not `false`. A value that is no http(s) URL stops the server at startup. */
export const runtimeUrl = (option: RuntimeOptions | false | undefined, env: Record<string, string | undefined>) => {
  if (option === false) return undefined
  const url = (option?.url ?? env[runtimeVariable])?.trim()
  if (!url) return undefined
  return checkedUrl(url, option?.url === undefined ? runtimeVariable : 'options.runtime.url')
}
