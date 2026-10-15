// How a one-time code field's text changes: digits only, at most `length` of them, whatever arrives.

/** The digits of `text`, at most `length`. */
export const digitsOf = (text: string, length: number) => text.replace(/\D/g, '').slice(0, length)

/**
 * The field's new code after an edit left `edited` in it. Text inserted in one go that holds a whole code, as a paste,
 * the keyboard's suggestion or the system's autofill does, is the code, whatever was in the field before; anything else
 * keeps the field's digits.
 */
export const editedCode = (edited: string, inserted: string | null | undefined, length: number) => {
  const whole = digitsOf(inserted ?? '', length)
  return whole.length === length ? whole : digitsOf(edited, length)
}

/**
 * The code after `pasted` went into `code` at box `start`: a whole code replaces the field's, and fewer digits fill the
 * boxes from `start` on, over the digits they held.
 */
export const pastedCode = (code: string, pasted: string, start: number, length: number) => {
  const digits = pasted.replace(/\D/g, '')
  if (digits.length >= length) return digits.slice(0, length)
  return digitsOf(code.slice(0, start) + digits + code.slice(start + digits.length), length)
}
