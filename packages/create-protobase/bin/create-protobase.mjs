#!/usr/bin/env node
import { run } from '../dist/index.js'

await run(process.argv)
// On a Supabase database the project's auth is opened, which keeps a connection pool open.
process.exit()
