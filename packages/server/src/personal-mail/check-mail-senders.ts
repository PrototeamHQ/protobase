import type { RequestAccess } from '../request-access'
import type { Row } from '../types'
import { fail, type FieldError } from '../validate-body'
import type { MailSender } from './mail-sender'

const sameAddress = (a: unknown, b: unknown) => typeof a === 'string' && typeof b === 'string' && a.trim().toLowerCase() === b.trim().toLowerCase()

// In English, as every field error of a write is: a form words it in its own language from the code and `address`.
const refused = (field: string, address: string): FieldError => ({
  field,
  code: 'invalid-value',
  message: `You can't send from ${address}. Add it in the Mailbox section of your Account page first.`,
  params: { address },
})

/**
 * Mail sender values (`f.mailSender()`) of a validated create or update body, made ready to store: an address the
 * saving person may send mail from (`personalMail.senders()`, as sending decides) is stored as their sender spells it,
 * `null` clears the field, and an update that gives the stored address again, in any case, leaves it as it is, offered
 * or not. Any other address is refused, so a record holds only an address its writer could send from.
 */
export const checkMailSenders = async (access: RequestAccess, values: Row, current?: Row): Promise<Row> => {
  const result = { ...values }
  const changed: string[] = []
  for (const [name, value] of Object.entries(values)) {
    if (access.full.fields[name]?.type !== 'mail_sender' || value === null) continue
    if (current && sameAddress(value, current[name])) delete result[name]
    else changed.push(name)
  }
  if (changed.length === 0) return result

  // A visitor has no mailbox, and neither has anyone on an app without personal mail.
  const { session, deps } = access
  const senders: MailSender[] = deps.mailSenders && !session.anonymous ? await deps.mailSenders(String(session.user.id)) : []
  const errors: FieldError[] = []
  for (const name of changed) {
    const address = String(values[name])
    const sender = senders.find((candidate) => sameAddress(candidate.address, address))
    if (sender?.address) result[name] = sender.address
    else errors.push(refused(name, address))
  }
  if (errors.length > 0) throw fail(errors)
  return result
}
