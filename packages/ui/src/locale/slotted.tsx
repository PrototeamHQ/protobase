import type { ReactNode } from 'react'

/**
 * A built-in text with `{}` where an element goes, such as a highlighted address, rendered with the element in its
 * place: each language puts it where its sentence needs it.
 */
export const slotted = (message: string, slot: ReactNode) => {
  const at = message.indexOf('{}')
  if (at < 0) throw new Error(`The text "${message}" has no {} for its element`)
  return (
    <>
      {message.slice(0, at)}
      {slot}
      {message.slice(at + 2)}
    </>
  )
}
