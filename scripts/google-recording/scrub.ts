// What the recording keeps of Google's answers: nothing of the real mailbox but the test mail, no token and no client
// credential. Every answer passes `scrub`, then `findLeak` over everything written, before and after writing.

/** The address the recordings give the mailbox, in place of the real one. */
export const mailboxPlaceholder = 'mailbox@example.com'

/** The only domain an address in a recording may have. */
const placeholderDomain = 'example.com'

/** The headers a recorded mail keeps: those the plugin reads and those of the MIME structure; Gmail's own are dropped. */
export const keptHeaders = new Set(['from', 'to', 'cc', 'subject', 'date', 'message-id', 'mime-version', 'content-type', 'content-transfer-encoding', 'content-disposition'])

// Token and credential shapes of Google: access tokens, refresh tokens, client secrets and client ids.
const tokenPatterns = [/ya29\./, /1\/\//, /GOCSPX-/, /\.apps\.googleusercontent\.com/i]

const address = /[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/g

const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** `text` with every `from` replaced by `to`, in any case. */
const replaceAll = (text: string, from: string, to: string) => text.replace(new RegExp(escaped(from), 'gi'), to)

/** Every string in `value`, a raw mail's decoded text among them. */
const strings = (value: unknown, key = ''): string[] => {
  if (typeof value === 'string') return key === 'raw' ? [value, Buffer.from(value, 'base64url').toString('latin1')] : [value]
  if (Array.isArray(value)) return value.flatMap((item) => strings(item))
  if (typeof value === 'object' && value !== null) return Object.entries(value).flatMap(([name, item]) => [name, ...strings(item, name)])
  return []
}

/**
 * What `value` would leak, by kind and never by value: a value of `secrets`, a Google token shape, or an address off
 * the placeholder domain, anywhere in it, a raw mail's decoded text included. Undefined when it leaks nothing.
 */
export const findLeak = (value: unknown, secrets: string[]) => {
  for (const text of strings(value)) {
    if (secrets.some((secret) => secret.length > 0 && text.includes(secret))) return 'a secret value'
    if (tokenPatterns.some((pattern) => pattern.test(text))) return 'a Google token or client shape'
    for (const [, domain] of text.matchAll(address)) if (domain!.toLowerCase() !== placeholderDomain) return 'an address off example.com'
  }
  return
}

/** `value` with every string's `mailbox` replaced by the placeholder. */
const withoutMailbox = (value: unknown, mailbox: string): unknown => {
  if (typeof value === 'string') return replaceAll(value, mailbox, mailboxPlaceholder)
  if (Array.isArray(value)) return value.map((item) => withoutMailbox(item, mailbox))
  if (typeof value === 'object' && value !== null) return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, withoutMailbox(item, mailbox)]))
  return value
}

/**
 * A raw mail (base64url) rebuilt with only the headers of `keptHeaders` at its top and the mailbox's address replaced;
 * the body, which the recording wrote itself, stays. `dropped` names the headers left out, in their order.
 */
export const rebuildRaw = (raw: string, mailbox: string) => {
  const text = Buffer.from(raw, 'base64url').toString('latin1')
  const end = text.search(/\r?\n\r?\n/)
  if (end === -1) throw new Error('The recorded mail has no body')
  const fields = text.slice(0, end).split(/\r?\n(?![ \t])/)
  const dropped: string[] = []
  const kept = fields.filter((field) => {
    const name = field.slice(0, field.indexOf(':')).trim()
    if (keptHeaders.has(name.toLowerCase())) return true
    dropped.push(name)
    return false
  })
  const rebuilt = replaceAll(`${kept.join('\r\n')}${text.slice(end)}`, mailbox, mailboxPlaceholder)
  // Gmail pads its base64url; the rebuilt mail is padded as it would be.
  const encoded = Buffer.from(rebuilt, 'latin1').toString('base64url')
  const padding = raw.endsWith('=') ? '='.repeat((4 - (encoded.length % 4)) % 4) : ''
  return { raw: encoded + padding, dropped }
}

/** The ids of the messages and threads `body` names, wherever it names one. */
const messageRefs = (value: unknown, inMessage = false): { id?: unknown; threadId?: unknown }[] => {
  if (Array.isArray(value)) return value.flatMap((item) => messageRefs(item, inMessage))
  if (typeof value !== 'object' || value === null) return []
  const record = value as Record<string, unknown>
  const own = inMessage || 'threadId' in record ? [{ id: record.id, threadId: record.threadId }] : []
  return [...own, ...Object.entries(record).flatMap(([name, item]) => messageRefs(item, name === 'message' || name === 'messages'))]
}

/** Throws when `body` names a message or thread other than the test mail's: the mailbox holds other mail. */
export const onlyTestMail = (call: string, body: unknown, mail: { id: string; threadId: string }) => {
  for (const ref of messageRefs(body)) {
    if (ref.id !== undefined && ref.id !== mail.id) throw new Error(`${call} lists a message other than the test mail: run the recording again once the mailbox is quiet`)
    if (ref.threadId !== undefined && ref.threadId !== mail.threadId) throw new Error(`${call} lists a thread other than the test mail's: run the recording again once the mailbox is quiet`)
  }
}

/** A Gmail answer as recorded: the mailbox's address replaced, a raw mail rebuilt, a metadata answer's headers kept as a raw one's. */
export const scrubGmail = (body: unknown, mailbox: string) => {
  const replaced = withoutMailbox(body, mailbox) as Record<string, unknown>
  if (typeof replaced.raw === 'string') {
    const { raw, dropped } = rebuildRaw((body as { raw: string }).raw, mailbox)
    return { body: { ...replaced, raw }, dropped }
  }
  const payload = replaced.payload as { headers?: { name: string }[] } | undefined
  if (payload?.headers) {
    const dropped = payload.headers.filter(({ name }) => !keptHeaders.has(name.toLowerCase())).map(({ name }) => name)
    return { body: { ...replaced, payload: { ...payload, headers: payload.headers.filter(({ name }) => keptHeaders.has(name.toLowerCase())) } }, dropped }
  }
  return { body: replaced, dropped: [] }
}

/** `getProfile`'s answer as recorded: the placeholder address, and no count of the real mailbox's mail. */
export const scrubProfile = (body: Record<string, unknown>) => ({ ...body, emailAddress: mailboxPlaceholder, messagesTotal: 1, threadsTotal: 1 })

/** `labels.list`'s answer as recorded: the system labels alone, since a mailbox's own label names are its own. */
export const scrubLabels = (body: { labels?: { type?: string }[] }) => ({ ...body, labels: (body.labels ?? []).filter((label) => label.type === 'system') })

/** The token fields of Google's token answers, which a recording holds only as placeholders. */
export const tokenFields = ['access_token', 'refresh_token', 'id_token', 'token'] as const

/** A token answer as recorded: each token field present holds its placeholder of `placeholders`, or `snapshot-<field>-1`. */
export const scrubTokens = (body: Record<string, unknown>, placeholders: Partial<Record<(typeof tokenFields)[number], string>>) =>
  Object.fromEntries(Object.entries(body).map(([name, value]) => [name, (tokenFields as readonly string[]).includes(name) ? (placeholders[name as (typeof tokenFields)[number]] ?? `snapshot-${name}-1`) : value]))
