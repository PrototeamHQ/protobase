import { z } from 'zod'
import { jsonProblem, type JsonObject } from './json-value'
import { tapUrl } from './tap-url'

/** How soon a push service delivers a message, as Web Push names it (RFC 8030); the other senders map it to theirs. */
export const urgencies = ['very-low', 'low', 'normal', 'high'] as const
export type Urgency = (typeof urgencies)[number]

/** The longest a push service keeps an undelivered message: 28 days, the most any of them keeps one. */
export const maxTtlSeconds = 2_419_200

/**
 * What `platform.web` may set beside the common message: the Web Push headers (RFC 8030's TTL, Urgency and Topic) and
 * fields merged into the JSON payload the browser's service worker reads. Nothing else, such as the endpoint or a
 * header of the sender's own.
 */
export type WebPushFields = { ttl?: number; urgency?: Urgency; topic?: string; payload?: JsonObject }

/**
 * A notification as every sender takes it, plain data: `url` is opened on tap (an absolute `http` or `https` URL),
 * `tag` replaces an earlier notification with the same tag, `ttl` is how long in seconds a push service keeps it for a
 * device that is offline, and `platform` holds each protocol's own fields, merged into its request.
 */
export type PushMessage = {
  title: string
  body?: string
  url?: string
  data?: JsonObject
  badge?: number
  sound?: string
  tag?: string
  ttl?: number
  urgency?: Urgency
  platform?: { web?: WebPushFields; apns?: JsonObject; fcm?: JsonObject }
}

/** A message that is not one `pushMessage` accepts: `field` names the part at fault, never its value. */
export class PushMessageError extends Error {
  constructor(readonly field: string) {
    super(`The notification is invalid: ${field}`)
  }
}

const noControls = /^[^\u0000-\u001f\u007f]*$/
// Newlines and tabs are text in a body; other control characters are not.
const noControlsButLines = /^[^\u0000-\u0008\u000b-\u001f\u007f]*$/
// RFC 8030's Topic: at most 32 characters of the base64url alphabet, which fits the APNs and FCM collapse keys too.
const topic = z.string().regex(/^[A-Za-z0-9_-]{1,32}$/)
const ttl = z.number().int().min(0).max(maxTtlSeconds)
const urgency = z.enum(urgencies)
const json = z.custom<JsonObject>((value) => typeof value === 'object' && value !== null && !Array.isArray(value))

const web = z.strictObject({ ttl: ttl.optional(), urgency: urgency.optional(), topic: topic.optional(), payload: json.optional() })

const message = z.strictObject({
  title: z.string().min(1).max(256).regex(noControls),
  body: z.string().max(2048).regex(noControlsButLines).optional(),
  url: z.string().optional(),
  data: json.optional(),
  badge: z.number().int().min(0).max(1_000_000).optional(),
  sound: z.string().min(1).max(256).regex(noControls).optional(),
  tag: topic.optional(),
  ttl: ttl.optional(),
  urgency: urgency.optional(),
  platform: z.strictObject({ web: web.optional(), apns: json.optional(), fcm: json.optional() }).optional(),
})

// The field an issue is about: for a key that is none of the message's, that key under its object.
const issueField = (issue: z.core.$ZodIssue) => {
  const path = issue.code === 'unrecognized_keys' ? [...issue.path, issue.keys[0]!] : issue.path
  return path.join('.') || 'message'
}

/**
 * The message, checked and as a new object, or a `PushMessageError` naming the first field at fault: every field
 * within its format, only plain JSON in the free-form ones, and a `url` that is an absolute `http` or `https` URL,
 * written as the WHATWG parser writes it. Senders check what they are given the same way, since a message is plain
 * data and need not come from here.
 */
export const pushMessage = (input: PushMessage): PushMessage => {
  const problem = jsonProblem(input, '')
  if (problem !== undefined) throw new PushMessageError(problem.slice(1) || 'message')
  const parsed = message.safeParse(input)
  if (!parsed.success) throw new PushMessageError(issueField(parsed.error.issues[0]!))
  const checked = structuredClone(parsed.data) as PushMessage
  if (checked.url === undefined) return checked
  const url = tapUrl(checked.url)
  if (url === undefined) throw new PushMessageError('url')
  return { ...checked, url }
}
