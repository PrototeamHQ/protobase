import type { MailSenders } from '@protobase/client'
import { senderOptions, type SenderOption } from './sender-options'

type Reader = { owner: string; mailSenders: () => Promise<MailSenders> }

// The latest read alone, for half a minute: every mail sender field of a page shares it, and a field shown after a
// change elsewhere reads again soon.
const freshMs = 30_000
let latest: { owner: string; at: number; read: Promise<SenderOption[]> } | undefined

// The mounted fields, which read again when the person changes their addresses.
const mounted = new Set<() => void>()

/** The addresses `owner` may send from, as a mail sender field offers them, shared with every field that asks within half a minute. */
export const readSenderOptions = ({ owner, mailSenders }: Reader) => {
  if (latest && latest.owner === owner && Date.now() - latest.at < freshMs) return latest.read
  const read = mailSenders().then(senderOptions)
  latest = { owner, at: Date.now(), read }
  // A failed read is not kept: the field that asked shows the failure, and the next one reads again.
  read.then(undefined, () => {
    if (latest?.read === read) latest = undefined
  })
  return read
}

/** Calls `reread` on each `forgetSenderOptions` until the returned function is called, as a mounted field does. */
export const onForgetSenderOptions = (reread: () => void) => {
  mounted.add(reread)
  return () => void mounted.delete(reread)
}

/** Drops the shared read, and has every mounted mail sender field read again: after the person adds, changes or removes an address. */
export const forgetSenderOptions = () => {
  latest = undefined
  for (const reread of mounted) reread()
}
