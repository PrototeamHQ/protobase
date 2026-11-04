/** A value's size as JSON in UTF-8 bytes; nothing (`undefined`) is 0. */
export const jsonBytes = (value: unknown) => (value === undefined ? 0 : new TextEncoder().encode(JSON.stringify(value)).length)
