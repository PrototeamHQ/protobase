import { defineConfig } from 'vitest/config'

// Unit tests sit next to the code they test; a new project has none yet.
// Worker threads, as `bun run` runs vitest on Bun, whose child processes lack the IPC channel vitest's forks pool
// unrefs since 5.1.1.
export default defineConfig({ test: { pool: 'threads', include: ['**/*.test.ts'], exclude: ['node_modules/**', 'dist/**'], passWithNoTests: true } })
