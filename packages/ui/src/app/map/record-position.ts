/** A point in decimal degrees (WGS84), as a map is centred on it. */
export type Position = { latitude: number; longitude: number }

/** A number field's value: it comes as a number, or as text for a decimal or bigint; anything else, or an empty value, is none. */
export const numeric = (value: unknown) => {
  if (typeof value === 'number') return value
  if (typeof value !== 'string' || value.trim() === '') return undefined
  return Number(value)
}

/** The record's position from its two fields, when both hold degrees on the globe; none otherwise, so no map is drawn. */
export const recordPosition = (record: Record<string, unknown>, fields: { latitude: string; longitude: string }): Position | undefined => {
  const latitude = numeric(record[fields.latitude])
  const longitude = numeric(record[fields.longitude])
  if (latitude === undefined || longitude === undefined) return undefined
  if (!(Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180)) return undefined
  return { latitude, longitude }
}
