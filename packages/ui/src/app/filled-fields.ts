/** The fields of `names` with a value in `record`: an empty one, null or an empty text, is left out, never shown as `—`. */
export const filledFields = (record: Record<string, unknown>, names: readonly string[]) => names.filter((name) => record[name] !== null && record[name] !== undefined && record[name] !== '')
