/** A point in decimal degrees (WGS84), as a map is centred on it. */
export type Position = { latitude: number; longitude: number }

// A number field comes as a number, or as text for a decimal or bigint; anything else, or an empty value, is no degree.
const degrees = (value: unknown) => {
  if (typeof value === 'number') return value
  if (typeof value !== 'string' || value.trim() === '') return undefined
  return Number(value)
}

/** The record's position from its two fields, when both hold degrees on the globe; none otherwise, so no map is drawn. */
export const recordPosition = (record: Record<string, unknown>, fields: { latitude: string; longitude: string }): Position | undefined => {
  const latitude = degrees(record[fields.latitude])
  const longitude = degrees(record[fields.longitude])
  if (latitude === undefined || longitude === undefined) return undefined
  if (!(Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180)) return undefined
  return { latitude, longitude }
}
