import type { DurationLiteral, DurationUnit } from '../model'

export const parseDurationText = (text: string): DurationLiteral => {
  const match = /^(\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)([smhdw])$/.exec(text)
  if (!match) throw new Error(`Invalid duration "${text}", expected for example 30d or 1.5h`)
  return {
    kind: 'duration',
    amount: Number(match[1]),
    unit: match[2] as DurationUnit,
    span: { start: 0, end: 0 },
  }
}
