import { cachedFormat } from './intl-cache'

// Times show in the viewer's time zone, the browser's; dates (`YYYY-MM-DD`, no time) have no zone and never shift.

/** The viewer's IANA time zone, such as `Europe/Amsterdam`. */
export const viewerZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

const partsFormats = new Map<string, Intl.DateTimeFormat>()

const partsFormat = (zone: string) => {
  const known = partsFormats.get(zone)
  if (known) return known
  const format = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  partsFormats.set(zone, format)
  return format
}

// The wall clock of `zone` at `ms`, as numbers
const wallClock = (ms: number, zone: string) => {
  const parts = Object.fromEntries(partsFormat(zone).formatToParts(ms).map((part) => [part.type, part.value]))
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day), hour: Number(parts.hour), minute: Number(parts.minute), second: Number(parts.second) }
}

/** How far `zone`'s clock is ahead of UTC at `ms`, in milliseconds: 7 200 000 for Amsterdam in summer. */
export const zoneOffset = (ms: number, zone: string) => {
  const clock = wallClock(ms, zone)
  const asUtc = Date.UTC(clock.year, clock.month - 1, clock.day, clock.hour, clock.minute, clock.second)
  return asUtc - Math.floor(ms / 1000) * 1000
}

const pad = (value: number) => String(value).padStart(2, '0')

/** The day `ms` falls on in `zone`, as `YYYY-MM-DD`. */
export const dayIn = (ms: number, zone: string) => {
  const clock = wallClock(ms, zone)
  return `${clock.year}-${pad(clock.month)}-${pad(clock.day)}`
}

/** The instant `zone`'s clock reads `wall`, a wall-clock time written as if it were UTC milliseconds. */
export const instantAt = (wall: number, zone: string) => {
  // The offset at `wall` read as UTC is right unless the zone changes its clock in the hours between; a second pass fixes that
  const guess = wall - zoneOffset(wall, zone)
  return wall - zoneOffset(guess, zone)
}

/** The instant `day` (`YYYY-MM-DD`) starts in `zone`: its local midnight. */
export const startOfDayIn = (day: string, zone: string) => instantAt(Date.parse(`${day}T00:00:00Z`), zone)

/** The zone a time is shown in, as its hover label says: "Europe/Amsterdam (GMT+2)", or "UTC". */
export const zoneLabel = (ms: number, zone: string) => {
  const named = cachedFormat(`zoneName:${zone}`, (tag) => new Intl.DateTimeFormat(tag, { timeZone: zone, timeZoneName: 'shortOffset' }))
  const name = named.formatToParts(ms).find((part) => part.type === 'timeZoneName')?.value ?? zone
  return zone === 'UTC' || zone === 'Etc/UTC' ? 'UTC' : `${zone} (${name})`
}
