import { existsSync } from 'node:fs'
import path from 'node:path'

// Loads the nearest .env at or above `from`; variables already set in the environment win.
export const loadNearestEnvFile = (from: string) => {
  for (let dir = from; ; dir = path.dirname(dir)) {
    const file = path.join(dir, '.env')
    if (existsSync(file)) {
      process.loadEnvFile(file)
      return file
    }
    if (path.dirname(dir) === dir) return undefined
  }
}
