import { defineConfig } from 'vitest/config'

// The unit tests next to the config, the jobs, the emails, the seed and the map tiles; none of them needs a database.
export default defineConfig({ test: { include: ['config/**/*.test.ts', 'jobs/**/*.test.ts', 'emails/**/*.test.ts', 'seed/**/*.test.ts', 'map/**/*.test.ts'] } })
