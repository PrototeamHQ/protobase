/** A topic: a lowercase letter, then lowercase letters, digits, `_` and `-`, at most 63 characters, such as `newsletter`. */
const topicPattern = /^[a-z][a-z0-9_-]{0,62}$/

/** A plain address with one recipient, as `PROTOBASE_MAIL_FROM` takes one: bulk mail goes to one recipient a message. */
const plainAddress = /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/

/**
 * Refuses bulk mail that cannot carry its unsubscribe: no `topic`, or a topic that is not a plain name. Transactional
 * mail (no `bulk`) is not checked: its topic, when it has one, only names it.
 */
export const checkBulkOptions = (name: string, { bulk, topic }: { bulk?: boolean; topic?: string }) => {
  if (!bulk) return
  if (topic === undefined) throw new Error(`${name} is bulk mail without a topic: give it a topic, such as topic: 'newsletter', which its recipients unsubscribe from`)
  if (!topicPattern.test(topic)) throw new Error(`${name} has the topic "${topic}": a topic is a lowercase letter, then lowercase letters, digits, "_" and "-", at most 63 characters`)
}

/** The one recipient of a bulk message, lower-cased; a list or a named address is refused, since each recipient gets a link of their own. */
export const bulkRecipient = (to: string) => {
  const address = to.trim()
  if (!plainAddress.test(address)) throw new Error(`Bulk mail goes to one plain address a message, each with its own unsubscribe link, not "${to}": send one message per recipient`)
  return address.toLowerCase()
}

/**
 * Refuses a bulk message that reached a transport without the app's unsubscribe layer (`bulkMailer`), which would
 * send it without its unsubscribe: such as a template's `send` without a job's `mail`, or from someone's own mailbox.
 */
export const refuseUnlinkedBulk = (bulk: boolean | undefined) => {
  if (bulk) throw new Error("Bulk mail is sent with a job's mail, which adds its unsubscribe: pass the job's context.mail")
}
