import { defineConfig } from 'vitest/config'

// The unit tests next to the config and the seed; none of them needs a database.
// Worker threads, as `bun run` runs vitest on Bun, whose child processes lack the IPC channel vitest's forks pool
// unrefs since 5.1.1.
export default defineConfig({ test: { pool: 'threads', include: ['config/**/*.test.ts', 'seed/**/*.test.ts'] } })
