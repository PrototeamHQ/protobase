/**
 * A value as a form shows it: text as it is, an expression (`{% ... %}`) among it, and any other JSON value as JSON;
 * nothing as empty.
 */
export const valueText = (value: unknown) => {
  if (value === undefined) return ''
  if (typeof value === 'string') return value
  return JSON.stringify(value, null, 2)
}

/**
 * What a form's text writes: nothing when empty, JSON when it is a JSON value other than text, and text otherwise, so
 * an address or an expression needs no quotes. Text that reads as a number or `true`, such as `42`, is that value.
 */
export const textValue = (text: string): unknown => {
  if (text.trim() === '') return
  try {
    return JSON.parse(text)
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error
    return text
  }
}
