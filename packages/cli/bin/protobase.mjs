#!/usr/bin/env node
import { fileURLToPath } from 'node:url'
import { runHandingOver } from '../dist/hand-over.js'

await runHandingOver(fileURLToPath(new URL('..', import.meta.url)), async () => (await import('../dist/index.js')).run, process.argv)
