import { defineConfig } from 'vitest/config'

// Unit tests sit next to the code they test; a new project has none yet.
export default defineConfig({ test: { include: ['**/*.test.ts'], exclude: ['node_modules/**', 'dist/**'], passWithNoTests: true } })
