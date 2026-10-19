import { Fragment, type ReactNode } from 'react'

/**
 * A built-in text with a `{}` for each element that goes in it, such as a highlighted address, rendered with the
 * elements in their places in order: each language puts them where its sentence needs them.
 */
export const slotted = (message: string, ...slots: ReactNode[]) => {
  const parts = message.split('{}')
  if (parts.length !== slots.length + 1) throw new Error(`The text "${message}" has ${parts.length - 1} places for ${slots.length} elements`)
  return (
    <>
      {parts.map((part, index) => (
        <Fragment key={index}>
          {part}
          {index < slots.length && slots[index]}
        </Fragment>
      ))}
    </>
  )
}
