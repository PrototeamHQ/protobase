/** The names of the parameters in the webhook addresses. */
export const webhookParams = { workflow: 'workflow', key: 'key' } as const

/** Where a workflow's webhook URL is issued, `POST <systemPath>/workflows/<id>/webhook`; the route's pattern without an id. */
export const webhookIssuePath = (systemPath: string, workflow = `:${webhookParams.workflow}`) => `${systemPath}/workflows/${workflow}/webhook`

/** Where the webhook addresses live, the route the public address is mounted at. */
export const hooksBase = (systemPath: string) => `${systemPath}/workflows/hooks`

/** The public address a webhook trigger is called at, `<systemPath>/workflows/hooks/<key>`; the route's pattern without a key. */
export const hookPath = (systemPath: string, key = `:${webhookParams.key}`) => `${hooksBase(systemPath)}/${key}`

/** `text` with the key of every webhook address in it replaced by `[key]`, for a request log: the key opens the URL. */
export const redactHookKeys = (text: string) => text.replace(/\/workflows\/hooks\/[^/\s?#]+/g, '/workflows/hooks/[key]')
