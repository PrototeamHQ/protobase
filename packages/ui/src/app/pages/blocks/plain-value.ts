/** An `ArrayField` item's value as text, which no field describes: a list or object as JSON, nothing for none. */
export const plainText = (value: unknown) => (value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value))
