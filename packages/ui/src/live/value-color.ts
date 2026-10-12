/** The colour a view gives a value's badge, if any. */
export const valueColor = (colors: Readonly<Record<string, string>> | undefined, value: unknown) => {
  const key = String(value)
  return colors && Object.hasOwn(colors, key) ? colors[key] : undefined
}
