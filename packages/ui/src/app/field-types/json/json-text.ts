/** Text that is no JSON value. */
export const notJson = Symbol('not JSON')

/** The JSON value a text holds: null for none, `notJson` when it does not parse. */
export const jsonOf = (text: string): unknown => {
  if (text.trim() === '') return null
  try {
    return JSON.parse(text)
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error
    return notJson
  }
}
