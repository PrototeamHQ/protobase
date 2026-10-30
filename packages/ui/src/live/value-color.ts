import { isBadgeTone, type BadgeTone } from '@protobase/schema'

const declared = (colors: Readonly<Record<string, string>> | undefined, value: unknown) => {
  const key = String(value)
  return colors && Object.hasOwn(colors, key) ? colors[key] : undefined
}

/** The hex colour a view gives a value's badge, if any; a tone name is no colour. */
export const valueColor = (colors: Readonly<Record<string, string>> | undefined, value: unknown) => {
  const color = declared(colors, value)
  return color === undefined || isBadgeTone(color) ? undefined : color
}

/** The tone a view gives a value's badge, `neutral` when it names none. */
export const valueTone = (colors: Readonly<Record<string, string>> | undefined, value: unknown): BadgeTone => {
  const tone = declared(colors, value)
  return tone !== undefined && isBadgeTone(tone) ? tone : 'neutral'
}
