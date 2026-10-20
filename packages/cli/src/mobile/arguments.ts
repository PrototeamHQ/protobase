import { InvalidArgumentError } from 'commander'
import { platforms, type Platform } from './platform'

/** The `<platform>` argument: ios or android. */
export const parsePlatform = (value: string): Platform => {
  if ((platforms as readonly string[]).includes(value)) return value as Platform
  throw new InvalidArgumentError('expected ios or android')
}

/** A `--port` option: digits only, from 1 to 65535, as a number, so no other text reaches a URL or Capacitor. */
export const parsePort = (value: string) => {
  const number = /^\d{1,5}$/.test(value) ? Number(value) : 0
  if (number < 1 || number > 65535) throw new InvalidArgumentError('expected a port from 1 to 65535')
  return number
}
