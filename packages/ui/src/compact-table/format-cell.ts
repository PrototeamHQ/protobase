/** A cell as text: `null` stays visible, objects and arrays as JSON. */
export const formatCell = (value: unknown) => {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}
