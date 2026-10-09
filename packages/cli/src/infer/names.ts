const words = (name: string) => name.split(/[^A-Za-z0-9]+/).filter(Boolean)

const capitalize = (word: string) => word.charAt(0).toUpperCase() + word.slice(1)

const lowerFirst = (word: string) => word.charAt(0).toLowerCase() + word.slice(1)

const identifier = (name: string) => (/^[0-9]/.test(name) ? `c${name}` : name)

// snake_case, SCREAMING_CASE and quoted camelCase identifiers all become a camelCase field name.
export const camelCase = (name: string) => {
  const parts = words(name)
  if (parts.length === 0) throw new Error(`Cannot derive a field name from "${name}"`)
  const mixed = /[a-z]/.test(name) && /[A-Z]/.test(name)
  if (mixed && parts.length === 1) return identifier(lowerFirst(parts[0]!))
  const [first, ...rest] = parts.map((part) => part.toLowerCase())
  return identifier(first + rest.map(capitalize).join(''))
}

export const singular = (word: string) => {
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`
  if (/(sses|xes|ches|shes)$/.test(word)) return word.slice(0, -2)
  if (word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us')) return word.slice(0, -1)
  return word
}

// "order_lines" -> "Order lines" / "Order line".
export const humanize = (name: string) => {
  const parts = words(name.replace(/([a-z0-9])([A-Z])/g, '$1 $2')).map((part) => part.toLowerCase())
  return capitalize(parts.join(' '))
}

export const humanizeSingular = (name: string) => {
  const parts = humanize(name).split(' ')
  return [...parts.slice(0, -1), singular(parts.at(-1)!.toLowerCase())].join(' ').replace(/^./, (c) => c.toUpperCase())
}
