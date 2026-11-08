/** The names of the parameters in the webhook addresses. */
export const webhookParams = { workflow: 'workflow', key: 'key' } as const

/** Where a workflow's webhook URL is issued, `POST <systemPath>/workflows/<id>/webhook`; the route's pattern without an id. */
export const webhookIssuePath = (systemPath: string, workflow = `:${webhookParams.workflow}`) => `${systemPath}/workflows/${workflow}/webhook`

/** Where the webhook addresses live, the route the public address is mounted at. */
export const hooksBase = (systemPath: string) => `${systemPath}/workflows/hooks`

/** The public address a webhook trigger is called at, `<systemPath>/workflows/hooks/<key>`; the route's pattern without a key. */
export const hookPath = (systemPath: string, key = `:${webhookParams.key}`) => `${hooksBase(systemPath)}/${key}`

const hookAddress = /\/workflows\/hooks\/[^/?#]+/g

// Each run of percent escapes decoded as the router decodes a path, a run that is no valid UTF-8 left as it is.
const decodedEscapes = (part: string) =>
  part.replace(/(?:%[0-9A-Fa-f]{2})+/g, (escapes) => {
    try {
      return decodeURI(escapes)
    } catch (error) {
      if (!(error instanceof URIError)) throw error
      return escapes
    }
  })

/**
 * `text` with the key of every webhook address in it replaced by `[key]`, for a request log: the key opens the URL. A
 * word of the line is read decoded as the router reads it, so an address written with escapes is redacted too.
 */
export const redactHookKeys = (text: string) =>
  text.replace(/\S+/g, (part) => {
    const decoded = decodedEscapes(part)
    const redacted = decoded.replace(hookAddress, '/workflows/hooks/[key]')
    return redacted === decoded ? part : redacted
  })
