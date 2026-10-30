import { badRequest } from '../problem'

/** The longest name a guest gives, in characters. */
export const maxGuestNameLength = 60

/** The name a guest gives, trimmed: 1 to 60 characters, none of them a control or format character. */
export const guestName = (value: unknown) => {
  const name = typeof value === 'string' ? value.trim() : ''
  if (name.length === 0 || [...name].length > maxGuestNameLength) throw badRequest('guest-name', `Give a name of 1 to ${maxGuestNameLength} characters`)
  if (/\p{C}/u.test(name)) throw badRequest('guest-name', 'A name cannot hold control characters')
  return name
}
